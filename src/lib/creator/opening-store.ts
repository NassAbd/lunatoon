import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Metrics } from "../contracts";
import { Id, StoryFoundationSchema, VisualReferencesSchema, type VisualReference, type StoryFoundation, type StoryTemplate } from "../story-engine/contracts";
import { orderedVisualReferences } from "../visual-references";
import { validateStoryFoundation, validateStoryTemplate } from "../story-engine/state";
import { EngineError } from "../story-engine/errors";
import { PRICES, reservation, usageCost } from "../story-engine/cost";
import { isReferenceModelSupported } from "../art-direction";
import { assertContentAvailable } from "../content-management/gate";
import { writeManagedAsset } from "../content-management/files";
import { CreatorAssetSchema, type CreatorAsset, type CreatorDraft, type CreatorError, type CreatorSnapshot } from "./contracts";
import { OpeningAttemptSchema, OpeningImageSchema, OpeningLimitsSchema, OpeningPanelSchema, SaveDraftSchema, type OpeningAttempt, type OpeningImageInput, type OpeningLimits, type OpeningPanel, type OpeningSnapshot, type SaveDraftInput } from "./opening-contracts";
import { openingFingerprint, openingShots } from "./opening-plan";

export const OPENING_SQL = `
CREATE TABLE creator_openings(template_id TEXT NOT NULL,version INTEGER NOT NULL,draft_id TEXT NOT NULL REFERENCES creator_drafts(id),document TEXT NOT NULL,PRIMARY KEY(template_id,version));
CREATE TABLE creator_opening_attempts(id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES creator_drafts(id),template_id TEXT NOT NULL,version INTEGER NOT NULL,panel_id TEXT NOT NULL,operation_id TEXT NOT NULL UNIQUE,document TEXT NOT NULL);
CREATE TABLE creator_draft_saves(operation_id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES creator_drafts(id),fingerprint TEXT NOT NULL);
CREATE INDEX creator_opening_attempts_owner ON creator_opening_attempts(draft_id,version);`;
const ConfigSchema = z.object({
  template_id: z.string(), version: z.number().int().positive(), draft_id: Id,
  foundation: StoryFoundationSchema, reference_asset_ids: z.array(z.string()).max(3), visual_references: VisualReferencesSchema.optional(),
  model: z.string().min(1), quality: z.enum(["low", "medium", "high"]), approach: z.enum(["text", "reference"]),
  limits: OpeningLimitsSchema, panels: z.array(OpeningPanelSchema).min(1).max(4), created_at: z.number(),
}).strict();
type Config = z.infer<typeof ConfigSchema>;
const InternalAttemptSchema = OpeningAttemptSchema.extend({ fingerprint: z.string(), claim_token: Id, lease_until: z.number() }).strict();
type InternalAttempt = z.infer<typeof InternalAttemptSchema>;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function decode<T>(row: Record<string, unknown> | undefined, schema: z.ZodType<T>): T {
  if (!row) throw new EngineError("creator_opening_not_found", "This saved opening scene was not found.", 404);
  return schema.parse(JSON.parse(z.string().parse(row.document)) as unknown);
}
function exposed(attempt: InternalAttempt): OpeningAttempt { return OpeningAttemptSchema.parse(Object.fromEntries(Object.keys(OpeningAttemptSchema.shape).map(key => [key, attempt[key as keyof InternalAttempt]]))); }
function summary(attempts: OpeningAttempt[]): OpeningSnapshot["summary"] {
  return { calls: attempts.length, estimated_micro_usd: attempts.reduce((total, item) => total + (item.estimated_micro_usd ?? 0), 0), held_micro_usd: attempts.reduce((total, item) => total + (item.estimated_micro_usd == null ? item.reserved_micro_usd ?? 0 : 0), 0), unknown_cost_attempts: attempts.filter(item => item.status !== "running" && item.estimated_micro_usd == null).length, unpriced_attempts: attempts.filter(item => item.price_version == null).length, measured_input_tokens: attempts.reduce((total, item) => total + (item.metrics?.usage?.input_tokens ?? 0), 0), measured_output_tokens: attempts.reduce((total, item) => total + (item.metrics?.usage?.output_tokens ?? 0), 0), measured_reference_input_tokens: attempts.reduce((total, item) => total + (item.metrics?.usage?.input_image_tokens ?? 0), 0), reference_input_micro_usd: attempts.reduce((total, item) => total + (item.reference_input_micro_usd ?? 0), 0) };
}
type StoreContext = { db: DatabaseSync; directory: string; now: () => number; leaseMs: number; transaction<T>(work: () => T): T; draft(id: string): CreatorDraft; putDraft(draft: CreatorDraft): void; snapshot(id: string, version?: number): CreatorSnapshot; readAsset(asset: CreatorAsset): Buffer };
export type OpeningContext = { foundation: StoryFoundation; panel: OpeningPanel; model: string; quality: "low" | "medium" | "high"; approach: "text" | "reference"; visual_references?: VisualReference[]; references: Array<CreatorAsset & { bytes: Buffer }> };

