import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StoryStore } from "../src/lib/story-engine/store";
import { operation, chapterFixture, measuredMetrics } from "./engine-fixtures";

const directories: string[] = [];
const stores: StoryStore[] = [];
export const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
export const limits = { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: 0.3 };
const now = Date.parse("2026-10-24T10:00:00Z");
function store() { const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-engine-")); directories.push(directory); const instance = new StoryStore(directory, { now: () => now }); stores.push(instance); return instance; }
afterEach(() => { for (const instance of stores.splice(0)) instance.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("durable run boundaries", () => {
  it("creates an idempotent run and snapshots original reference paths without paid work", () => {
    const db = store(); const input = { operation_id: operation(), approach: "reference" as const };
    const run = db.createRun(input, models, limits);
    expect(db.createRun(input, models, limits).id).toBe(run.id);
    const snapshot = db.snapshot(run.id);
    expect(snapshot.bible.assets.some((asset) => asset.id === "kael_reference" && asset.path.startsWith("references/"))).toBe(true);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.summary.image_calls).toBe(0);
  });
  it("atomically reserves a node and rejects duplicate steps, payload changes and insufficient budgets", () => {
    const db = store(); const run = db.createRun({ operation_id: operation(), approach: "reference" }, models, limits);
    const input = { operation_id: operation(), choice_id: "investigate", instruction: "A cyborg cat appears." };
    const node = db.createNode(run.id, input);
    expect(db.createNode(run.id, input).id).toBe(node.id);
    expect(() => db.createNode(run.id, { ...input, instruction: "Changed" })).toThrow(/operation/);
    expect(() => db.createNode(run.id, { ...input, operation_id: operation() })).toThrow();
    expect(db.snapshot(run.id).summary.image_slots_reserved).toBe(2);
    const poor = db.createRun({ operation_id: operation(), approach: "reference" }, models, { ...limits, budget_usd: 0.001 });
    expect(() => db.createNode(poor.id, { ...input, operation_id: operation() })).toThrow(/budget/);
    expect(db.snapshot(poor.id).nodes).toEqual([]);
  });
  it("has only one claimant across separate SQLite connections and keeps successful script state atomic", () => {
    const db = store(); const other = new StoryStore(db.directory, { now: () => now }); stores.push(other);
    const run = db.createRun({ operation_id: operation(), approach: "text" }, models, limits);
    const node = db.createNode(run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" });
    const claim = db.claimScript(run.id, node.id, { operation_id: node.operation_id, retry: false });
    expect(claim).not.toBeNull();
    expect(other.claimScript(run.id, node.id, { operation_id: node.operation_id, retry: false })).toBeNull();
    db.finishScript(claim!, chapterFixture(), measuredMetrics);
    const snapshot = other.snapshot(run.id);
    expect(snapshot.run.step).toBe(1);
    expect(snapshot.panels).toHaveLength(2);
    expect(snapshot.run.state.facts.some((fact) => fact.id === "device_source")).toBe(true);
    expect(snapshot.summary.script_calls).toBe(1);
  });
});
