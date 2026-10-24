import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { EngineError } from "../story-engine/errors";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../story-engine/schema";

export type ContentKind = "run" | "draft" | "template" | "run_operation" | "draft_operation";
export const MANAGEMENT_SQL = `
CREATE TABLE IF NOT EXISTS deletion_jobs(operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, fingerprint TEXT NOT NULL, phase TEXT NOT NULL, plan_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT);
CREATE TABLE IF NOT EXISTS deletion_targets(kind TEXT NOT NULL,id TEXT NOT NULL,job_id TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS deletion_files(job_id TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT,status TEXT NOT NULL, error_code TEXT,PRIMARY KEY(job_id,path));
`;
export function safeDatabaseFile(directory: string, name: "stories.sqlite" | "creator.sqlite") {
  const file = path.join(realpathSync(directory), name);
  try { const entry = lstatSync(file); if (!entry.isFile() || entry.isSymbolicLink()) throw new EngineError("unsafe_database_path", "The local database path could not be verified.", 409); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  return file;
}
const active = new Map<string, DatabaseSync>();
export function hasDeletionTables(db: DatabaseSync) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deletion_targets'").get()); }
export function withContentWriteLock<T>(directory: string, work: (db: DatabaseSync) => T, existingStoryDb?: DatabaseSync): T {
  mkdirSync(directory, { recursive: true, mode: 0o700 }); const root = realpathSync(directory);
  const held = active.get(root); if (held) return work(held);
  const filename = safeDatabaseFile(root, "stories.sqlite"); const existed = existsSync(filename);
  const db = existingStoryDb ?? new DatabaseSync(filename, { timeout: 5000 });
  if (!existed) chmodSync(filename, 0o600);
  try {
    db.exec("PRAGMA foreign_keys=ON;");
    if (!existingStoryDb) db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    db.exec("BEGIN IMMEDIATE"); active.set(root, db);
    try {
      const version = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
      if (version > SCHEMA_VERSION) throw new EngineError("schema_version", "The local database requires a newer application.", 500);
      if (version === 0) db.exec(SCHEMA_SQL);
      db.exec(MANAGEMENT_SQL);
      const value = work(db); db.exec("COMMIT"); return value;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    finally { active.delete(root); }
  } finally { if (!existingStoryDb) db.close(); }
}
export function isContentDeleted(directory: string, kind: ContentKind, id: string): boolean {
  const requested = path.resolve(directory); if (!existsSync(path.join(requested, "stories.sqlite"))) return false;
  const root = realpathSync(requested); const held = active.get(root);
  const db = held ?? new DatabaseSync(safeDatabaseFile(root, "stories.sqlite"), { readOnly: true, timeout: 5000 });
  try { return hasDeletionTables(db) && Boolean(db.prepare("SELECT 1 FROM deletion_targets WHERE kind=? AND id=?").get(kind, id)); }
  finally { if (!held) db.close(); }
}
export function assertContentAvailable(directory: string, kind: ContentKind, id: string) {
  if (isContentDeleted(directory, kind, id)) throw new EngineError("content_deleted", "This local content has been permanently removed or is being deleted.", 410);
}
