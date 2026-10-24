import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Metrics } from "../contracts";
import { Id, StoryTemplateSchema, type StoryFoundation, type StoryTemplate } from "../story-engine/contracts";
import { EngineError } from "../story-engine/errors";
import { PRICES, usageCost, verifiedPrice } from "../story-engine/cost";
import { validateStoryFoundation, validateStoryTemplate } from "../story-engine/state";
import { CreateDraftSchema, CreatorAssetSchema, CreatorAttemptSchema, CreatorDraftSchema, CreatorLimitsSchema, FoundationPromptSchema, GenerateFoundationSchema, SaveTemplateSchema, type CreatorAsset, type CreatorAttempt, type CreatorDraft, type CreatorError, type CreatorLimits, type CreatorSnapshot, type CreatorSummary, type GenerateFoundationInput, type SaveTemplateInput } from "./contracts";

const VERSION = 1;
const SQL = `CREATE TABLE creator_drafts(id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL, document TEXT NOT NULL);
CREATE TABLE creator_attempts(id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES creator_drafts(id), operation_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, document TEXT NOT NULL);
CREATE TABLE creator_assets(id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES creator_drafts(id), document TEXT NOT NULL);
CREATE TABLE creator_templates(id TEXT NOT NULL, version INTEGER NOT NULL, draft_id TEXT NOT NULL REFERENCES creator_drafts(id), document TEXT NOT NULL, PRIMARY KEY(id,version));
CREATE TABLE creator_saves(operation_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES creator_drafts(id), fingerprint TEXT NOT NULL, template_id TEXT NOT NULL, version INTEGER NOT NULL);
CREATE INDEX creator_attempts_draft ON creator_attempts(draft_id,created_at);
CREATE INDEX creator_templates_draft ON creator_templates(draft_id,version);`;
const InternalAttemptSchema = CreatorAttemptSchema.extend({ fingerprint: z.string(), claim_token: Id, lease_until: z.number() }).strict();
type InternalAttempt = z.infer<typeof InternalAttemptSchema>;
export type CreatorAssetInput = { bytes: Buffer; mime: "image/png" | "image/svg+xml"; width: number; height: number; purpose: string };
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const creatorDirectory = () => path.resolve(process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data"));
function record<T>(row: Record<string, unknown> | undefined, schema: z.ZodType<T>): T {
  if (!row) throw new EngineError("creator_not_found", "This local Creator record was not found.", 404);
  return schema.parse(JSON.parse(z.string().parse(row.document)) as unknown);
}
function publicAttempt(attempt: InternalAttempt): CreatorAttempt {
  return CreatorAttemptSchema.parse(Object.fromEntries(Object.keys(CreatorAttemptSchema.shape).map(key => [key, attempt[key as keyof InternalAttempt]])));
}
function summarize(attempts: CreatorAttempt[]): CreatorSummary {
  return {
    calls: attempts.length,
    estimated_micro_usd: attempts.reduce((sum, item) => sum + (item.estimated_micro_usd ?? 0), 0),
    held_micro_usd: attempts.reduce((sum, item) => sum + (item.estimated_micro_usd == null ? item.reserved_micro_usd ?? 0 : 0), 0),
    unknown_cost_attempts: attempts.filter(item => item.status !== "running" && item.estimated_micro_usd == null).length,
    unpriced_attempts: attempts.filter(item => item.price_version == null).length,
    measured_input_tokens: attempts.reduce((sum, item) => sum + (item.metrics?.usage?.input_tokens ?? 0), 0),
    measured_output_tokens: attempts.reduce((sum, item) => sum + (item.metrics?.usage?.output_tokens ?? 0), 0),
  };
}
function checkVersion(db: DatabaseSync) {
  if (Number(db.prepare("PRAGMA user_version").get()?.user_version) !== VERSION) throw new EngineError("creator_storage_version", "The local Creator database version is not supported.", 500);
}
function templateRow(db: DatabaseSync, id: string, version?: number): StoryTemplate | null {
  const row = version === undefined ? db.prepare("SELECT document FROM creator_templates WHERE id=? ORDER BY version DESC LIMIT 1").get(id) : db.prepare("SELECT document FROM creator_templates WHERE id=? AND version=?").get(id, version);
  return row ? validateStoryTemplate(record(row, StoryTemplateSchema)) : null;
}
function assetBytes(directory: string, asset: CreatorAsset) {
  const root = realpathSync(directory); const extension = asset.mime === "image/png" ? "png" : "svg";
  try {
    const file = realpathSync(path.join(root, "creator", "assets", `${asset.sha256}.${extension}`));
    if (!file.startsWith(`${root}${path.sep}creator${path.sep}assets${path.sep}`)) throw new Error("unsafe");
    const bytes = readFileSync(file); if (digest(bytes) !== asset.sha256) throw new Error("checksum"); return bytes;
  } catch { throw new EngineError("creator_asset_unavailable", "This local artwork is missing or could not be verified.", 404); }
}
function ownedTemplateAsset(db: DatabaseSync, directory: string, id: string, version: number, assetId: string) {
  const template = templateRow(db, id, version);
  if (!template || !new Set([template.cover_asset_id, ...template.opening_beats.map(beat => beat.asset_id), ...template.reference_asset_ids]).has(assetId)) throw new EngineError("creator_asset_not_found", "This artwork does not belong to this saved story version.", 404);
  const row = db.prepare("SELECT a.document FROM creator_assets a JOIN creator_templates t ON t.draft_id=a.draft_id WHERE t.id=? AND t.version=? AND a.id=?").get(id, version, assetId);
  const asset = record(row, CreatorAssetSchema); return { ...asset, bytes: assetBytes(directory, asset) };
}
function readOnly<T>(directory: string | undefined, absent: T, work: (db: DatabaseSync, root: string) => T): T {
  const root = path.resolve(directory ?? creatorDirectory()); const filename = path.join(root, "creator.sqlite");
  if (!existsSync(filename)) return absent;
  const db = new DatabaseSync(filename, { readOnly: true, timeout: 5000 });
  try { checkVersion(db); return work(db, root); } finally { db.close(); }
}
export function getSavedTemplate(id: string, version?: number, directory?: string): StoryTemplate | null { return readOnly(directory, null, db => templateRow(db, id, version)); }
export function readSavedTemplateAsset(id: string, version: number, assetId: string, directory?: string) {
  const asset = readOnly(directory, null, (db, root) => ownedTemplateAsset(db, root, id, version, assetId));
  if (!asset) throw new EngineError("creator_asset_not_found", "This saved story artwork was not found.", 404); return asset;
}
export function getSavedTemplateBundle(id: string, version?: number, directory?: string) {
  return readOnly(directory, null, (db, root) => {
    const template = templateRow(db, id, version); if (!template) return null;
    const ids = new Set([template.cover_asset_id, ...template.opening_beats.map(beat => beat.asset_id), ...template.reference_asset_ids]);
    return { template, assets: [...ids].map(assetId => ownedTemplateAsset(db, root, id, template.version, assetId)) };
  });
}
export function listSavedTemplates(options: { directory?: string; limit?: number } = {}): StoryTemplate[] {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50) || 50));
  return readOnly(options.directory, [], db => db.prepare("SELECT t.document FROM creator_templates t JOIN creator_drafts d ON d.id=t.draft_id WHERE t.version=(SELECT MAX(version) FROM creator_templates WHERE id=t.id) ORDER BY d.updated_at DESC,d.id LIMIT ?").all(limit).map(row => validateStoryTemplate(record(row, StoryTemplateSchema))));
}
export function listDrafts(options: { directory?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20) || 20));
  return readOnly(options.directory, [], db => db.prepare("SELECT document FROM creator_drafts ORDER BY updated_at DESC,id LIMIT ?").all(limit).map(row => {
    const draft = record(row, CreatorDraftSchema); return { id: draft.id, title: draft.foundation?.title ?? "Untitled story", status: draft.status, updated_at: draft.updated_at, latest_saved_version: draft.latest_saved_version };
  }));
}

