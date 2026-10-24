import { mkdtempSync, rmSync, unlinkSync, writeFileSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationError } from "../src/lib/server/ai";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import type { StoryProvider } from "../src/lib/story-engine/provider";
import type { NarrativeContext } from "../src/lib/story-engine/contracts";
import { reservation, usageCost, PRICES } from "../src/lib/story-engine/cost";
import { chapterFixture, hammerChapterFixture, operation, measuredMetrics, imageMetrics, jpegBase64 } from "./engine-fixtures";

const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .3 };
const stores: StoryStore[] = [], dirs: string[] = [];
function setup(overrides = {}) {
  let now = Date.parse("2026-10-24T10:00:00Z");
  const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-service-")); dirs.push(dir);
  const db = new StoryStore(dir, { now: () => now, leaseMs: 1000 }); stores.push(db);
  const contexts: NarrativeContext[] = []; let scripts = 0, images = 0, failImage = false, failScript = false;
  const provider: StoryProvider = { prepare() {}, async script(context) { scripts++; contexts.push(context); await Promise.resolve(); if (failScript) throw new Error("mock refusal"); return { chapter: chapterFixture(context), metrics: measuredMetrics }; }, async image(panel) { images++; await Promise.resolve(); if (failImage && panel.sequence === 2) throw new Error("mock timeout"); return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } };
  const engine = new StoryEngine(db, provider);
  const run = db.createRun({ operation_id: operation(), approach: "reference" }, models, { ...limits, ...overrides });
  const decide = () => engine.decide(run.id, { operation_id: operation(), choice_id: "investigate", instruction: "A cyborg cat appears." });
  const illustrate = async () => { const saved = engine.snapshot(run.id); await Promise.all(saved.panels.filter(p => p.status === "pending").map(p => engine.image(run.id, p.id, { operation_id: p.operation_id, retry: false }))); return engine.snapshot(run.id); };
  return { db, engine, run, contexts, provider, decide, illustrate, counts: () => ({ scripts, images }), failImage: (value: boolean) => { failImage = value; }, failScript: (value: boolean) => { failScript = value; }, advance: () => { now += 2000; } };
}
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

