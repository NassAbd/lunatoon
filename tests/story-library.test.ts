import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listSavedRuns } from "../src/lib/story-library";
import { SCHEMA_SQL, SCHEMA_VERSION } from "../src/lib/story-engine/schema";

const directories: string[] = [];
const connections: DatabaseSync[] = [];
const now = Date.parse("2026-10-24T10:00:00Z");
function temporary() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-library-"));
  directories.push(directory);
  return directory;
}
function fixture() {
  const directory = temporary();
  const db = new DatabaseSync(path.join(directory, "stories.sqlite"));
  connections.push(db);
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO stories VALUES (?, ?)").run("neon", JSON.stringify({ title: "Neon Protocol", character_bible: "Private bible", assets: ["private-reference"] }));
  return { directory, db };
}
function addRun(db: DatabaseSync, options: { id?: string; created_at?: number; step?: number; status?: "active" | "ended"; max_steps?: number } = {}) {
  const id = options.id ?? randomUUID();
  const document = { id, operation_id: randomUUID(), story_id: "neon", status: "active", step: 0, created_at: now, updated_at: now + 100, limits: { max_steps: 2 }, state: { facts: ["Private story fact"] }, models: { story: "private-model" }, ...options };
  document.limits = { max_steps: options.max_steps ?? 2 };
  db.prepare("INSERT INTO story_runs VALUES (?, ?, ?, ?)").run(id, document.operation_id, "neon", JSON.stringify(document));
  return id;
}
function addNode(db: DatabaseSync, runId: string, step: number, status: string, panels: string[] = []) {
  const id = randomUUID();
  db.prepare("INSERT INTO story_nodes VALUES (?, ?, ?, ?, ?)").run(id, runId, step, randomUUID(), JSON.stringify({ status, instruction: "Private reader instruction", chapter: { panels: "Private dialogue" }, error: { message: "Private diagnostic" } }));
  panels.forEach((status, index) => db.prepare("INSERT INTO comic_panels VALUES (?, ?, ?, ?)").run(randomUUID(), id, index + 1, JSON.stringify({ status, image_path: "images/absent.jpg", script: "Private script", visual_brief: "Private prompt" })));
  return id;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const db of connections.splice(0)) if (db.isOpen) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("read-only saved story summaries", () => {
  it("returns an empty page without creating missing directories or database files", () => {
    const directory = temporary();
    const missing = path.join(directory, "not-created");
    expect(listSavedRuns({ directory: missing })).toEqual({ runs: [], has_next: false, page: 1 });
    expect(existsSync(missing)).toBe(false);
    expect(listSavedRuns({ directory })).toEqual({ runs: [], has_next: false, page: 1 });
    expect(readdirSync(directory)).toEqual([]);
    vi.stubEnv("LUNATOON_DATA_DIR", missing);
    expect(listSavedRuns().runs).toEqual([]);
    expect(existsSync(missing)).toBe(false);
  });

  it("orders recent sessions with a stable ID tie-break, paginates and bounds inputs", () => {
    const { directory, db } = fixture();
    const ids = Array.from({ length: 14 }, (_, index) => addRun(db, { created_at: now + Math.floor(index / 2) }));
    const expected = ids.map((id, index) => ({ id, time: Math.floor(index / 2) })).sort((a, b) => b.time - a.time || b.id.localeCompare(a.id)).map(row => row.id);
    const first = listSavedRuns({ directory });
    const second = listSavedRuns({ directory, page: 2 });
    const third = listSavedRuns({ directory, page: 3 });
    expect(first).toMatchObject({ has_next: true, page: 1 });
    expect(second).toMatchObject({ has_next: true, page: 2 });
    expect(third).toMatchObject({ has_next: false, page: 3 });
    expect([...first.runs, ...second.runs, ...third.runs].map(run => run.id)).toEqual(expected);
    expect(listSavedRuns({ directory, limit: 12 }).runs).toHaveLength(12);
    expect(listSavedRuns({ directory, page: 4 }).runs).toEqual([]);
    for (const invalid of [{ page: 0 }, { page: 1.5 }, { page: 10_001 }, { limit: 0 }, { limit: 13 }, { limit: Number.NaN }]) expect(() => listSavedRuns({ directory, ...invalid })).toThrow();
  });

  it("reports saved stage states honestly, including endings awaiting illustrations", () => {
    const { directory, db } = fixture();
    const fresh = addRun(db);
    const writing = addRun(db); addNode(db, writing, 1, "script_running");
    const illustrating = addRun(db, { step: 1 }); addNode(db, illustrating, 1, "images_running", ["complete", "running"]);
    const ready = addRun(db, { step: 1 }); addNode(db, ready, 1, "complete", ["complete", "complete"]);
    const scriptFailed = addRun(db); addNode(db, scriptFailed, 1, "script_failed");
    const imageFailed = addRun(db, { step: 1 }); addNode(db, imageFailed, 1, "partial", ["failed", "complete"]);
    const endingPending = addRun(db, { step: 2, status: "ended" }); addNode(db, endingPending, 1, "complete", ["complete", "complete"]); addNode(db, endingPending, 2, "script_ready", ["pending", "pending"]);
    const completed = addRun(db, { step: 2, status: "ended" }); addNode(db, completed, 1, "complete", ["complete", "complete"]); addNode(db, completed, 2, "complete", ["complete", "complete"]);
    const summaries = new Map(listSavedRuns({ directory, limit: 12 }).runs.map(run => [run.id, run]));
    expect(summaries.get(fresh)?.status).toBe("new");
    expect(summaries.get(writing)?.status).toBe("in_progress");
    expect(summaries.get(illustrating)).toMatchObject({ status: "illustrating", completed_panels: 1, total_panels: 4 });
    expect(summaries.get(ready)?.status).toBe("in_progress");
    expect(summaries.get(scriptFailed)?.status).toBe("needs_attention");
    expect(summaries.get(imageFailed)?.status).toBe("needs_attention");
    expect(summaries.get(endingPending)).toMatchObject({ status: "illustrating", completed_panels: 2, total_panels: 4 });
    expect(summaries.get(completed)).toMatchObject({ status: "completed", step: 2, max_steps: 2, completed_panels: 4, total_panels: 4 });
  });

  it("projects only safe summary fields without private narrative, diagnostics or generation metadata", () => {
    const { directory, db } = fixture();
    const id = addRun(db, { step: 1 }); addNode(db, id, 1, "complete", ["complete", "complete"]);
    const result = listSavedRuns({ directory });
    expect(result.runs).toEqual([{ id, title: "Neon Protocol", status: "in_progress", step: 1, max_steps: 2, created_at: now, updated_at: now + 100, completed_panels: 2, total_panels: 4 }]);
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it("does not recover expired work, inspect missing assets or change saved records", () => {
    const { directory, db } = fixture();
    const id = addRun(db, { step: 1 });
    const nodeId = addNode(db, id, 1, "images_running", ["complete", "running"]);
    db.prepare("INSERT INTO generation_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), id, nodeId, null, "image", 2, randomUUID(), "running", JSON.stringify({ status: "running", lease_until: 1, asset_path: "images/missing.jpg", metrics: { request_id: "private-request" } }));
    const tables = ["stories", "story_runs", "story_nodes", "comic_panels", "generation_events"];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const changes = db.prepare("SELECT total_changes() AS count").get()?.count;
    expect(listSavedRuns({ directory }).runs[0]).toMatchObject({ status: "illustrating", completed_panels: 1 });
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(before);
    expect(db.prepare("SELECT total_changes() AS count").get()?.count).toBe(changes);
    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(SCHEMA_VERSION);
    expect(readdirSync(directory)).toEqual(["stories.sqlite"]);
  });

  it("reads committed WAL data during a writer transaction without acquiring a write lock", () => {
    const { directory, db } = fixture();
    db.exec("PRAGMA journal_mode=WAL");
    const id = addRun(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE story_runs SET document=json_set(document, '$.step', 1) WHERE id=?").run(id);
      expect(listSavedRuns({ directory }).runs[0]).toMatchObject({ id, step: 0, status: "new" });
    } finally {
      db.exec("ROLLBACK");
    }
    expect(listSavedRuns({ directory }).runs[0].step).toBe(0);
  });

  it("rejects unsupported database versions without migration or writes", () => {
    const { directory, db } = fixture();
    addRun(db);
    for (const version of [0, SCHEMA_VERSION + 1]) {
      db.exec(`PRAGMA user_version=${version}`);
      expect(() => listSavedRuns({ directory })).toThrow(/version/i);
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(version);
      expect(db.prepare("SELECT count(*) AS count FROM story_runs").get()?.count).toBe(1);
    }
  });
});
