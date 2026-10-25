import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ART_DIRECTION } from "../art-direction";
import { CHOICES, INITIAL_CONTEXT, type ImageApproach, type Metrics, type ScriptPanel } from "../contracts";
import { BibleSchema, EventSchema, NodeSchema, PanelSchema, RunSchema, type Bible, type Chapter, type Failure, type GenerationEvent, type Limits, type Models, type Panel, type Run, type Snapshot, type StoryNode, type StoryTemplate } from "./contracts";
import { withFailurePhase } from "./failure-diagnostics";
import { EngineError } from "./errors";
import { PRICES, reservation, summarize, usageCost } from "./cost";
import { applyChapter, initialState, validateStoryTemplate } from "./state";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";
import { assertContentAvailable, isContentDeleted, safeDatabaseFile, withContentWriteLock } from "../content-management/gate";
import { writeManagedAsset } from "../content-management/files";

const firstOptions = ["activate", "destroy", "investigate"];
export type TemplateAssetInput = { id: string; bytes: Buffer; mime: string; purpose: string };
export type TemplateInput = { template: StoryTemplate; assets: TemplateAssetInput[] };
export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const data = <T>(row: Record<string, unknown> | undefined, schema: z.ZodType<T>): T => {
  if (!row) throw new EngineError("not_found", "This local story record was not found.", 404);
  return schema.parse(JSON.parse(z.string().parse(row.document)) as unknown);
};

