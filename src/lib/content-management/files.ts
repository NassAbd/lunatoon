import { randomUUID, createHash } from "node:crypto";
import { closeSync, constants, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EngineError } from "../story-engine/errors";
import { assertContentAvailable, withContentWriteLock } from "./gate";

const UUID = "[a-f0-9-]{36}";
const TARGET = `(?:references/[a-f0-9]{64}\\.(?:png|jpg|webp|svg|md)|creator/assets/[a-f0-9]{64}\\.(?:png|jpg|svg)|images/${UUID}/${UUID}\\.jpg)`;
const targetPattern = new RegExp(`^${TARGET}$`);
const ownedPattern = new RegExp(`^${TARGET}(?:\\.${UUID}\\.tmp)?$`);
const IntentSchema = z.object({ owner_kind: z.enum(["run", "draft", "template"]), owner_id: z.string().min(1).max(100), path: z.string().regex(targetPattern), temporary: z.string().regex(ownedPattern), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().refine(value => value.temporary.startsWith(`${value.path}.`) && new RegExp(`^${UUID}\\.tmp$`).test(value.temporary.slice(value.path.length + 1)), "Temporary path must belong to its exact target.").refine(value => value.owner_kind === "run" ? z.uuid().safeParse(value.owner_id).success && value.path.startsWith(`images/${value.owner_id}/`) : value.owner_kind === "draft" ? z.uuid().safeParse(value.owner_id).success && /^(creator\/assets|references)\//.test(value.path) : /^[a-z][a-z0-9_-]{0,59}$/.test(value.owner_id) && value.path.startsWith("references/"), "File intent must match its owning record.");
export const isOwnedRelativePath = (relative: string) => ownedPattern.test(relative);
export type FileIntent = z.infer<typeof IntentSchema>;
const JOURNAL = "content-write-intents.jsonl";
function unsafe(): never { throw new EngineError("unsafe_cleanup_path", "An owned file path could not be verified. Its cleanup remains pending.", 409); }
export function lstatOrMissing(filename: string) {
  try { return lstatSync(filename); }
  catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined; throw error; }
}
/** No symlink in any component, including links that resolve inside the data folder. */
export function safeOwnedFile(directory: string, relative: string, createParents = false) {
  if (!ownedPattern.test(relative)) unsafe();
  const root = realpathSync(directory); const pieces = relative.split("/"); let current = root;
  for (const [index, piece] of pieces.entries()) {
    current = path.join(current, piece);
    const entry = lstatOrMissing(current);
    if (entry) {
      if (entry.isSymbolicLink() || (index < pieces.length - 1 ? !entry.isDirectory() : !entry.isFile())) unsafe();
    } else if (createParents && index < pieces.length - 1) mkdirSync(current, { mode: 0o700 });
  }
  return current;
}
function journalPath(directory: string) {
  const target = path.join(realpathSync(directory), JOURNAL);
  try { const entry = lstatSync(target); if (!entry.isFile() || entry.isSymbolicLink()) unsafe(); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  return target;
}
export function readFileIntents(directory: string): FileIntent[] {
  const filename = journalPath(directory); if (!lstatOrMissing(filename)) return [];
  if (lstatSync(filename).size > 32 * 1024 * 1024) throw new EngineError("file_intent_limit", "The local file journal needs manual review before cleanup.", 409);
  const source = readFileSync(filename, "utf8");
  // A partial final append precedes the asset write and owns no bytes yet.
  return source.slice(0, source.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map(line => IntentSchema.parse(JSON.parse(line) as unknown));
}
/** The fsynced intent survives a later SQLite rollback; no content bytes enter the journal. */
export function writeManagedAsset(directory: string, input: { owner_kind: FileIntent["owner_kind"]; owner_id: string; path: string; bytes: Buffer }) {
  return withContentWriteLock(directory, () => {
    assertContentAvailable(directory, input.owner_kind, input.owner_id);
    const target = safeOwnedFile(directory, input.path, true);
    const relativeTemporary = `${input.path}.${randomUUID()}.tmp`;
    const temporary = safeOwnedFile(directory, relativeTemporary);
    const intent = IntentSchema.parse({ owner_kind: input.owner_kind, owner_id: input.owner_id, path: input.path, temporary: relativeTemporary, sha256: createHash("sha256").update(input.bytes).digest("hex") });
    const journalFile = journalPath(directory);
    const previous = lstatOrMissing(journalFile) ? readFileSync(journalFile) : Buffer.alloc(0);
    const journal = openSync(journalFile, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try { if (previous.length && previous.at(-1) !== 10) ftruncateSync(journal, previous.lastIndexOf(10) + 1); writeFileSync(journal, `${JSON.stringify(intent)}\n`); fsyncSync(journal); } finally { closeSync(journal); }
    const root = openSync(realpathSync(directory), "r"); try { fsyncSync(root); } finally { closeSync(root); }
    const file = openSync(temporary, "wx", 0o600);
    try { writeFileSync(file, input.bytes); fsyncSync(file); } finally { closeSync(file); }
    renameSync(temporary, target);
    const parent = openSync(path.dirname(target), "r"); try { fsyncSync(parent); } finally { closeSync(parent); }
  });
}
