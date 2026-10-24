import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, fsyncSync, openSync, closeSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BibleSchema, EventSchema, RunSchema } from "../story-engine/contracts";
import { CreatorAssetSchema, CreatorDraftSchema } from "../creator/contracts";
import { EngineError } from "../story-engine/errors";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../story-engine/schema";
import { BeginDeletionSchema, DeletionTargetSchema, type BeginDeletionInput, type DeletionPreview, type DeletionReceipt, type DeletionTarget } from "./contracts";
import { hasDeletionTables, isContentDeleted, safeDatabaseFile, withContentWriteLock, type ContentKind } from "./gate";
import { isOwnedRelativePath, lstatOrMissing, readFileIntents, safeOwnedFile } from "./files";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const PlanSchema = z.object({ kind: z.enum(["run", "creator"]), id: z.uuid(), template_id: z.string().nullable(), run_ids: z.array(z.uuid()), bible_ids: z.array(z.string()), creation_operations: z.array(z.object({ kind: z.enum(["run_operation", "draft_operation"]), id: z.uuid() }).strict()) }).strict();
type Plan = z.infer<typeof PlanSchema>;
type OwnedFile = { path: string; sha256: string | null };
type Job = { operation_id: string; kind: "run" | "creator"; target_id: string; fingerprint: string; phase: string; plan_json: string; error_code: string | null };
function object(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row) throw new EngineError("content_not_found", "This local content was not found.", 404);
  return z.record(z.string(), z.unknown()).parse(JSON.parse(z.string().parse(row.document)) as unknown);
}
function table(db: DatabaseSync, name: string) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function job(db: DatabaseSync, id: string): Job {
  const row = db.prepare("SELECT * FROM deletion_jobs WHERE operation_id=?").get(id);
  if (!row) throw new EngineError("deletion_not_found", "This deletion receipt was not found.", 404);
  return { operation_id: z.string().parse(row.operation_id), kind: z.enum(["run", "creator"]).parse(row.kind), target_id: z.string().parse(row.target_id), fingerprint: z.string().parse(row.fingerprint), phase: z.string().parse(row.phase), plan_json: z.string().parse(row.plan_json), error_code: z.string().nullable().parse(row.error_code) };
}
function receipt(db: DatabaseSync, value: Job): DeletionReceipt {
  const plan = PlanSchema.parse(JSON.parse(value.plan_json) as unknown);
  const remaining = Number(db.prepare("SELECT count(*) AS n FROM deletion_files WHERE job_id=? AND status='pending'").get(value.operation_id)?.n ?? 0);
  return { operation_id: value.operation_id, kind: value.kind, id: value.target_id, status: value.phase === "complete" ? "complete" : value.error_code ? "cleanup_failed" : "pending", deleted_run_count: ["records_removed", "complete"].includes(value.phase) ? plan.run_ids.length : 0, remaining_files: remaining, error_code: value.error_code };
}
export class ContentDeletionService {
  readonly directory: string;
  private now: () => number;
  private checkpoint: (phase: "marked" | "creator_removed" | "records_removed" | "file_removed") => void;
  constructor(directory = process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data"), options: { now?: () => number; checkpoint?: ContentDeletionService["checkpoint"] } = {}) {
    this.directory = path.resolve(directory); this.now = options.now ?? Date.now; this.checkpoint = options.checkpoint ?? (() => {});
  }
  private read<T>(absent: T, work: (db: DatabaseSync) => T): T {
    const filename = path.join(this.directory, "stories.sqlite"); if (!lstatOrMissing(filename)) return absent;
    const db = new DatabaseSync(safeDatabaseFile(this.directory, "stories.sqlite"), { readOnly: true, timeout: 5000 }); try { if (Number(db.prepare("PRAGMA user_version").get()?.user_version) !== SCHEMA_VERSION) throw new EngineError("content_storage_version", "Use the matching application before managing this local database.", 409); return work(db); } finally { db.close(); }
  }
  private creator<T>(write: boolean, work: (db: DatabaseSync | null) => T): T {
    const filename = path.join(this.directory, "creator.sqlite"); if (!lstatOrMissing(filename)) return work(null);
    const db = new DatabaseSync(safeDatabaseFile(this.directory, "creator.sqlite"), { readOnly: !write, timeout: 5000 });
    try { const version = Number(db.prepare("PRAGMA user_version").get()?.user_version); if (![1, 2].includes(version)) throw new EngineError("content_storage_version", "Use the matching application before managing this Creator database.", 409); if (write) db.exec("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; BEGIN IMMEDIATE"); const result = work(db); if (write) db.exec("COMMIT"); return result; }
    finally { if (db.isTransaction) db.exec("ROLLBACK"); db.close(); }
  }
  private inventory(db: DatabaseSync, target: DeletionTarget): { preview: DeletionPreview; plan: Plan; files: OwnedFile[] } {
    const plan: Plan = { ...target, template_id: null, run_ids: [], bible_ids: [], creation_operations: [] };
    const files = new Map<string, string | null>(); let title = "Saved story", versionCount = 0, activeWork = false, draftRevision = 0;
    const addFile = (relative: string, sha256: string | null = null) => { if (!isOwnedRelativePath(relative)) throw new EngineError("invalid_content_owner", "An owned file path could not be verified.", 409); files.set(relative, sha256); };
    if (target.kind === "creator") this.creator(false, creator => {
      if (!creator) throw new EngineError("content_not_found", "This local Creator story was not found.", 404);
      const draft = CreatorDraftSchema.parse(object(creator.prepare("SELECT document FROM creator_drafts WHERE id=?").get(target.id)));
      if (draft.id !== target.id || draft.template_id !== `creator_${draft.id.replaceAll("-", "")}`) throw new EngineError("invalid_content_owner", "The Creator story ownership could not be verified.", 409);
      title = draft.foundation?.title ?? "Untitled story"; draftRevision = draft.updated_at; plan.template_id = draft.template_id;
      plan.creation_operations.push({ kind: "draft_operation", id: draft.operation_id });
      versionCount = Number(creator.prepare("SELECT count(*) AS n FROM creator_templates WHERE draft_id=?").get(target.id)?.n ?? 0);
      for (const row of creator.prepare("SELECT document FROM creator_assets WHERE draft_id=?").all(target.id)) {
        const asset = CreatorAssetSchema.parse(object(row)); if (asset.draft_id !== target.id) throw new EngineError("invalid_content_owner", "Artwork ownership could not be verified.", 409);
        const relative = asset.mime === "image/jpeg" ? `references/${asset.sha256}.jpg` : `creator/assets/${asset.sha256}.${asset.mime === "image/png" ? "png" : "svg"}`;
        addFile(relative, asset.sha256);
      }
      for (const name of ["creator_attempts", "creator_opening_attempts"]) if (table(creator, name)) for (const row of creator.prepare(`SELECT document FROM ${name} WHERE draft_id=?`).all(target.id)) {
        const attempt = object(row); if (attempt.status === "running" && (typeof attempt.lease_until !== "number" || attempt.lease_until > this.now())) activeWork = true;
      }
      plan.bible_ids = db.prepare("SELECT id,document FROM stories WHERE json_extract(document,'$.template.id')=?").all(draft.template_id).map(row => {
        const bible = BibleSchema.parse(object(row)); if (bible.id !== row.id || bible.template?.id !== draft.template_id) throw new EngineError("invalid_content_owner", "Saved story ownership could not be verified.", 409);
        for (const asset of bible.assets) addFile(asset.path, asset.sha256); return bible.id;
      });
      plan.run_ids = plan.bible_ids.flatMap(id => db.prepare("SELECT id FROM story_runs WHERE story_id=? ORDER BY id").all(id).map(row => z.string().parse(row.id)));
    });
    else plan.run_ids = [target.id];
    const runRevisions: unknown[] = [];
    for (const id of plan.run_ids) {
      const run = RunSchema.parse(object(db.prepare("SELECT document FROM story_runs WHERE id=?").get(id)));
      if (run.id !== id) throw new EngineError("invalid_content_owner", "Run ownership could not be verified.", 409);
      plan.creation_operations.push({ kind: "run_operation", id: run.operation_id }); runRevisions.push([id, run.operation_id, run.updated_at]);
      if (target.kind === "run") title = BibleSchema.parse(object(db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id))).title;
      for (const row of db.prepare("SELECT id,document FROM generation_events WHERE run_id=?").all(id)) {
        const event = EventSchema.parse(object(row)); if (event.id !== row.id || event.run_id !== id) throw new EngineError("invalid_content_owner", "Generation ownership could not be verified.", 409);
        if (event.status === "running" && (event.lease_until == null || event.lease_until > this.now())) activeWork = true;
        if (event.asset_path) { if (event.asset_path !== `images/${id}/${event.id}.jpg`) throw new EngineError("invalid_content_owner", "A generated file does not belong to this run.", 409); addFile(event.asset_path); }
      }
    }
    for (const intent of readFileIntents(this.directory)) if ((intent.owner_kind === "run" && plan.run_ids.includes(intent.owner_id)) || (target.kind === "creator" && ((intent.owner_kind === "draft" && intent.owner_id === target.id) || (intent.owner_kind === "template" && intent.owner_id === plan.template_id)))) {
      if (intent.owner_kind === "run" && !intent.path.startsWith(`images/${intent.owner_id}/`)) throw new EngineError("invalid_content_owner", "A file receipt does not match its run.", 409);
      // Final and temporary names are exact durable receipts, never a wildcard sweep.
      addFile(intent.path, intent.sha256); addFile(intent.temporary);
    }
    plan.run_ids.sort(); plan.bible_ids.sort();
    const revision = hash(JSON.stringify({ ...target, template_id: plan.template_id, runs: runRevisions.sort(), versions: versionCount, draft_revision: draftRevision }));
    return { preview: { ...target, title, run_count: plan.run_ids.length, version_count: versionCount, active_work: activeWork, confirmation_revision: revision }, plan, files: [...files].map(([relative, sha256]) => ({ path: relative, sha256 })) };
  }
  preview(input: DeletionTarget): DeletionPreview {
    const target = DeletionTargetSchema.parse(input);
    if (isContentDeleted(this.directory, target.kind === "run" ? "run" : "draft", target.id)) throw new EngineError("content_deleted", "This content is already being deleted or was removed.", 410);
    let result = this.read<DeletionPreview | null>(null, db => this.inventory(db, target).preview);
    if (!result && target.kind === "creator" && lstatOrMissing(path.join(this.directory, "creator.sqlite"))) {
      const memory = new DatabaseSync(":memory:");
      try { memory.exec(SCHEMA_SQL); result = this.inventory(memory, target).preview; } finally { memory.close(); }
    }
    if (!result) throw new EngineError("content_not_found", "This local content was not found.", 404); return result;
  }
  status(operationId: string): DeletionReceipt {
    z.uuid().parse(operationId); const result = this.read<DeletionReceipt | null>(null, db => hasDeletionTables(db) ? receipt(db, job(db, operationId)) : null);
    if (!result) throw new EngineError("deletion_not_found", "This deletion receipt was not found.", 404); return result;
  }
  list(kind?: "run" | "creator"): DeletionReceipt[] {
    if (kind !== undefined) z.enum(["run", "creator"]).parse(kind);
    return this.read([], db => hasDeletionTables(db) ? db.prepare(`SELECT operation_id FROM deletion_jobs WHERE phase!='complete' ${kind ? "AND kind=?" : ""} ORDER BY created_at DESC LIMIT 100`).all(...(kind ? [kind] : [])).map(row => receipt(db, job(db, z.string().parse(row.operation_id)))) : []);
  }
  begin(value: BeginDeletionInput): DeletionReceipt {
    const input = BeginDeletionSchema.parse(value); const fingerprint = hash(JSON.stringify({ kind: input.kind, id: input.id, confirmation_revision: input.confirmation_revision })); let marked = false;
    const operationId = withContentWriteLock(this.directory, db => {
      const prior = db.prepare("SELECT operation_id FROM deletion_jobs WHERE operation_id=?").get(input.operation_id);
      if (prior) { if (job(db, input.operation_id).fingerprint !== fingerprint) throw new EngineError("operation_conflict", "This deletion operation belongs to a different confirmation.", 409); return input.operation_id; }
      const deleted = db.prepare("SELECT job_id FROM deletion_targets WHERE kind=? AND id=?").get(input.kind === "run" ? "run" : "draft", input.id);
      if (deleted) return z.string().parse(deleted.job_id);
      const { preview, plan, files } = this.inventory(db, { kind: input.kind, id: input.id });
      if (preview.active_work) throw new EngineError("content_busy", "Generation is still in progress. Wait for it to finish before deleting this content.", 409);
      if (preview.confirmation_revision !== input.confirmation_revision) throw new EngineError("confirmation_changed", "This story's contents changed. Review the updated deletion confirmation.", 409);
      db.prepare("INSERT INTO deletion_jobs VALUES(?,?,?,?,?,?,?,?,?)").run(input.operation_id, input.kind, input.id, fingerprint, "marked", JSON.stringify(plan), this.now(), this.now(), null);
      const mark = (kind: ContentKind, id: string) => db.prepare("INSERT OR IGNORE INTO deletion_targets(kind,id,job_id) VALUES(?,?,?)").run(kind, id, input.operation_id);
      for (const id of plan.run_ids) mark("run", id);
      if (plan.kind === "creator") { mark("draft", plan.id); mark("template", plan.template_id!); }
      for (const operation of plan.creation_operations) mark(operation.kind, operation.id);
      for (const file of files) db.prepare("INSERT INTO deletion_files VALUES(?,?,?,?,?)").run(input.operation_id, file.path, file.sha256, "pending", null);
      marked = true; return input.operation_id;
    });
    if (marked) this.checkpoint("marked"); return this.resume(operationId);
  }
  resume(operationId: string): DeletionReceipt {
    z.uuid().parse(operationId); this.status(operationId);
    let phase = withContentWriteLock(this.directory, db => job(db, operationId).phase);
    if (phase === "marked") {
      withContentWriteLock(this.directory, db => {
        const plan = PlanSchema.parse(JSON.parse(job(db, operationId).plan_json) as unknown);
        if (plan.kind === "creator") this.creator(true, creator => {
          if (!creator) return;
          for (const name of ["creator_opening_attempts", "creator_opening_panels", "creator_openings", "creator_draft_saves", "creator_attempts", "creator_saves", "creator_templates", "creator_assets"]) if (table(creator, name)) {
            const hasDraft = creator.prepare(`PRAGMA table_info(${name})`).all().some(column => column.name === "draft_id");
            creator.prepare(`DELETE FROM ${name} WHERE ${hasDraft ? "draft_id" : "template_id"}=?`).run(hasDraft ? plan.id : plan.template_id);
          }
          creator.prepare("DELETE FROM creator_drafts WHERE id=?").run(plan.id);
        });
        db.prepare("UPDATE deletion_jobs SET phase='creator_removed',updated_at=? WHERE operation_id=?").run(this.now(), operationId);
      });
      phase = "creator_removed"; this.checkpoint("creator_removed");
    }
    if (phase === "creator_removed") {
      withContentWriteLock(this.directory, db => {
        const plan = PlanSchema.parse(JSON.parse(job(db, operationId).plan_json) as unknown);
        db.exec("PRAGMA secure_delete=ON");
        for (const id of plan.run_ids) {
          db.prepare("DELETE FROM replay_operations WHERE run_id=?").run(id); db.prepare("DELETE FROM generation_events WHERE run_id=?").run(id);
          db.prepare("DELETE FROM comic_panels WHERE node_id IN (SELECT id FROM story_nodes WHERE run_id=?)").run(id);
          db.prepare("DELETE FROM story_nodes WHERE run_id=?").run(id); db.prepare("DELETE FROM story_runs WHERE id=?").run(id);
        }
        for (const id of plan.bible_ids) db.prepare("DELETE FROM stories WHERE id=? AND NOT EXISTS(SELECT 1 FROM story_runs WHERE story_id=?)").run(id, id);
        db.prepare("UPDATE deletion_jobs SET phase='records_removed',updated_at=? WHERE operation_id=?").run(this.now(), operationId);
      });
      phase = "records_removed"; this.checkpoint("records_removed");
    }
    if (phase === "records_removed") {
      const files = this.read<string[]>([], db => db.prepare("SELECT path FROM deletion_files WHERE job_id=? AND status='pending' ORDER BY path").all(operationId).map(row => z.string().parse(row.path)));
      for (const relative of files) {
        const removed = withContentWriteLock(this.directory, db => {
          try {
            const file = db.prepare("SELECT sha256 FROM deletion_files WHERE job_id=? AND path=? AND status='pending'").get(operationId, relative); if (!file) return false;
            const target = safeOwnedFile(this.directory, relative);
            if (!this.shared(db, relative) && lstatOrMissing(target)) {
              if (typeof file.sha256 === "string" && hash(readFileSync(target)) !== file.sha256) throw new EngineError("cleanup_checksum", "An owned file changed. Cleanup needs review before continuing.", 409);
              unlinkSync(target); const parent = openSync(path.dirname(target), "r"); try { fsyncSync(parent); } finally { closeSync(parent); }
            }
            db.prepare("UPDATE deletion_files SET status='complete',error_code=NULL WHERE job_id=? AND path=?").run(operationId, relative); return true;
          } catch (error) {
            const code = error instanceof EngineError ? error.code : "cleanup_io_error";
            db.prepare("UPDATE deletion_files SET error_code=? WHERE job_id=? AND path=?").run(code, operationId, relative);
            db.prepare("UPDATE deletion_jobs SET error_code=?,updated_at=? WHERE operation_id=?").run(code, this.now(), operationId); return false;
          }
        });
        if (removed) this.checkpoint("file_removed");
      }
      withContentWriteLock(this.directory, db => {
        const remaining = Number(db.prepare("SELECT count(*) AS n FROM deletion_files WHERE job_id=? AND status='pending'").get(operationId)?.n ?? 0);
        if (!remaining) db.prepare("UPDATE deletion_jobs SET phase='complete',error_code=NULL,updated_at=? WHERE operation_id=?").run(this.now(), operationId);
      });
    }
    const result = this.status(operationId);
    if (result.status === "complete") this.checkpointDatabases();
    return result;
  }
  private checkpointDatabases() {
    // Best effort only: concurrent readers may retain WAL pages. Backups and forensic erasure are outside this logical deletion.
    for (const name of ["stories.sqlite", "creator.sqlite"] as const) if (existsSync(path.join(this.directory, name))) {
      let db: DatabaseSync | undefined;
      try { db = new DatabaseSync(safeDatabaseFile(this.directory, name), { timeout: 0 }); db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); }
      catch { /* A busy checkpoint is safe to defer; never force other readers to close. */ }
      finally { db?.close(); }
    }
  }
  private shared(db: DatabaseSync, relative: string): boolean {
    if (relative.includes(".tmp") || relative.startsWith("images/")) return false;
    if (db.prepare("SELECT 1 FROM stories s,json_each(s.document,'$.assets') a WHERE json_extract(a.value,'$.path')=? LIMIT 1").get(relative)) return true;
    return this.creator(false, creator => {
      if (!creator) return false;
      for (const row of creator.prepare("SELECT document FROM creator_assets").all()) {
        const asset = CreatorAssetSchema.parse(object(row));
        const saved = asset.mime === "image/jpeg" ? `references/${asset.sha256}.jpg` : `creator/assets/${asset.sha256}.${asset.mime === "image/png" ? "png" : "svg"}`;
        if (saved === relative) return true;
      }
      for (const intent of readFileIntents(this.directory)) if (intent.path === relative) {
        if (intent.owner_kind === "draft" && !isContentDeleted(this.directory, "draft", intent.owner_id) && creator.prepare("SELECT 1 FROM creator_drafts WHERE id=?").get(intent.owner_id)) return true;
        if (intent.owner_kind === "template" && !isContentDeleted(this.directory, "template", intent.owner_id) && creator.prepare("SELECT 1 FROM creator_drafts WHERE json_extract(document,'$.template_id')=?").get(intent.owner_id)) return true;
      }
      return false;
    });
  }
}