export class OpeningRepository {
  private readonly model: string;
  private readonly quality: "low" | "medium" | "high";
  private readonly limits: OpeningLimits;
  constructor(private readonly store: StoreContext, options: { openingModel?: string; openingQuality?: "low" | "medium" | "high"; openingLimits?: OpeningLimits }) {
    this.model = options.openingModel ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare";
    this.quality = z.enum(["low", "medium", "high"]).parse(options.openingQuality ?? process.env.OPENAI_IMAGE_QUALITY ?? "low");
    this.limits = OpeningLimitsSchema.parse(options.openingLimits ?? { max_calls: Number(process.env.LUNATOON_OPENING_MAX_IMAGE_CALLS ?? 8), budget_usd: Number(process.env.LUNATOON_OPENING_BUDGET_USD ?? 1) });
  }
  private config(id: string, version: number) {
    const draft = this.store.draft(id); assertContentAvailable(this.store.directory, "template", draft.template_id);
    return decode(this.store.db.prepare("SELECT document FROM creator_openings WHERE draft_id=? AND version=?").get(id, z.number().int().positive().parse(version)), ConfigSchema);
  }
  private put(config: Config) { this.store.db.prepare("UPDATE creator_openings SET document=? WHERE template_id=? AND version=?").run(JSON.stringify(config), config.template_id, config.version); }
  private asset(id: string, assetId: string) { return decode(this.store.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(assetId, id), CreatorAssetSchema); }
  private attempts(id: string, version?: number) { return (version === undefined ? this.store.db.prepare("SELECT document FROM creator_opening_attempts WHERE draft_id=? ORDER BY rowid").all(id) : this.store.db.prepare("SELECT document FROM creator_opening_attempts WHERE draft_id=? AND version=? ORDER BY rowid").all(id, version)).map(row => decode(row, InternalAttemptSchema)); }
  private putAttempt(attempt: InternalAttempt) { this.store.db.prepare("UPDATE creator_opening_attempts SET document=? WHERE id=?").run(JSON.stringify(attempt), attempt.id); }
  private panel(config: Config, id: string) { Id.parse(id); const panel = config.panels.find(item => item.id === id); if (!panel) throw new EngineError("creator_opening_not_found", "This scene does not belong to this saved opening.", 404); return panel; }
  private references(draft: CreatorDraft, ids: string[], roles?: VisualReference[]) {
    if (new Set(ids).size !== ids.length) throw new EngineError("invalid_template_assets", "Reference images must be unique.", 400);
    return orderedVisualReferences(ids, roles).map(({ asset_id: id }) => { const asset = this.asset(draft.id, id); if (asset.kind !== "reference" || !draft.reference_asset_ids.includes(id)) throw new EngineError("invalid_template_assets", "Only this draft's active references can be saved.", 400); this.store.readAsset(asset); return asset; });
  }
  private ensureIdle(id: string) { if (this.store.db.prepare("SELECT 1 FROM creator_attempts WHERE draft_id=? AND json_extract(document,'$.status')='running'").get(id)) throw new EngineError("creator_running", "Wait for the foundation to finish before saving."); }
  saveDraft(id: string, value: SaveDraftInput) {
    const input = SaveDraftSchema.parse(value); const foundation = validateStoryFoundation(input.foundation); const fingerprint = hash(JSON.stringify(input));
    return this.store.transaction(() => {
      const draft = this.store.draft(id); const old = this.store.db.prepare("SELECT draft_id,fingerprint FROM creator_draft_saves WHERE operation_id=?").get(input.operation_id);
      if (old) { if (old.draft_id !== id || old.fingerprint !== fingerprint) throw new EngineError("operation_conflict", "This save operation ID already belongs to different content."); return this.store.snapshot(id); }
      if (this.store.db.prepare("SELECT 1 FROM creator_saves WHERE operation_id=?").get(input.operation_id)) throw new EngineError("operation_conflict", "This operation ID already belongs to a version save.");
      this.ensureIdle(id); this.references(draft, input.reference_asset_ids, input.visual_references);
      draft.foundation = foundation; draft.reference_asset_ids = input.reference_asset_ids; draft.visual_references = input.visual_references; draft.status = "draft"; draft.updated_at = this.store.now(); this.store.putDraft(draft);
      this.store.db.prepare("INSERT INTO creator_draft_saves(operation_id,draft_id,fingerprint) VALUES(?,?,?)").run(input.operation_id, id, fingerprint); return this.store.snapshot(id);
    });
  }
  prepare(id: string, value: SaveDraftInput) {
    const input = SaveDraftSchema.parse(value); const foundation = validateStoryFoundation(input.foundation); const fingerprint = hash(JSON.stringify({ ...input, kind: "illustrated" }));
    return this.store.transaction(() => {
      const draft = this.store.draft(id); assertContentAvailable(this.store.directory, "template", draft.template_id);
      const old = this.store.db.prepare("SELECT draft_id,fingerprint,version FROM creator_saves WHERE operation_id=?").get(input.operation_id);
      if (old) { if (old.draft_id !== id || old.fingerprint !== fingerprint) throw new EngineError("operation_conflict", "This save operation ID already belongs to different content."); return this.store.snapshot(id, Number(old.version)); }
      if (this.store.db.prepare("SELECT 1 FROM creator_draft_saves WHERE operation_id=?").get(input.operation_id)) throw new EngineError("operation_conflict", "This operation ID already belongs to a draft save.");
      this.ensureIdle(id); const refs = this.references(draft, input.reference_asset_ids, input.visual_references);
      if (refs.length && !isReferenceModelSupported(this.model)) throw new EngineError("reference_unsupported", "The configured model has no verified reference-image support. No image calls were made.", 400);
      const version = Number(this.store.db.prepare("SELECT COALESCE(MAX(version),0)+1 AS version FROM creator_templates WHERE id=?").get(draft.template_id)?.version);
      const older = this.store.db.prepare("SELECT document FROM creator_openings WHERE draft_id=? ORDER BY version DESC").all(id).map(row => decode(row, ConfigSchema));
      const panels = foundation.opening_beats.map((beat, index) => {
        const panel: OpeningPanel = { id: randomUUID(), sequence: index + 1, caption: beat.caption, scene_description: beat.alt, shot_direction: openingShots[index], layout_aspect: "vertical", context_hash: "0".repeat(64), status: "pending", asset_id: null, error: null };
        panel.context_hash = openingFingerprint(panel, foundation, refs, this.model, this.quality, input.visual_references);
        const reusable = older.flatMap(item => item.panels).find(item => item.status === "complete" && item.asset_id && item.context_hash === panel.context_hash);
        if (reusable?.asset_id) {
          const asset = this.asset(id, reusable.asset_id);
          try { this.store.readAsset(asset); panel.status = "complete"; panel.asset_id = asset.id; }
          catch (error) { if (!(error instanceof EngineError && error.code === "creator_asset_unavailable")) throw error; }
        }
        return panel;
      });
      const config: Config = { template_id: draft.template_id, version, draft_id: id, foundation, reference_asset_ids: input.reference_asset_ids, ...(input.visual_references === undefined ? {} : { visual_references: input.visual_references }), model: this.model, quality: this.quality, approach: refs.length ? "reference" : "text", limits: this.limits, panels, created_at: this.store.now() };
      this.store.db.prepare("INSERT INTO creator_openings(template_id,version,draft_id,document) VALUES(?,?,?,?)").run(config.template_id, version, id, JSON.stringify(config));
      const template = this.template(config);
      this.store.db.prepare("INSERT INTO creator_templates(id,version,draft_id,document) VALUES(?,?,?,?)").run(template.id, version, id, JSON.stringify(template));
      this.store.db.prepare("INSERT INTO creator_saves(operation_id,draft_id,fingerprint,template_id,version) VALUES(?,?,?,?,?)").run(input.operation_id, id, fingerprint, template.id, version);
      draft.foundation = foundation; draft.reference_asset_ids = input.reference_asset_ids; draft.visual_references = input.visual_references; draft.latest_saved_version = version; draft.status = template.status === "ready" ? "ready" : "draft"; draft.updated_at = this.store.now(); this.store.putDraft(draft);
      return this.store.snapshot(id);
    });
  }
  private template(config: Config): StoryTemplate {
    const ready = config.panels.every(panel => panel.status === "complete" && panel.asset_id);
    const beats = config.foundation.opening_beats.map((beat, index) => { const panel = config.panels[index]; const asset = panel.asset_id ? this.asset(config.draft_id, panel.asset_id) : null; return { ...beat, asset_id: asset?.id ?? `pending_${panel.id.replaceAll("-", "")}`, width: asset?.width ?? 1024, height: asset?.height ?? 1536 }; });
    return validateStoryTemplate({ ...config.foundation, id: config.template_id, version: config.version, status: ready ? "ready" : "draft", cover_asset_id: beats[0].asset_id, reference_asset_ids: config.reference_asset_ids, ...(config.visual_references === undefined ? {} : { visual_references: config.visual_references }), opening_beats: beats });
  }
  snapshot(id: string, version: number | null): OpeningSnapshot | null {
    if (version == null) return null;
    const row = this.store.db.prepare("SELECT document FROM creator_openings WHERE draft_id=? AND version=?").get(id, version); if (!row) return null;
    const config = decode(row, ConfigSchema); const attempts = this.attempts(id, version).map(exposed);
    const status = config.panels.every(panel => panel.status === "complete") ? "ready" : config.panels.some(panel => panel.status === "running") ? "running" : config.panels.some(panel => panel.status === "failed" || panel.status === "interrupted") ? "failed" : "pending";
    return { template_id: config.template_id, version, status, model: config.model, quality: config.quality, approach: config.approach, reference_asset_ids: config.reference_asset_ids, ...(config.visual_references === undefined ? {} : { visual_references: config.visual_references }), limits: config.limits, panels: config.panels, attempts, summary: summary(attempts) };
  }
  expire(id: string) {
    for (const attempt of this.attempts(id)) if (attempt.status === "running" && attempt.lease_until <= this.store.now()) {
      attempt.status = "interrupted"; attempt.finished_at = this.store.now(); attempt.error = { code: "opening_interrupted", message: "This illustration was interrupted. Review its possibly unknown cost before explicitly trying again.", request_id: attempt.metrics?.request_id ?? null, issues: [] }; this.putAttempt(attempt);
      const config = this.config(id, attempt.version); const panel = this.panel(config, attempt.panel_id); panel.status = "interrupted"; panel.error = attempt.error; this.put(config);
    }
  }
  context(id: string, version: number, panelId: string): OpeningContext {
    return this.store.transaction(() => { const config = this.config(id, version); return { foundation: config.foundation, panel: this.panel(config, panelId), model: config.model, quality: config.quality, approach: config.approach, visual_references: config.visual_references, references: orderedVisualReferences(config.reference_asset_ids, config.visual_references).map(({ asset_id: assetId }) => { const asset = this.asset(id, assetId); return { ...asset, bytes: this.store.readAsset(asset) }; }) }; });
  }
  private existing(id: string, version: number, panelId: string, input: OpeningImageInput) {
    const row = this.store.db.prepare("SELECT document FROM creator_opening_attempts WHERE operation_id=?").get(input.operation_id); if (!row) return null;
    const attempt = decode(row, InternalAttemptSchema);
    if (attempt.draft_id !== id || attempt.version !== version || attempt.panel_id !== panelId || attempt.fingerprint !== hash(JSON.stringify(input))) throw new EngineError("operation_conflict", "This operation ID already belongs to a different illustration request.");
    return attempt;
  }
  replay(id: string, version: number, panelId: string, value: OpeningImageInput) {
    const input = OpeningImageSchema.parse(value);
    return this.store.transaction(() => { this.expire(id); const config = this.config(id, version); const panel = this.panel(config, panelId); return this.existing(id, version, panelId, input) || panel.status === "complete" ? this.store.snapshot(id, version) : null; });
  }
  claim(id: string, version: number, panelId: string, value: OpeningImageInput): { attempt: OpeningAttempt | null; claim_token: string | null } {
    const input = OpeningImageSchema.parse(value);
    return this.store.transaction(() => {
      this.expire(id); const config = this.config(id, version); const panel = this.panel(config, panelId); const old = this.existing(id, version, panelId, input);
      if (old) return { attempt: exposed(old), claim_token: null };
      if (panel.status === "complete") return { attempt: null, claim_token: null };
      if (panel.status === "running") throw new EngineError("opening_running", "This illustration is already in progress. Wait for its saved result.");
      const attempts = this.attempts(id, version); const last = attempts.filter(item => item.panel_id === panelId).at(-1);
      if (last) { if (!input.retry) throw new EngineError("explicit_retry_required", "Explicitly retry this failed illustration before making another paid attempt."); if (last.estimated_micro_usd == null && !input.acknowledge_unknown) throw new EngineError("unknown_cost_confirmation", "The earlier illustration may have incurred an unknown charge. Confirm this before trying again."); }
      else if (input.retry) throw new EngineError("invalid_opening_retry", "Only a failed or interrupted illustration can be retried.");
      if (attempts.length >= config.limits.max_calls) throw new EngineError("opening_call_limit", "This opening version has reached its image-call limit.", 402);
      const reserved = reservation({ stage: "image", model: config.model, approach: config.approach, quality: config.quality, reference_count: config.reference_asset_ids.length }, this.store.now()); const totals = summary(attempts);
      if (totals.estimated_micro_usd + totals.held_micro_usd + (reserved ?? 0) > Math.floor(config.limits.budget_usd * 1e6)) throw new EngineError("opening_budget_limit", "This opening version cannot reserve another illustration within its estimated budget. This guard is not a provider billing cap.", 402);
      const attempt: InternalAttempt = { id: randomUUID(), draft_id: id, template_id: config.template_id, version, panel_id: panelId, operation_id: input.operation_id, status: "running", model: config.model, quality: config.quality, approach: config.approach, reference_count: config.reference_asset_ids.length, created_at: this.store.now(), finished_at: null, reserved_micro_usd: reserved, estimated_micro_usd: null, reference_input_micro_usd: null, price_version: reserved == null ? null : PRICES.version, metrics: null, error: null, fingerprint: hash(JSON.stringify(input)), claim_token: randomUUID(), lease_until: this.store.now() + this.store.leaseMs };
      this.store.db.prepare("INSERT INTO creator_opening_attempts(id,draft_id,template_id,version,panel_id,operation_id,document) VALUES(?,?,?,?,?,?,?)").run(attempt.id, id, config.template_id, version, panelId, input.operation_id, JSON.stringify(attempt));
      panel.status = "running"; panel.error = null; this.put(config); return { attempt: exposed(attempt), claim_token: attempt.claim_token };
    });
  }
  isActive(id: string, version: number, panelId: string, attemptId: string, token: string) {
    return this.store.transaction(() => { this.config(id, version); this.expire(id); const attempt = decode(this.store.db.prepare("SELECT document FROM creator_opening_attempts WHERE id=? AND draft_id=? AND version=? AND panel_id=?").get(attemptId, id, version, panelId), InternalAttemptSchema); return attempt.claim_token === token && attempt.status === "running"; });
  }
  private ownedAttempt(id: string, version: number, attemptId: string, token: string) {
    this.config(id, version); const attempt = decode(this.store.db.prepare("SELECT document FROM creator_opening_attempts WHERE id=? AND draft_id=? AND version=?").get(attemptId, id, version), InternalAttemptSchema);
    if (attempt.claim_token !== token || !["running", "interrupted"].includes(attempt.status)) throw new EngineError("opening_claim_lost", "This request no longer owns this opening illustration."); return attempt;
  }
  private accounting(attempt: InternalAttempt, metrics: Metrics | null) { if (metrics) { const cost = usageCost({ model: attempt.model, stage: "image", price_version: attempt.price_version }, metrics); attempt.metrics = metrics; attempt.estimated_micro_usd = cost.total; attempt.reference_input_micro_usd = cost.reference; } }
  receipt(id: string, version: number, attemptId: string, token: string, metrics: Metrics) {
    return this.store.transaction(() => { this.expire(id); const attempt = this.ownedAttempt(id, version, attemptId, token); this.accounting(attempt, metrics); this.putAttempt(attempt); return attempt.status === "running"; });
  }
  finish(id: string, version: number, attemptId: string, token: string, result: { bytes?: Buffer; width?: number; height?: number; metrics: Metrics | null; error?: CreatorError }) {
    return this.store.transaction(() => {
      this.expire(id); const attempt = this.ownedAttempt(id, version, attemptId, token); const config = this.config(id, version); const panel = this.panel(config, attempt.panel_id); this.accounting(attempt, result.metrics); attempt.finished_at = this.store.now();
      if (attempt.status !== "running") { this.putAttempt(attempt); return this.store.snapshot(id, version); }
      if (result.error) { attempt.status = "failed"; attempt.error = result.error; panel.status = "failed"; panel.error = result.error; }
      else {
        if (!result.bytes || !result.width || !result.height || result.bytes.length > 20 * 1024 * 1024 || result.bytes[0] !== 0xff || result.bytes[1] !== 0xd8 || result.bytes.at(-2) !== 0xff || result.bytes.at(-1) !== 0xd9) throw new EngineError("invalid_opening_image", "The final opening image was not a verified JPEG.", 502);
        const sha256 = hash(result.bytes); const asset = CreatorAssetSchema.parse({ id: `opening_${hash(JSON.stringify([id, sha256])).slice(0, 48)}`, draft_id: id, mime: "image/jpeg", width: result.width, height: result.height, sha256, purpose: "Generated opening illustration", kind: "opening", created_at: this.store.now() });
        const old = this.store.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(asset.id, id);
        if (old) {
          try { this.store.readAsset(decode(old, CreatorAssetSchema)); }
          catch (error) { if (!(error instanceof EngineError && error.code === "creator_asset_unavailable")) throw error; writeManagedAsset(this.store.directory, { owner_kind: "draft", owner_id: id, path: `references/${sha256}.jpg`, bytes: result.bytes }); }
        }
        else { writeManagedAsset(this.store.directory, { owner_kind: "draft", owner_id: id, path: `references/${sha256}.jpg`, bytes: result.bytes }); this.store.db.prepare("INSERT INTO creator_assets(id,draft_id,document) VALUES(?,?,?)").run(asset.id, id, JSON.stringify(asset)); }
        attempt.status = "succeeded"; attempt.error = null; panel.status = "complete"; panel.asset_id = asset.id; panel.error = null;
      }
      this.putAttempt(attempt); this.put(config);
      // A draft version becomes immutable/playable only after every final is saved.
      const template = this.template(config); this.store.db.prepare("UPDATE creator_templates SET document=? WHERE id=? AND version=? AND json_extract(document,'$.status')='draft'").run(JSON.stringify(template), config.template_id, version);
      const draft = this.store.draft(id); if (draft.latest_saved_version === version) { const unchanged = JSON.stringify(draft.foundation) === JSON.stringify(config.foundation) && JSON.stringify(draft.reference_asset_ids) === JSON.stringify(config.reference_asset_ids) && JSON.stringify(draft.visual_references) === JSON.stringify(config.visual_references); draft.status = template.status === "ready" && unchanged ? "ready" : "draft"; draft.updated_at = this.store.now(); this.store.putDraft(draft); }
      return this.store.snapshot(id, version);
    });
  }
  readAsset(id: string, version: number, panelId: string) {
    return this.store.transaction(() => { const panel = this.panel(this.config(id, version), panelId); if (panel.status !== "complete" || !panel.asset_id) throw new EngineError("creator_asset_not_found", "This opening illustration has not been saved yet.", 404); const asset = this.asset(id, panel.asset_id); return { ...asset, bytes: this.store.readAsset(asset) }; });
  }
}