export class CreatorStore {
  readonly directory: string;
  readonly now: () => number;
  readonly leaseMs: number;
  private readonly model: string;
  private readonly limits: CreatorLimits;
  private readonly db: DatabaseSync;
  constructor(directory = creatorDirectory(), options: { now?: () => number; leaseMs?: number; model?: string; limits?: CreatorLimits } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); this.directory = realpathSync(directory);
    this.now = options.now ?? Date.now; this.leaseMs = options.leaseMs ?? 240_000;
    this.model = options.model ?? process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";
    this.limits = CreatorLimitsSchema.parse(options.limits ?? { max_calls: 3, budget_usd: .05 });
    const filename = path.join(this.directory, "creator.sqlite"); const existed = existsSync(filename);
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    try {
      if (!existed) chmodSync(filename, 0o600);
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
      if (version === 0) this.transaction(() => this.db.exec(`${SQL}\nPRAGMA user_version=${VERSION};`));
      else checkVersion(this.db);
    } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  private transaction<T>(work: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const value = work(); this.db.exec("COMMIT"); return value; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }
  private draft(id: string) { Id.parse(id); return record(this.db.prepare("SELECT document FROM creator_drafts WHERE id=?").get(id), CreatorDraftSchema); }
  private putDraft(draft: CreatorDraft) { this.db.prepare("UPDATE creator_drafts SET updated_at=?,document=? WHERE id=?").run(draft.updated_at, JSON.stringify(draft), draft.id); }
  private attempts(id: string) { return this.db.prepare("SELECT document FROM creator_attempts WHERE draft_id=? ORDER BY created_at,rowid").all(id).map(row => record(row, InternalAttemptSchema)); }
  private putAttempt(attempt: InternalAttempt) { this.db.prepare("UPDATE creator_attempts SET document=? WHERE id=?").run(JSON.stringify(attempt), attempt.id); }
  private expire(id: string) {
    for (const attempt of this.attempts(id)) if (attempt.status === "running" && attempt.lease_until <= this.now()) {
      attempt.status = "interrupted"; attempt.finished_at = this.now();
      attempt.error = { code: "creator_interrupted", message: "This request was interrupted. Its cost may be unknown. Review it before explicitly trying again.", request_id: attempt.metrics?.request_id ?? null, issues: [] }; this.putAttempt(attempt);
    }
  }
  private snapshot(id: string): CreatorSnapshot {
    const draft = this.draft(id); const attempts = this.attempts(id).map(publicAttempt);
    return { draft, attempts, assets: this.db.prepare("SELECT document FROM creator_assets WHERE draft_id=? ORDER BY rowid").all(id).map(row => record(row, CreatorAssetSchema)), latest_template: draft.latest_saved_version == null ? null : templateRow(this.db, draft.template_id, draft.latest_saved_version), summary: summarize(attempts) };
  }
  getDraft(id: string): CreatorSnapshot { return this.transaction(() => { this.draft(id); this.expire(id); return this.snapshot(id); }); }
  replayGeneration(id: string, value: GenerateFoundationInput): CreatorSnapshot | null {
    const input = GenerateFoundationSchema.parse(value);
    return this.transaction(() => {
      const draft = this.draft(id); this.expire(id);
      const row = this.db.prepare("SELECT document FROM creator_attempts WHERE operation_id=?").get(input.operation_id);
      if (!row) return null;
      const prior = record(row, InternalAttemptSchema);
      if (prior.draft_id !== id || prior.fingerprint !== digest(JSON.stringify({ input, model: draft.model }))) throw new EngineError("operation_conflict", "This operation ID already belongs to a different Creator request.");
      return this.snapshot(id);
    });
  }
  createDraft(input: { operation_id: string }): CreatorSnapshot {
    const parsed = CreateDraftSchema.parse(input);
    return this.transaction(() => {
      const old = this.db.prepare("SELECT document FROM creator_drafts WHERE operation_id=?").get(parsed.operation_id);
      if (old) return this.snapshot(record(old, CreatorDraftSchema).id);
      const id = randomUUID(); const draft: CreatorDraft = { id, ...parsed, template_id: `creator_${id.replaceAll("-", "")}`, status: "draft", foundation: null, last_input: null, reference_asset_ids: [], limits: this.limits, model: this.model, latest_saved_version: null, created_at: this.now(), updated_at: this.now() };
      this.db.prepare("INSERT INTO creator_drafts(id,operation_id,updated_at,document) VALUES(?,?,?,?)").run(id, parsed.operation_id, draft.updated_at, JSON.stringify(draft)); return this.snapshot(id);
    });
  }
  claimGeneration(id: string, value: GenerateFoundationInput): { attempt: CreatorAttempt; claim_token: string | null } {
    const input = GenerateFoundationSchema.parse(value);
    return this.transaction(() => {
      const draft = this.draft(id); this.expire(id);
      const fingerprint = digest(JSON.stringify({ input, model: draft.model }));
      const prior = this.db.prepare("SELECT document FROM creator_attempts WHERE operation_id=?").get(input.operation_id);
      if (prior) {
        const old = record(prior, InternalAttemptSchema);
        if (old.draft_id !== id || old.fingerprint !== fingerprint) throw new EngineError("operation_conflict", "This operation ID already belongs to a different Creator request.");
        return { attempt: publicAttempt(old), claim_token: null };
      }
      const attempts = this.attempts(id); const last = attempts.at(-1);
      if (attempts.some(item => item.status === "running")) throw new EngineError("creator_running", "This draft already has a request in progress. Wait for its result.");
      if (last && (last.status === "failed" || last.status === "interrupted")) {
        if (input.retry_of !== last.id) throw new EngineError("explicit_retry_required", "Explicitly retry the previous failed request before making another paid attempt.");
        if (last.estimated_micro_usd == null && !input.acknowledge_unknown) throw new EngineError("unknown_cost_confirmation", "The earlier request may have incurred an unknown charge. Confirm this before another paid attempt.");
      } else if (input.retry_of) throw new EngineError("invalid_creator_retry", "Only the latest failed or interrupted attempt can be retried.");
      if (attempts.length >= draft.limits.max_calls) throw new EngineError("creator_call_limit", "This draft has reached its foundation-call limit.", 402);
      // Same verified script rates as the reader; 4,000 input / 5,000 output are planning allowances.
      const reserved = verifiedPrice(draft.model, this.now()) === "script" ? Math.ceil(4000 * .4 + 5000 * 1.6) : null;
      const summary = summarize(attempts);
      if (summary.estimated_micro_usd + summary.held_micro_usd + (reserved ?? 0) > Math.floor(draft.limits.budget_usd * 1e6)) throw new EngineError("creator_budget_limit", "This draft's estimated budget cannot reserve another request. This guard is not a provider billing cap.", 402);
      const attempt: InternalAttempt = { id: randomUUID(), draft_id: id, operation_id: input.operation_id, status: "running", model: draft.model, created_at: this.now(), finished_at: null, reserved_micro_usd: reserved, estimated_micro_usd: null, price_version: reserved == null ? null : PRICES.version, metrics: null, error: null, fingerprint, claim_token: randomUUID(), lease_until: this.now() + this.leaseMs };
      this.db.prepare("INSERT INTO creator_attempts(id,draft_id,operation_id,created_at,document) VALUES(?,?,?,?,?)").run(attempt.id, id, input.operation_id, attempt.created_at, JSON.stringify(attempt));
      draft.last_input = FoundationPromptSchema.parse(Object.fromEntries(Object.keys(FoundationPromptSchema.shape).map(key => [key, input[key as keyof GenerateFoundationInput]]))); draft.updated_at = this.now(); this.putDraft(draft);
      return { attempt: publicAttempt(attempt), claim_token: attempt.claim_token };
    });
  }
  finishGeneration(id: string, attemptId: string, token: string, result: { foundation?: StoryFoundation; metrics: Metrics | null; error?: CreatorError }) {
    return this.transaction(() => {
      const attempt = record(this.db.prepare("SELECT document FROM creator_attempts WHERE id=? AND draft_id=?").get(attemptId, id), InternalAttemptSchema);
      if (attempt.claim_token !== token || !["running", "interrupted"].includes(attempt.status)) throw new EngineError("creator_claim_lost", "This request no longer owns its saved generation stage.");
      const cost = usageCost({ model: attempt.model, stage: "script", price_version: attempt.price_version }, result.metrics);
      attempt.metrics = result.metrics; attempt.estimated_micro_usd = cost.total; attempt.finished_at = this.now();
      // A response arriving after explicit interruption may reconcile accounting,
      // but must not replace a foundation from a newer request.
      if (attempt.status === "running") {
        attempt.status = result.error ? "failed" : "succeeded"; attempt.error = result.error ?? null;
        if (!result.error && result.foundation) { const draft = this.draft(id); draft.foundation = validateStoryFoundation(result.foundation); draft.status = "draft"; draft.updated_at = this.now(); this.putDraft(draft); }
      }
      this.putAttempt(attempt); return this.snapshot(id);
    });
  }
  private addAsset(id: string, input: CreatorAssetInput, kind: "reference" | "artwork"): CreatorAsset {
    if (input.bytes.length === 0 || input.bytes.length > 10 * 1024 * 1024 || (kind === "reference" && input.mime !== "image/png")) throw new EngineError("invalid_creator_asset", "Use a validated PNG reference within the upload limit.", 400);
    if (input.mime === "image/png" && (input.bytes.length < 24 || input.bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || input.bytes.readUInt32BE(16) !== input.width || input.bytes.readUInt32BE(20) !== input.height)) throw new EngineError("invalid_creator_asset", "The normalized reference dimensions could not be verified.", 400);
    const hash = digest(input.bytes); const asset = CreatorAssetSchema.parse({ id: `${kind === "reference" ? "ref" : "art"}_${digest(JSON.stringify([id, hash, input.mime, input.width, input.height, input.purpose])).slice(0, 48)}`, draft_id: id, mime: input.mime, width: input.width, height: input.height, sha256: hash, purpose: input.purpose, kind, created_at: this.now() });
    return this.transaction(() => {
      const draft = this.draft(id);
      if (kind === "reference" && !draft.reference_asset_ids.includes(asset.id) && draft.reference_asset_ids.length >= 3) throw new EngineError("reference_limit", "A story supports up to three active references.", 400);
      const previous = this.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(asset.id, id);
      if (!previous) {
        const folder = path.join(this.directory, "creator", "assets"); mkdirSync(folder, { recursive: true, mode: 0o700 });
        if (realpathSync(folder) !== folder) throw new EngineError("invalid_creator_asset", "The local artwork folder is unavailable.", 500);
        const target = path.join(folder, `${hash}.${input.mime === "image/png" ? "png" : "svg"}`);
        if (existsSync(target)) assetBytes(this.directory, asset);
        else {
          const temporary = `${target}.${randomUUID()}.tmp`; const fd = openSync(temporary, "wx", 0o600);
          try { writeFileSync(fd, input.bytes); fsyncSync(fd); } finally { closeSync(fd); }
          renameSync(temporary, target);
          const parent = openSync(folder, "r"); try { fsyncSync(parent); } finally { closeSync(parent); }
        }
        this.db.prepare("INSERT INTO creator_assets(id,draft_id,document) VALUES(?,?,?)").run(asset.id, id, JSON.stringify(asset));
      }
      if (kind === "reference" && !draft.reference_asset_ids.includes(asset.id)) { draft.reference_asset_ids.push(asset.id); draft.status = "draft"; draft.updated_at = this.now(); this.putDraft(draft); }
      return previous ? record(previous, CreatorAssetSchema) : asset;
    });
  }
  addReference(id: string, input: CreatorAssetInput & { mime: "image/png" }) { return this.addAsset(id, input, "reference"); }
  registerArtwork(id: string, input: CreatorAssetInput) { return this.addAsset(id, input, "artwork"); }
  removeReference(id: string, assetId: string): CreatorSnapshot {
    return this.transaction(() => {
      const draft = this.draft(id); const asset = record(this.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(assetId, id), CreatorAssetSchema);
      if (asset.kind !== "reference") throw new EngineError("creator_asset_not_found", "This reference was not found.", 404);
      draft.reference_asset_ids = draft.reference_asset_ids.filter(value => value !== assetId); draft.status = "draft"; draft.updated_at = this.now(); this.putDraft(draft); return this.snapshot(id);
    });
  }
  readReference(id: string, assetId: string) {
    this.draft(id); const asset = record(this.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(assetId, id), CreatorAssetSchema);
    if (asset.kind !== "reference") throw new EngineError("creator_asset_not_found", "This reference was not found.", 404); return { ...asset, bytes: assetBytes(this.directory, asset) };
  }
  saveTemplate(id: string, value: SaveTemplateInput): CreatorSnapshot {
    const input = SaveTemplateSchema.parse(value); const foundation = validateStoryFoundation(input.foundation);
    return this.transaction(() => {
      const draft = this.draft(id); const fingerprint = digest(JSON.stringify(input));
      const prior = this.db.prepare("SELECT draft_id,fingerprint FROM creator_saves WHERE operation_id=?").get(input.operation_id);
      if (prior) { if (prior.draft_id !== id || prior.fingerprint !== fingerprint) throw new EngineError("operation_conflict", "This save operation ID already belongs to different content."); return this.snapshot(id); }
      if (this.attempts(id).some(attempt => attempt.status === "running")) throw new EngineError("creator_running", "Wait for foundation generation to finish before saving.");
      if (input.opening_asset_ids.length !== foundation.opening_beats.length || new Set(input.reference_asset_ids).size !== input.reference_asset_ids.length) throw new EngineError("invalid_template_assets", "Each opening beat needs artwork and reference IDs must be unique.", 400);
      const lookup = (assetId: string) => record(this.db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(assetId, id), CreatorAssetSchema);
      for (const assetId of new Set([input.cover_asset_id, ...input.opening_asset_ids, ...input.reference_asset_ids])) { const asset = lookup(assetId); assetBytes(this.directory, asset); }
      for (const assetId of input.reference_asset_ids) if (!draft.reference_asset_ids.includes(assetId) || lookup(assetId).kind !== "reference") throw new EngineError("invalid_template_assets", "Only this draft's active reference images may be saved.", 400);
      const version = (draft.latest_saved_version ?? 0) + 1;
      const template = validateStoryTemplate({ ...foundation, id: draft.template_id, version, status: "ready", cover_asset_id: input.cover_asset_id, reference_asset_ids: input.reference_asset_ids, opening_beats: foundation.opening_beats.map((beat, index) => {
        const asset = lookup(input.opening_asset_ids[index]);
        const alt = asset.kind === "artwork" ? `Authored decorative placeholder for opening beat ${index + 1}; the scene is described in the caption below.` : beat.alt;
        return { ...beat, alt, asset_id: asset.id, width: asset.width, height: asset.height };
      }) });
      this.db.prepare("INSERT INTO creator_templates(id,version,draft_id,document) VALUES(?,?,?,?)").run(template.id, template.version, id, JSON.stringify(template));
      this.db.prepare("INSERT INTO creator_saves(operation_id,draft_id,fingerprint,template_id,version) VALUES(?,?,?,?,?)").run(input.operation_id, id, fingerprint, template.id, version);
      draft.foundation = foundation; draft.latest_saved_version = version; draft.status = "ready"; draft.updated_at = this.now(); this.putDraft(draft); return this.snapshot(id);
    });
  }
}
