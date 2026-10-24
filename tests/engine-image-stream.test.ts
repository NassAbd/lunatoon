import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import { GenerationError } from "../src/lib/server/ai";
import type { StoryProvider } from "../src/lib/story-engine/provider";
import type { IllustrationPreview } from "../src/lib/story-engine/image-stream";
import { chapterFixture, operation, measuredMetrics, imageMetrics, jpegBase64 } from "./engine-fixtures";

const stores: StoryStore[] = [], dirs: string[] = [];
const preview = { image_url: `data:image/jpeg;base64,${jpegBase64}`, elapsed_ms: 10 };
async function setup() {
  let now = Date.parse("2026-10-24T10:00:00Z");
  const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-stream-")); dirs.push(dir);
  const store = new StoryStore(dir, { now: () => now, leaseMs: 1000 }); stores.push(store);
  const provider: StoryProvider = {
    prepare() {}, async script() { return { chapter: chapterFixture(), metrics: { ...measuredMetrics } }; },
    async image(panel) { return { panel_id: panel.script.panel_id, image_url: preview.image_url, metrics: imageMetrics }; },
  };
  const engine = new StoryEngine(store, provider);
  const run = store.createRun({ operation_id: operation(), approach: "reference" }, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" }, { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .3 });
  const snapshot = await engine.decide(run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" });
  return { store, provider, engine, run, panel: snapshot.panels[0], advance: () => { now += 2000; } };
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

it("keeps previews transient, rejects duplicate paid submissions and persists only completed output", async () => {
  const s = await setup(); let calls = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  s.provider.image = async (panel, _snapshot, _event, _reference, _signal, onPreview) => {
    calls++; onPreview?.(preview); await gate;
    return { panel_id: panel.script.panel_id, image_url: preview.image_url, metrics: { ...imageMetrics, partial_images_requested: 1, partial_images_received: 1, first_partial_ms: 10 } };
  };
  const previews: IllustrationPreview[] = []; const input = { operation_id: s.panel.operation_id, retry: false };
  const pending = s.engine.image(s.run.id, s.panel.id, input, undefined, value => previews.push(value));
  expect(previews).toHaveLength(1);
  const during = s.engine.snapshot(s.run.id);
  expect(during.panels[0]).toMatchObject({ status: "running", image_path: null, metrics: null });
  expect(JSON.stringify(during)).not.toContain("data:image/jpeg");
  expect(during.nodes[0].metrics?.validation_ms).toBeGreaterThanOrEqual(0);
  await s.engine.image(s.run.id, s.panel.id, input, undefined, value => previews.push(value));
  expect(calls).toBe(1); expect(previews).toHaveLength(1);
  release(); const final = await pending;
  expect(final.panels[0].status).toBe("complete");
  expect(final.panels[1].status).toBe("pending");
  expect(final.events.find(event => event.panel_id === s.panel.id)?.metrics).toMatchObject({ partial_images_received: 1 });
  expect(s.store.readAsset(s.run.id, s.panel.id).bytes.toString("base64")).toBe(jpegBase64);
});

it("fences previews and final output from an expired claim while retaining returned cost", async () => {
  const s = await setup(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  s.provider.image = async (panel, _snapshot, _event, _reference, _signal, onPreview) => {
    await gate; onPreview?.(preview);
    return { panel_id: panel.script.panel_id, image_url: preview.image_url, metrics: imageMetrics };
  };
  const previews: IllustrationPreview[] = [];
  const pending = s.engine.image(s.run.id, s.panel.id, { operation_id: s.panel.operation_id, retry: false }, undefined, value => previews.push(value));
  s.advance(); expect(s.engine.snapshot(s.run.id).panels[0].status).toBe("failed");
  release(); const final = await pending;
  expect(previews).toEqual([]); expect(final.panels[0]).toMatchObject({ status: "failed", image_path: null });
  expect(final.summary.image_calls).toBe(1); expect(final.summary.unknown_cost_attempts).toBe(0);
});

it("does not claim an already cancelled request, and an interrupted stream requires an explicit retry", async () => {
  const s = await setup(); const controller = new AbortController(); let calls = 0;
  s.provider.image = async (_panel, _snapshot, _event, _reference, signal, onPreview) => {
    calls++; onPreview?.(preview);
    await new Promise<void>(resolve => signal?.addEventListener("abort", () => resolve(), { once: true }));
    onPreview?.(preview);
    throw new GenerationError("incomplete_image_stream", "Interrupted test stream", 502, { ...imageMetrics, usage: null });
  };
  const input = { operation_id: s.panel.operation_id, retry: false };
  await expect(s.engine.image(s.run.id, s.panel.id, input, AbortSignal.abort(), () => {})).rejects.toThrow();
  expect(s.engine.snapshot(s.run.id).summary.image_calls).toBe(0);
  const previews: IllustrationPreview[] = [];
  const pending = s.engine.image(s.run.id, s.panel.id, input, controller.signal, value => previews.push(value));
  controller.abort(); const final = await pending;
  expect(previews).toHaveLength(1); expect(final.panels[0]).toMatchObject({ status: "failed", image_path: null });
  expect(final.summary).toMatchObject({ image_calls: 1, unknown_cost_attempts: 1 });
  await s.engine.image(s.run.id, s.panel.id, input); expect(calls).toBe(1);
});

it("checks the preview reservation before claiming an older saved pending image", async () => {
  const s = await setup(); let calls = 0;
  const database = new DatabaseSync(path.join(s.store.directory, "stories.sqlite"));
  const saved = s.engine.snapshot(s.run.id);
  // Simulate a POC4.1 run whose two pending images reserved $0.071 each.
  for (const event of saved.events.filter(event => event.stage === "image")) {
    event.reserved_micro_usd = 71_000;
    database.prepare("UPDATE generation_events SET document=? WHERE id=?").run(JSON.stringify(event), event.id);
  }
  saved.run.limits.budget_usd = .144;
  database.prepare("UPDATE story_runs SET document=? WHERE id=?").run(JSON.stringify(saved.run), saved.run.id);
  database.close();
  s.provider.image = async panel => { calls++; return { panel_id: panel.script.panel_id, image_url: preview.image_url, metrics: imageMetrics }; };
  await expect(s.engine.image(s.run.id, s.panel.id, { operation_id: s.panel.operation_id, retry: false }, undefined, () => {})).rejects.toMatchObject({ code: "estimated_budget_limit" });
  expect(calls).toBe(0); expect(s.engine.snapshot(s.run.id).panels[0].status).toBe("pending");
});