describe("persistent orchestration with a mocked provider", () => {
  it("deduplicates concurrent submissions, persists text first, and restores without generation after reopening SQLite", async () => {
    const s = setup(); const input = { operation_id: operation(), choice_id: "investigate", instruction: "A cyborg cat appears." };
    await Promise.all([s.engine.decide(s.run.id, input), s.engine.decide(s.run.id, input)]);
    expect(s.counts()).toEqual({ scripts: 1, images: 0 });
    let saved = s.engine.snapshot(s.run.id); expect(saved.panels.every(p => p.status === "pending")).toBe(true);
    const p = saved.panels[0]; await Promise.all([s.engine.image(s.run.id, p.id, { operation_id: p.operation_id, retry: false }), s.engine.image(s.run.id, p.id, { operation_id: p.operation_id, retry: false })]);
    expect(s.counts().images).toBe(1);
    expect(s.engine.snapshot(s.run.id).panels.map(p => p.status)).toEqual(["complete", "pending"]);
    saved = await s.illustrate(); const imagePaths = saved.panels.map(p => p.image_path);
    s.db.close(); const reopened = new StoryStore(s.db.directory); stores.push(reopened);
    const restored = new StoryEngine(reopened, s.provider).snapshot(s.run.id);
    expect(restored.panels.map(p => p.image_path)).toEqual(imagePaths);
    expect(reopened.readAsset(s.run.id, p.id).bytes.toString("base64")).toBe(jpegBase64);
    expect(s.counts()).toEqual({ scripts: 1, images: 2 });
  });
  it("rejects a destroy continuation that leaves the device intact, retaining the billable attempt", async () => {
    const s = setup(); const saved = await s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "destroy", instruction: "Destroy it with a hammer." });
    expect(saved.nodes[0].status).toBe("script_failed"); expect(saved.summary.script_calls).toBe(1);
    expect(saved.summary.estimated_micro_usd).toBe(912); expect(saved.panels).toHaveLength(0); expect(s.counts().images).toBe(0);
  });
  it("persists hammer destruction without an origin reveal, charges once and deduplicates the operation", async () => {
    const s = setup(); s.provider.script = async () => { const chapter = hammerChapterFixture(); chapter.event.source_clue = null; return { chapter, metrics: measuredMetrics }; };
    const input = { operation_id: operation(), choice_id: "destroy", instruction: "Destroy it with a hammer." };
    let saved = await s.engine.decide(s.run.id, input);
    expect(saved.nodes[0].status).toBe("script_ready"); expect(saved.panels).toHaveLength(2);
    expect(saved.run.state.objects[0].condition).toBe("destroyed");
    expect(saved.summary.script_calls).toBe(1); expect(saved.summary.estimated_micro_usd).toBe(912);
    await s.engine.decide(s.run.id, input); saved = await s.illustrate();
    expect(saved.summary.script_calls).toBe(1); expect(saved.summary.image_calls).toBe(2);
    expect(saved.panels.every(p => p.status === "complete")).toBe(true);
  });
  it("retains actionable second-chapter validation diagnostics and request ID without applying invalid output", async () => {
    const s = setup(); await s.decide(); await s.illustrate();
    s.provider.script = async context => {
      const chapter = chapterFixture(context);
      chapter.panels[1].dialogues = [chapter.panels[1].dialogues[0], { ...chapter.panels[1].dialogues[0], text: "Another line with a duplicated ID." }];
      return { chapter, metrics: { ...measuredMetrics, request_id: "req_mock_second_validation" } };
    };
    const saved = await s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "follow_cat", instruction: "He retreats into a bar." });
    expect(saved.nodes[1].error?.code).toBe("invalid_chapter_contract");
    expect(saved.nodes[1].error?.request_id).toBe("req_mock_second_validation");
    expect(saved.nodes[1].error?.diagnostics).toMatchObject({ phase: "chapter_validation", kind: "schema", issues: [{ path: "panels.1.dialogues", rule: "dialogue_ids_unique" }] });
    expect(saved.run.step).toBe(1); expect(saved.panels).toHaveLength(2);
    expect(saved.summary.script_calls).toBe(2); expect(saved.summary.image_calls).toBe(2); expect(saved.summary.unknown_cost_attempts).toBe(0);
    expect(saved.summary.estimated_micro_usd).toBe(39764);
  });
  it("continues from two saved causal facts and appearance, ends in two decisions and never mixes runs", async () => {
    const s = setup(); await s.decide(); await s.illustrate();
    await s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "follow_cat", instruction: "" }); await s.illustrate();
    expect(s.contexts[1].state.facts.map(f => f.id)).toEqual(expect.arrayContaining(["device_source", "cat_access"]));
    expect(s.contexts[1].state.characters[0].injuries).toContain("A shallow cut on his right hand");
    expect(s.contexts[1].recent_panels).toHaveLength(2);
    const saved = s.engine.snapshot(s.run.id); expect(saved.run.status).toBe("ended"); expect(saved.panels).toHaveLength(4);
    await expect(s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "follow_cat", instruction: "" })).rejects.toThrow(/ended/);
    const other = s.db.createRun({ operation_id: operation(), approach: "text" }, models, limits);
    await expect(s.engine.image(other.id, saved.panels[0].id, { operation_id: saved.panels[0].operation_id, retry: false })).rejects.toThrow(/belong/);
    expect(s.engine.snapshot(other.id).run.state.facts).toHaveLength(2);
  });
  it("isolates an image failure and requires explicit paid retry without regenerating siblings or script", async () => {
    const s = setup(); await s.decide(); s.failImage(true); let saved = await s.illustrate();
    expect(saved.panels.map(p => p.status)).toEqual(["complete", "failed"]); expect(saved.summary.unknown_cost_attempts).toBe(1);
    const failed = saved.panels[1]; await expect(s.engine.image(s.run.id, failed.id, { operation_id: operation(), retry: false })).rejects.toThrow(/failed image/);
    s.failImage(false); saved = await s.engine.image(s.run.id, failed.id, { operation_id: operation(), retry: true });
    expect(saved.panels.every(p => p.status === "complete")).toBe(true); expect(s.counts()).toEqual({ scripts: 1, images: 3 });
    expect(saved.summary.reference_input_micro_usd).toBe(23040);
  });
  it("records script failures, releases unused images, and only explicitly retries script", async () => {
    const s = setup(); s.failScript(true); let saved = await s.decide();
    expect(saved.nodes[0].status).toBe("script_failed"); expect(saved.summary.image_slots_reserved).toBe(0); expect(saved.run.step).toBe(0);
    s.failScript(false); saved = await s.engine.script(s.run.id, saved.nodes[0].id, { operation_id: operation(), retry: true });
    expect(saved.run.step).toBe(1); expect(s.counts()).toEqual({ scripts: 2, images: 0 });
  });
  it("retains usage on billable refusals and rejects invalid proposed state without applying it", async () => {
    const s = setup(); s.provider.script = async () => { throw new GenerationError("script_refused", "Mock refusal", 422, measuredMetrics); };
    let saved = await s.decide(); expect(saved.summary.estimated_micro_usd).toBe(912); expect(saved.summary.unknown_cost_attempts).toBe(0);
    s.provider.script = async () => { const invalid = chapterFixture(); invalid.story_state_updates.facts_added[0].id = "device_knows_kael"; return { chapter: invalid, metrics: measuredMetrics }; };
    saved = await s.engine.script(s.run.id, saved.nodes[0].id, { operation_id: operation(), retry: true });
    expect(saved.run.step).toBe(0); expect(saved.panels).toEqual([]); expect(saved.nodes[0].error?.code).toBe("invalid_story_state");
    expect(saved.summary.script_calls).toBe(2); expect(saved.summary.estimated_micro_usd).toBe(1824);
  });
  it("blocks a second stage's operation ID before using a provider", async () => {
    const s = setup(); const saved = await s.decide();
    await expect(s.engine.image(s.run.id, saved.panels[0].id, { operation_id: saved.nodes[0].operation_id, retry: false })).rejects.toThrow(/another stage/);
    expect(s.counts().images).toBe(0);
  });
  it("keeps hard call limits effective when model prices are unknown", async () => {
    const s = setup(); const run = s.db.createRun({ operation_id: operation(), approach: "text" }, { ...models, image: "unpriced-test-model" }, { ...limits, max_image_calls: 2 });
    let saved = await s.engine.decide(run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" });
    expect(saved.summary.unpriced_reservations).toBe(2);
    await Promise.all(saved.panels.map(p => s.engine.image(run.id, p.id, { operation_id: p.operation_id, retry: false })));
    saved = s.engine.snapshot(run.id); expect(saved.summary.unknown_cost_attempts).toBe(2);
    expect(() => s.engine.replay(run.id, saved.nodes[0].id, { operation_id: operation(), approach: "text" })).toThrow(/image-call limit/);
    expect(s.counts().images).toBe(2);
  });
  it("enforces hard call limits including reservations and retries with unknown costs", async () => {
    const s = setup({ max_image_calls: 2 }); await s.decide(); s.failImage(true); const saved = await s.illustrate();
    await expect(s.engine.image(s.run.id, saved.panels[1].id, { operation_id: operation(), retry: true })).rejects.toThrow(/image-call limit/);
    expect(s.counts()).toEqual({ scripts: 1, images: 2 });
  });
  it("recovers interrupted stages without calls and fences late script completion", () => {
    const s = setup(); const node = s.db.createNode(s.run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" });
    const claim = s.db.claimScript(s.run.id, node.id, { operation_id: node.operation_id, retry: false })!;
    s.advance(); expect(s.engine.snapshot(s.run.id).nodes[0].status).toBe("script_failed");
    expect(s.db.finishScript(claim, chapterFixture(), measuredMetrics)).toBe(false);
    expect(s.engine.snapshot(s.run.id).run.step).toBe(0); expect(s.counts()).toEqual({ scripts: 0, images: 0 });
  });
  it("recovers an image written before a crash from its receipt without a new call", async () => {
    const s = setup(); await s.decide(); const p = s.engine.snapshot(s.run.id).panels[0];
    const claim = s.db.claimImage(s.run.id, p.id, { operation_id: p.operation_id, retry: false })!;
    const relative = s.db.recordImageReceipt(claim, imageMetrics)!; s.db.writeImage(relative, Buffer.from(jpegBase64, "base64"));
    s.advance(); const saved = s.engine.snapshot(s.run.id); expect(saved.panels[0].status).toBe("complete"); expect(s.counts().images).toBe(0);
  });
  it("fences a late image response after explicit recovery and accounts both billable attempts", async () => {
    const s = setup(); await s.decide(); const panel = s.engine.snapshot(s.run.id).panels[0];
    const normalImage = s.provider.image;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    s.provider.image = async (...args) => { await gate; return normalImage(...args); };
    const original = s.engine.image(s.run.id, panel.id, { operation_id: panel.operation_id, retry: false });
    s.advance(); expect(s.engine.snapshot(s.run.id).panels[0].status).toBe("failed");
    s.provider.image = normalImage;
    const recovered = await s.engine.image(s.run.id, panel.id, { operation_id: operation(), retry: true }); const savedPath = recovered.panels[0].image_path;
    release(); await original;
    const final = s.engine.snapshot(s.run.id); expect(final.panels[0].image_path).toBe(savedPath); expect(final.panels[0].status).toBe("complete");
    expect(final.summary.image_calls).toBe(2); expect(final.summary.unknown_cost_attempts).toBe(0);
  });
  it("marks lost completed files as failures without regenerating, and confines paths and references", async () => {
    const s = setup(); await s.decide(); const saved = await s.illustrate();
    const p = saved.panels[0]; unlinkSync(s.db.safePath(p.image_path!));
    expect(s.engine.snapshot(s.run.id).panels[0].status).toBe("failed"); expect(s.counts().images).toBe(2);
    expect(() => s.db.safePath("../../.env.local")).toThrow(/path/);
    const ref = saved.bible.assets.find(a => a.id === "kael_reference")!; const target = s.db.safePath(ref.path); unlinkSync(target); symlinkSync("/etc/hosts", target);
    expect(() => s.db.readAsset(s.run.id, "kael_reference")).toThrow(/escapes/);
    unlinkSync(target); writeFileSync(target, "tampered"); expect(() => s.db.readAsset(s.run.id, "kael_reference")).toThrow(/integrity/);
  });
  it("replays the same saved script idempotently with an explicit alternate mode and two counted calls", async () => {
    const s = setup(); await s.decide(); let saved = await s.illustrate(); const input = { operation_id: operation(), approach: "text" as const };
    saved = s.engine.replay(s.run.id, saved.nodes[0].id, input); s.engine.replay(s.run.id, saved.nodes[0].id, input);
    expect(saved.summary.image_slots_reserved).toBe(2); await s.illustrate();
    expect(s.counts()).toEqual({ scripts: 1, images: 4 }); expect(s.engine.snapshot(s.run.id).run.step).toBe(1);
  });
});

it("uses verified prices only, expires planning prices and separates measured usage from unknown cost", () => {
  expect(reservation({ model: models.image, stage: "image", approach: "reference", quality: "low" }, Date.parse("2027-01-01"))).toBeNull();
  expect(reservation({ model: "unverified", stage: "image", approach: "text", quality: "low" })).toBeNull();
  expect(usageCost({ model: models.image, stage: "image", price_version: PRICES.version }, imageMetrics)).toEqual({ total: 18970, reference: 11520 });
  expect(usageCost({ model: models.story, stage: "script", price_version: PRICES.version }, measuredMetrics)).toEqual({ total: 912, reference: 0 });
  expect(usageCost({ model: models.image, stage: "image", price_version: null }, imageMetrics).total).toBeNull();
  expect(usageCost({ model: models.story, stage: "script", price_version: PRICES.version }, { ...measuredMetrics, usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3, cached_input_tokens: 10 } }).total).toBeNull();
});