export class StoryStore {
  private db: DatabaseSync;
  readonly now: () => number;
  readonly leaseMs: number;
  readonly directory: string;
  constructor(directory: string, options: { now?: () => number; leaseMs?: number } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = realpathSync(directory); this.now = options.now ?? Date.now; this.leaseMs = options.leaseMs ?? 240_000;
    const filename = safeDatabaseFile(this.directory, "stories.sqlite"); const existed = existsSync(filename);
    this.db = new DatabaseSync(filename, { timeout: 5000 }); if (!existed) chmodSync(filename, 0o600);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version > SCHEMA_VERSION) { this.db.close(); throw new EngineError("schema_version", "The local database was created by a newer version. Preserve it and use the matching application.", 500); }
    if (version === 0) this.transaction(() => this.db.exec(SCHEMA_SQL));
  }
  close() { if (this.db.isOpen) this.db.close(); }
  private transaction<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    return withContentWriteLock(this.directory, work, this.db);
  }
  private run(id: string) { assertContentAvailable(this.directory, "run", id); return data(this.db.prepare("SELECT document FROM story_runs WHERE id=?").get(id), RunSchema); }
  private node(id: string) { return data(this.db.prepare("SELECT document FROM story_nodes WHERE id=?").get(id), NodeSchema); }
  private panel(id: string) { return data(this.db.prepare("SELECT document FROM comic_panels WHERE id=?").get(id), PanelSchema); }
  private event(id: string) { return data(this.db.prepare("SELECT document FROM generation_events WHERE id=?").get(id), EventSchema); }
  private events(runId: string) { return this.db.prepare("SELECT document FROM generation_events WHERE run_id=? ORDER BY rowid").all(runId).map((row) => data(row, EventSchema)); }
  private saveRun(run: Run) { this.db.prepare("UPDATE story_runs SET document=? WHERE id=?").run(JSON.stringify(RunSchema.parse(run)), run.id); }
  private saveNode(node: StoryNode) { this.db.prepare("UPDATE story_nodes SET document=? WHERE id=?").run(JSON.stringify(NodeSchema.parse(node)), node.id); }
  private savePanel(panel: Panel) { this.db.prepare("UPDATE comic_panels SET document=? WHERE id=?").run(JSON.stringify(PanelSchema.parse(panel)), panel.id); }
  private saveEvent(event: GenerationEvent) { this.db.prepare("UPDATE generation_events SET panel_id=?,status=?,document=? WHERE id=?").run(event.panel_id, event.status, JSON.stringify(EventSchema.parse(event)), event.id); }
  private assertOwned(runId: string, node: StoryNode) { if (node.run_id !== runId) throw new EngineError("not_found", "Record does not belong to this run.", 404); }

  safePath(relative: string, mustExist = true): string {
    if (!/^(?:references\/[a-f0-9]{64}\.(?:png|jpg|webp|svg|md)|images\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg)$/.test(relative)) throw new EngineError("invalid_asset_path", "Invalid local asset path.", 400);
    const target = path.resolve(this.directory, relative);
    const actual = mustExist ? realpathSync(target) : realpathSync(path.dirname(target));
    if (!actual.startsWith(`${this.directory}${path.sep}`)) throw new EngineError("invalid_asset_path", "Asset path escapes the local data directory.", 400);
    return target;
  }
  private writeAtomic(relative: string, bytes: Buffer) {
    const target = path.resolve(this.directory, relative);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    this.safePath(relative, false);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, target);
    const parent = openSync(path.dirname(target), "r");
    try { fsyncSync(parent); } finally { closeSync(parent); }
  }
  private seedBible(): Bible {
    const sources = [
      ["kael_reference", "public/kael-reference.png", "image/png", "Immutable original Kael/style reference"],
      ["opening", "public/neon-protocol.svg", "image/svg+xml", "Fixed opening illustration"],
      ["character_bible", "references/visual/kael-character-bible.md", "text/markdown", "Immutable identity bible"],
      ["art_guide", "references/visual/art-direction.md", "text/markdown", "Immutable visual language"],
      ["narrative_bible", "references/narrative/neon-protocol.md", "text/markdown", "Initial story reference"],
    ];
    const assets = sources.map(([id, source, mime, purpose]) => {
      const bytes = readFileSync(path.join(process.cwd(), source)); const sha256 = hash(bytes); const relative = `references/${sha256}${path.extname(source)}`;
      if (!existsSync(path.join(this.directory, relative))) this.writeAtomic(relative, bytes);
      if (hash(readFileSync(this.safePath(relative))) !== sha256) throw new EngineError("reference_corrupt", "A saved immutable reference was changed. Restore it from a backup before generating.", 500);
      return { id, path: relative, sha256, mime, purpose };
    });
    const body = { title: "Neon Protocol" as const, opening: INITIAL_CONTEXT, character_bible: readFileSync(this.safePath(assets.find((asset) => asset.id === "character_bible")!.path), "utf8"), art_direction: ART_DIRECTION, device_anchor: "Palm-sized black square device with cyan core; its condition follows saved state. Never restore a destroyed device silently.", setting_anchor: "Abandoned transit station, New Kyoto, 2089. Rain, geometric midnight-blue city, cyan surveillance. Continue in the same time and place unless a causal event explicitly moves the scene.", assets };
    const bible = BibleSchema.parse({ ...body, id: `neon-${hash(JSON.stringify(body))}` });
    this.db.prepare("INSERT OR IGNORE INTO stories(id,document) VALUES(?,?)").run(bible.id, JSON.stringify(bible));
    return bible;
  }
  private prepareTemplate(input: TemplateInput) {
    const template = validateStoryTemplate(input.template);
    if (template.status !== "ready") throw new EngineError("template_not_ready", "This story is not ready to play.", 400);
    if (input.assets.length > 16 || new Set(input.assets.map(asset => asset.id)).size !== input.assets.length) throw new EngineError("invalid_template_assets", "Story assets must be bounded and have unique IDs.", 400);
    const extensions: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg", "text/markdown": ".md" };
    const files = input.assets.map(asset => {
      if (!/^[a-z][a-z0-9_-]{0,59}$/.test(asset.id) || !extensions[asset.mime] || asset.bytes.length === 0 || asset.bytes.length > 20 * 1024 * 1024) throw new EngineError("invalid_template_assets", "A story asset has an invalid ID, format or size.", 400);
      const sha256 = hash(asset.bytes);
      return { bytes: asset.bytes, asset: { id: asset.id, path: `references/${sha256}${extensions[asset.mime]}`, sha256, mime: asset.mime, purpose: asset.purpose } };
    });
    for (const id of [template.cover_asset_id, ...template.opening_beats.map(beat => beat.asset_id), ...template.reference_asset_ids]) {
      const asset = files.find(file => file.asset.id === id)?.asset;
      if (!asset || !asset.mime.startsWith("image/") || template.reference_asset_ids.includes(id) && !["image/png", "image/jpeg", "image/webp"].includes(asset.mime)) throw new EngineError("invalid_template_assets", "A required story image or raster reference is missing.", 400);
    }
    const body = { title: template.title, opening: template.premise, character_bible: template.character_bible, art_direction: template.art_direction, device_anchor: template.object_anchor, setting_anchor: template.setting_anchor, assets: files.map(file => file.asset), template };
    return { bible: BibleSchema.parse({ ...body, id: `story-${hash(JSON.stringify(body))}` }), files };
  }
  createRun(input: { operation_id: string; approach: ImageApproach; template_id?: string; template_version?: number }, models: Models, limits: Limits, bundle?: TemplateInput): Run {
    return this.transaction(() => {
      assertContentAvailable(this.directory, "run_operation", input.operation_id);
      if (bundle) assertContentAvailable(this.directory, "template", bundle.template.id);
      if (!bundle && (input.template_id != null || input.template_version != null)) throw new EngineError("template_not_found", "Select an available local story template.", 404);
      const prepared = bundle ? this.prepareTemplate(bundle) : null;
      if (prepared && (input.template_id != null && input.template_id !== prepared.bible.template!.id || input.template_version != null && input.template_version !== prepared.bible.template!.version)) throw new EngineError("template_conflict", "The selected template version does not match its saved foundation.", 400);
      if (input.approach === "reference" && prepared?.bible.template?.reference_asset_ids.length === 0) throw new EngineError("reference_missing", "This story has no reference images. Explicitly choose text-only illustration mode.", 400);
      const old = this.db.prepare("SELECT document FROM story_runs WHERE operation_id=?").get(input.operation_id);
      if (old) { const run = data(old, RunSchema); const previous = data(this.db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id), BibleSchema); if (run.approach !== input.approach || (prepared ? run.story_id !== prepared.bible.id : Boolean(previous.template))) throw new EngineError("operation_conflict", "This operation ID already created a run with different settings or story."); return run; }
      let bible: Bible;
      if (prepared) {
        const previous = this.db.prepare("SELECT id FROM stories WHERE json_extract(document,'$.template.id')=? AND json_extract(document,'$.template.version')=?").all(prepared.bible.template!.id, prepared.bible.template!.version);
        if (previous.some(row => row.id !== prepared.bible.id)) throw new EngineError("template_version_conflict", "This template version is already immutable. Save changes as a new version.", 409);
        for (const file of prepared.files) {
          if (!existsSync(path.join(this.directory, file.asset.path))) writeManagedAsset(this.directory, { owner_kind: "template", owner_id: prepared.bible.template!.id, path: file.asset.path, bytes: file.bytes });
          if (hash(readFileSync(this.safePath(file.asset.path))) !== file.asset.sha256) throw new EngineError("reference_corrupt", "A saved immutable story asset changed. Restore it before generating.", 500);
        }
        bible = prepared.bible;
        this.db.prepare("INSERT OR IGNORE INTO stories(id,document) VALUES(?,?)").run(bible.id, JSON.stringify(bible));
      } else bible = this.seedBible();
      const now = this.now();
      const run = RunSchema.parse({ id: randomUUID(), operation_id: input.operation_id, story_id: bible.id, step: 0, status: "active", state: bible.template?.initial_state ?? initialState(), limits, models, approach: input.approach, created_at: now, updated_at: now });
      this.db.prepare("INSERT INTO story_runs(id,operation_id,story_id,document) VALUES(?,?,?,?)").run(run.id, run.operation_id, bible.id, JSON.stringify(run)); return run;
    });
  }
  snapshot(runId: string): Snapshot {
    return this.transaction(() => {
      const run = this.run(runId); const nodes = this.db.prepare("SELECT document FROM story_nodes WHERE run_id=? ORDER BY step").all(runId).map((row) => data(row, NodeSchema));
      const panels = this.db.prepare("SELECT p.document FROM comic_panels p JOIN story_nodes n ON n.id=p.node_id WHERE n.run_id=? ORDER BY n.step,p.sequence").all(runId).map((row) => data(row, PanelSchema));
      const events = this.events(runId);
      return { run, bible: data(this.db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id), BibleSchema), nodes, panels, events, summary: summarize(events) };
    });
  }
  private newEvent(run: Run, node: StoryNode, stage: "script" | "image", sequence: number, operationId: string = randomUUID(), approach = run.approach, panelId: string | null = null): GenerationEvent {
    const model = stage === "script" ? run.models.story : run.models.image;
    const bible = data(this.db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id), BibleSchema);
    const reference_count = approach === "reference" ? bible.template?.reference_asset_ids.length ?? 1 : 0;
    if (stage === "image" && approach === "reference" && reference_count === 0) throw new EngineError("reference_missing", "This story has no reference images. No alternate paid mode was selected.", 400);
    const estimate = reservation({ model, stage, quality: run.models.quality, approach, reference_count }, this.now());
    return { id: randomUUID(), run_id: run.id, node_id: node.id, panel_id: panelId, sequence, operation_id: operationId, stage, status: "planned", model, quality: run.models.quality, approach, reference_count, reserved_micro_usd: estimate, estimated_micro_usd: null, reference_input_micro_usd: null, price_version: estimate == null ? null : PRICES.version, metrics: null, error: null, asset_path: null, lease_until: null, claim_token: null, created_at: this.now(), started_at: null, finished_at: null };
  }
  private reserve(run: Run, events: GenerationEvent[]) {
    const summary = summarize([...this.events(run.id), ...events]);
    if (summary.image_calls + summary.image_slots_reserved > run.limits.max_image_calls) throw new EngineError("image_call_limit", "The run's hard image-call limit prevents this work.", 402);
    if (summary.script_calls + summary.script_slots_reserved > run.limits.max_script_calls) throw new EngineError("script_call_limit", "The run's hard narrative-call limit prevents this work.", 402);
    if (summary.estimated_micro_usd + summary.held_micro_usd > Math.floor(run.limits.budget_usd * 1e6)) throw new EngineError("estimated_budget_limit", "The run's estimated budget cannot reserve this work. This is an application guard, not a provider billing cap.", 402);
    for (const event of events) this.db.prepare("INSERT INTO generation_events(id,run_id,node_id,panel_id,stage,sequence,operation_id,status,document) VALUES(?,?,?,?,?,?,?,?,?)").run(event.id, event.run_id, event.node_id, event.panel_id, event.stage, event.sequence, event.operation_id, event.status, JSON.stringify(event));
  }
  createNode(runId: string, input: { operation_id: string; choice_id: string; instruction: string }): StoryNode {
    return this.transaction(() => {
      const snapshot = this.snapshot(runId); const run = snapshot.run;
      const old = snapshot.nodes.find((node) => node.operation_id === input.operation_id);
      if (old) { if (old.choice_id !== input.choice_id || old.instruction !== input.instruction) throw new EngineError("operation_conflict", "This operation ID already has a different decision payload."); return old; }
      if (run.status === "ended" || run.step >= run.limits.max_steps) throw new EngineError("story_ended", "This short story has ended.");
      const last = snapshot.nodes.at(-1);
      if (last && (!last.chapter || snapshot.panels.some((panel) => panel.node_id === last.id && ["pending", "running"].includes(panel.status)))) throw new EngineError("stage_unfinished", "Finish or explicitly recover the current stages before the next decision.");
      const choices = last?.chapter?.next_decision.options ?? snapshot.bible.template?.initial_decision.options ?? firstOptions.map((id, index) => ({ id, label: CHOICES[index] }));
      const selected = choices.find((option) => option.id === input.choice_id);
      if (!selected) throw new EngineError("invalid_choice", "Select one of this run's saved decision options.", 400);
      const node: StoryNode = { id: randomUUID(), run_id: runId, step: run.step + 1, parent_id: last?.id ?? null, ...input, choice: selected.label, status: "script_pending", before: structuredClone(run.state), after: null, chapter: null, error: null, created_at: this.now(), script_ready_at: null, completed_at: null, metrics: null };
      this.db.prepare("INSERT INTO story_nodes(id,run_id,step,operation_id,document) VALUES(?,?,?,?,?)").run(node.id, runId, node.step, node.operation_id, JSON.stringify(node));
      this.reserve(run, [this.newEvent(run, node, "script", 0, input.operation_id), this.newEvent(run, node, "image", 1), this.newEvent(run, node, "image", 2)]); return node;
    });
  }
  private claim(event: GenerationEvent): GenerationEvent {
    event.status = "running"; event.claim_token = randomUUID(); event.started_at = this.now(); event.lease_until = this.now() + this.leaseMs; this.saveEvent(event); return event;
  }
  claimScript(runId: string, nodeId: string, input: { operation_id: string; retry: boolean }): GenerationEvent | null {
    return this.transaction(() => {
      const node = this.node(nodeId); this.assertOwned(runId, node); const run = this.run(runId); let event = this.events(runId).find((event) => event.operation_id === input.operation_id);
      if (event && (event.node_id !== nodeId || event.stage !== "script")) throw new EngineError("operation_conflict", "Operation ID belongs to another stage.");
      if (event && event.status !== "planned") return null;
      if (node.chapter) return null;
      if (!event) {
        if (!input.retry || node.status !== "script_failed") throw new EngineError("explicit_retry_required", "Use the explicit paid narrative retry action for a failed script.");
        const planned = [this.newEvent(run, node, "script", 0, input.operation_id), this.newEvent(run, node, "image", 1), this.newEvent(run, node, "image", 2)];
        this.reserve(run, planned); event = planned[0];
      }
      node.status = "script_running"; node.error = null; node.metrics = null; this.saveNode(node); return this.claim(event);
    });
  }
  private owns(event: GenerationEvent): boolean {
    if (isContentDeleted(this.directory, "run", event.run_id)) return false;
    const row = this.db.prepare("SELECT document FROM generation_events WHERE id=?").get(event.id);
    if (!row) return false; const current = data(row, EventSchema);
    return current.status === "running" && current.claim_token === event.claim_token;
  }
  private account(event: GenerationEvent, metrics: Metrics | null) { const cost = usageCost(event, metrics); event.metrics = metrics; event.estimated_micro_usd = cost.total; event.reference_input_micro_usd = cost.reference; }
  finishScript(claim: GenerationEvent, chapter: Chapter, metrics: Metrics): boolean {
    return this.transaction(() => {
      if (!this.owns(claim)) { this.reconcileLate(claim, metrics); return false; }
      const node = this.node(claim.node_id); const run = this.run(claim.run_id);
      const bible = data(this.db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id), BibleSchema);
      const validationStarted = performance.now();
      let after: ReturnType<typeof applyChapter>;
      try { after = withFailurePhase("state_validation", () => applyChapter(node.before, chapter, node.step, run.limits.max_steps, bible.template?.initial_state.facts.map(fact => fact.id))); }
      finally { metrics.validation_ms = performance.now() - validationStarted; }
      const effects = bible.template?.choice_effects ?? [{ choice_id: "destroy", object_id: "device", condition: "destroyed" }];
      if (node.step === 1) for (const effect of effects.filter(effect => effect.choice_id === node.choice_id)) if (after.objects.find(object => object.id === effect.object_id)?.condition !== effect.condition) throw new EngineError("invalid_story_state", "The chosen action must record its required object condition before the story can continue.", 422);
      node.after = after; node.chapter = chapter; node.status = "script_ready"; node.metrics = metrics; node.script_ready_at = this.now();
      withFailurePhase("node_commit", () => {
        this.saveNode(node);
        run.state = after; run.step = node.step; run.status = chapter.is_ending ? "ended" : "active"; run.updated_at = this.now(); this.saveRun(run);
      });
      withFailurePhase("panel_commit", () => {
        for (const script of chapter.panels) {
          const event = this.events(run.id).find((event) => event.node_id === node.id && event.stage === "image" && event.sequence === script.sequence_index && event.status === "planned");
          if (!event) throw new EngineError("image_reservation_missing", "No reserved image stage matches this panel. The chapter was not saved and no new image call was made.", 500);
          const panel: Panel = { id: randomUUID(), node_id: node.id, sequence: script.sequence_index, script, visual_brief: this.visualBrief(after, script), status: "pending", image_path: null, error: null, metrics: null, operation_id: event.operation_id };
          this.db.prepare("INSERT INTO comic_panels(id,node_id,sequence,document) VALUES(?,?,?,?)").run(panel.id, node.id, panel.sequence, JSON.stringify(panel)); event.panel_id = panel.id; this.saveEvent(event);
        }
      });
      withFailurePhase("usage_commit", () => { this.account(claim, metrics); claim.status = "succeeded"; claim.finished_at = this.now(); this.saveEvent(claim); }); return true;
    });
  }
  private visualBrief(state: Run["state"], script: ScriptPanel): string { return `Panel ${script.sequence_index}: ${script.visual_description}. Staging: ${script.image_prompt}. Saved appearance and object continuity overrides default costume condition/prop state: ${JSON.stringify({ characters: state.characters, objects: state.objects })}. Preserve immutable facial identity and palette. Illustrate these current injuries, clothing condition and carried objects. Do not restore destroyed objects. Dialogue is overlaid by the app, never drawn into the image.`; }
  claimImage(runId: string, panelId: string, input: { operation_id: string; retry: boolean }): GenerationEvent | null {
    return this.transaction(() => {
      const panel = this.panel(panelId); const node = this.node(panel.node_id); this.assertOwned(runId, node); const run = this.run(runId);
      let event = this.events(runId).find((event) => event.operation_id === input.operation_id);
      if (event && (event.panel_id !== panelId || event.stage !== "image")) throw new EngineError("operation_conflict", "Operation ID belongs to another stage.");
      if (event && event.status !== "planned") return null;
      if (!event) {
        if (!input.retry || panel.status !== "failed") throw new EngineError("explicit_retry_required", "Only a failed image can be retried, with an explicit new paid operation ID.");
        const previous = this.events(runId).filter((event) => event.panel_id === panelId).at(-1);
        event = this.newEvent(run, node, "image", panel.sequence, input.operation_id, previous?.approach ?? run.approach, panel.id); this.reserve(run, [event]);
      }
      // Older pending records may predate the preview allowance. Reserve any increase atomically before the paid claim.
      const estimate = reservation(event, this.now());
      if (estimate != null && estimate > (event.reserved_micro_usd ?? 0)) {
        event.reserved_micro_usd = estimate; event.price_version = PRICES.version;
        const summary = summarize(this.events(runId).map(saved => saved.id === event.id ? event : saved));
        if (summary.estimated_micro_usd + summary.held_micro_usd > Math.floor(run.limits.budget_usd * 1e6)) throw new EngineError("estimated_budget_limit", "The run's estimated budget cannot reserve this illustration. No image request was made.", 402);
      }
      panel.status = "running"; panel.error = null; panel.metrics = null; panel.operation_id = event.operation_id; this.savePanel(panel); node.status = "images_running"; this.saveNode(node); return this.claim(event);
    });
  }
  recordImageReceipt(claim: GenerationEvent, metrics: Metrics): string | null {
    return this.transaction(() => {
      if (!this.owns(claim)) { this.reconcileLate(claim, metrics); return null; }
      this.account(claim, metrics); claim.asset_path = `images/${claim.run_id}/${claim.id}.jpg`; this.saveEvent(claim); return claim.asset_path;
    });
  }
  private validJPEG(bytes: Buffer) { return bytes.length <= 20 * 1024 * 1024 && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9; }
  writeImage(relative: string, bytes: Buffer) {
    if (!this.validJPEG(bytes)) throw new EngineError("invalid_image", "The provider did not return a valid bounded JPEG.", 502);
    const match = /^images\/([a-f0-9-]{36})\/[a-f0-9-]{36}\.jpg$/.exec(relative);
    if (!match) throw new EngineError("invalid_asset_path", "Invalid local image path.", 400);
    writeManagedAsset(this.directory, { owner_kind: "run", owner_id: match[1], path: relative, bytes });
  }
  writeClaimedImage(claim: GenerationEvent, bytes: Buffer): boolean {
    return this.transaction(() => {
      if (!this.owns(claim)) return false;
      const event = this.event(claim.id);
      if (event.asset_path !== `images/${claim.run_id}/${claim.id}.jpg`) return false;
      this.writeImage(event.asset_path, bytes); return true;
    });
  }
  finishImage(claim: GenerationEvent): boolean {
    return this.transaction(() => {
      if (!this.owns(claim)) return false;
      const event = this.event(claim.id);
      if (!event.asset_path || !existsSync(path.join(this.directory, event.asset_path))) return false;
      if (!this.validJPEG(readFileSync(this.safePath(event.asset_path)))) return false;
      const panel = this.panel(event.panel_id!); panel.status = "complete"; panel.image_path = event.asset_path; panel.error = null; panel.metrics = event.metrics; this.savePanel(panel);
      event.status = "succeeded"; event.finished_at = this.now(); this.saveEvent(event); this.refreshNode(event.node_id); return true;
    });
  }
  private refreshNode(nodeId: string) {
    const node = this.node(nodeId); if (!node.chapter) return;
    const panels = this.db.prepare("SELECT document FROM comic_panels WHERE node_id=?").all(nodeId).map((row) => data(row, PanelSchema));
    if (panels.every((panel) => panel.status === "complete")) { node.status = "complete"; node.completed_at = this.now(); }
    else if (panels.some((panel) => panel.status === "running")) node.status = "images_running";
    else if (panels.some((panel) => panel.status === "pending")) node.status = "script_ready";
    else node.status = "partial";
    this.saveNode(node);
  }
  fail(claim: GenerationEvent, error: Failure, metrics: Metrics | null = null, interrupted = false) {
    this.transaction(() => {
      if (!this.owns(claim)) { if (metrics) this.reconcileLate(claim, metrics); return; }
      const event = this.event(claim.id); this.account(event, metrics ?? event.metrics); event.error = error; event.status = interrupted ? "interrupted" : "failed"; event.finished_at = this.now(); this.saveEvent(event);
      const node = this.node(event.node_id);
      if (event.stage === "script") {
        node.status = "script_failed"; node.error = error; node.metrics = event.metrics; this.saveNode(node);
        for (const pending of this.events(event.run_id).filter((item) => item.node_id === node.id && item.status === "planned")) { pending.status = "cancelled"; pending.finished_at = this.now(); this.saveEvent(pending); }
      } else { const panel = this.panel(event.panel_id!); panel.status = "failed"; panel.error = error; panel.metrics = event.metrics; this.savePanel(panel); this.refreshNode(node.id); }
    });
  }
  private reconcileLate(claim: GenerationEvent, metrics: Metrics) {
    if (isContentDeleted(this.directory, "run", claim.run_id)) return;
    const row = this.db.prepare("SELECT document FROM generation_events WHERE id=?").get(claim.id);
    if (!row) return; const event = data(row, EventSchema);
    if (event.status === "interrupted") { this.account(event, metrics); this.saveEvent(event); }
  }
  recoverExpired(runId: string) {
    this.transaction(() => {
      for (const panel of this.snapshot(runId).panels.filter(panel => panel.status === "complete")) {
        let valid = false;
        try { if (panel.image_path) { const bytes = readFileSync(this.safePath(panel.image_path)); valid = this.validJPEG(bytes); } } catch { /* Missing assets require explicit repair, never generation on read. */ }
        if (!valid) { panel.status = "failed"; panel.error = { code: "saved_asset_missing", message: "The saved image is missing or invalid. Restore a backup or explicitly retry this image.", request_id: null }; this.savePanel(panel); this.refreshNode(panel.node_id); }
      }
      for (const event of this.events(runId).filter((event) => event.status === "running" && event.lease_until != null && event.lease_until <= this.now())) {
        if (event.stage === "image" && event.asset_path && event.metrics && existsSync(path.join(this.directory, event.asset_path))) { if (this.finishImage(event)) continue; }
        this.fail(event, { code: "interrupted_unknown_cost", message: "This stage outlived its request lease. No automatic retry was made. Its provider cost may be unknown; an explicit retry consumes another call.", request_id: event.metrics?.request_id ?? null }, event.metrics, true);
      }
    });
  }
  replay(runId: string, nodeId: string, input: { operation_id: string; approach: ImageApproach }) {
    return this.transaction(() => {
      const old = this.db.prepare("SELECT node_id,approach FROM replay_operations WHERE run_id=? AND operation_id=?").get(runId, input.operation_id);
      if (old) { if (old.node_id !== nodeId || old.approach !== input.approach) throw new EngineError("operation_conflict", "Replay operation ID has different settings."); return; }
      const node = this.node(nodeId); this.assertOwned(runId, node); const run = this.run(runId);
      const panels = this.snapshot(runId).panels.filter((panel) => panel.node_id === nodeId);
      if (!node.chapter || panels.length !== 2 || panels.some((panel) => panel.status !== "complete")) throw new EngineError("replay_not_ready", "Only a fully illustrated saved script can start an explicit A/B replay.");
      const events = panels.map((panel) => this.newEvent(run, node, "image", panel.sequence, randomUUID(), input.approach, panel.id)); this.reserve(run, events);
      panels.forEach((panel, index) => { panel.status = "pending"; panel.operation_id = events[index].operation_id; panel.error = null; panel.metrics = null; this.savePanel(panel); });
      node.status = "script_ready"; node.completed_at = null; this.saveNode(node);
      this.db.prepare("INSERT INTO replay_operations(run_id,operation_id,node_id,approach) VALUES(?,?,?,?)").run(runId, input.operation_id, nodeId, input.approach);
    });
  }
  readAsset(runId: string, assetId: string): { bytes: Buffer; mime: string } {
    const snapshot = this.snapshot(runId); const reference = snapshot.bible.assets.find((asset) => asset.id === assetId);
    if (reference) { const bytes = readFileSync(this.safePath(reference.path)); if (hash(bytes) !== reference.sha256) throw new EngineError("reference_corrupt", "Saved reference integrity check failed.", 500); return { bytes, mime: reference.mime }; }
    const panel = snapshot.panels.find((panel) => panel.id === assetId);
    if (!panel?.image_path) throw new EngineError("asset_not_found", "This run has no completed image for that panel.", 404);
    return { bytes: readFileSync(this.safePath(panel.image_path)), mime: "image/jpeg" };
  }
}
