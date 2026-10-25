import OpenAI from "openai";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "../src/lib/server/ai";
import { orderedVisualReferences, visualReferenceInstructions } from "../src/lib/visual-references";
import { StoryEngine } from "../src/lib/story-engine/service";
import { StoryStore } from "../src/lib/story-engine/store";
import { openAIProvider } from "../src/lib/story-engine/provider";
import { imageMetrics, jpegBase64, measuredMetrics, operation } from "./engine-fixtures";
import { runningHellChapter, runningHellTemplate } from "./running-hell-fixtures";

const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: 2 };
const directories: string[] = [], stores: StoryStore[] = [];
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });
function setup() { const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-identity-")); directories.push(directory); const store = new StoryStore(directory, { now: () => Date.parse("2026-10-25T12:00:00Z") }); stores.push(store); return store; }
function digest(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
async function bundle(count: number, canonical = true) {
  const template = runningHellTemplate();
  // These identity details were supplied by the user, not extracted from private files.
  template.character_bible = "Kai Fox is a 15-year-old African-American boy with dark skin, recognizable facial features, a ponytail and a red jacket. He wears the glowing SpeedCore device on his wrist while it remains in his custody.";
  template.reference_asset_ids = Array.from({ length: count }, (_, index) => `ref_${index + 1}`);
  if (canonical) template.visual_references = template.reference_asset_ids.map((asset_id, index) => ({ asset_id, role: index === count - 1 ? "protagonist" as const : "style" as const }));
  const references = await Promise.all(template.reference_asset_ids.map(async (id, index) => ({ id, bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 30 + index * 50, g: 40, b: 50 } } }).png().toBuffer(), mime: "image/png", purpose: "Uploaded visual reference" })));
  return { template, assets: [{ id: "opening", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", purpose: "Synthetic opening" }, ...references] };
}

describe("explicit visual reference authority", () => {
  it("orders declared protagonist, character, environment and style roles without inventing a role", () => {
    expect(orderedVisualReferences(["style", "hero", "setting"], [{ asset_id: "style", role: "style" }, { asset_id: "hero", role: "protagonist" }, { asset_id: "setting", role: "environment" }]).map(item => item.asset_id)).toEqual(["hero", "setting", "style"]);
    expect(orderedVisualReferences(["setting", "other", "hero"], [{ asset_id: "setting", role: "environment" }, { asset_id: "other", role: "character" }, { asset_id: "hero", role: "protagonist" }]).map(item => item.asset_id)).toEqual(["hero", "other", "setting"]);
    const old = orderedVisualReferences(["style_first", "portrait_last"]);
    expect(old).toEqual([{ asset_id: "style_first", role: "unspecified" }, { asset_id: "portrait_last", role: "unspecified" }]);
    expect(visualReferenceInstructions(old, "Kai Fox")).toContain("No canonical protagonist image has been designated");
    expect(visualReferenceInstructions(old, "Kai Fox")).not.toContain("Reference 1: canonical protagonist");
  });

  it("rejects duplicate, unrelated and competing canonical assignments before image work", () => {
    expect(() => orderedVisualReferences(["owned"], [{ asset_id: "other_story", role: "protagonist" }])).toThrow(/reference/i);
    expect(() => orderedVisualReferences(["owned", "owned"])).toThrow(/reference/i);
    expect(() => orderedVisualReferences(["first", "second"], [{ asset_id: "first", role: "protagonist" }, { asset_id: "second", role: "protagonist" }])).toThrow(/reference/i);
    expect(() => orderedVisualReferences(["owned"], [{ asset_id: "owned", role: "style" }, { asset_id: "owned", role: "protagonist" }])).toThrow(/reference/i);
  });

  it.each([1, 2, 3])("uses the same explicitly approved reference with %s inputs across both concurrent chapters and reload", async count => {
    const source = await bundle(count), store = setup();
    const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, source);
    const requests: { prompt: string; names: string[]; hashes: string[] }[] = [];
    let inFlight = 0, maximumInFlight = 0;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      if (String(url) === "data:,") return new Response();
      expect(String(url)).toContain("/images/edits");
      const form = init?.body as FormData; const files = (count === 1 ? [form.get("image")] : form.getAll("image[]")) as File[];
      requests.push({ prompt: String(form.get("prompt")), names: files.map(file => file.name), hashes: await Promise.all(files.map(async file => digest(Buffer.from(await file.arrayBuffer())))) });
      expect(form.get("model")).toBe(models.image); expect(form.get("quality")).toBe("low"); expect(form.get("size")).toBe("1024x1536"); expect(form.get("n")).toBe("1"); expect(form.get("input_fidelity")).toBeNull();
      maximumInFlight = Math.max(maximumInFlight, ++inFlight); await new Promise(resolve => setTimeout(resolve, 5)); inFlight--;
      return Response.json({ created: 1, data: [{ b64_json: jpegBase64 }], usage: { input_tokens: 2000, output_tokens: 100, total_tokens: 2100, input_tokens_details: { text_tokens: 500, image_tokens: 1500 } } }, { headers: { "x-request-id": "req_synthetic_identity" } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    const real = openAIProvider();
    const engine = new StoryEngine(store, { prepare() {}, script: async context => ({ chapter: runningHellChapter(context.step === 2), metrics: measuredMetrics }), image: real.image });
    for (const step of [1, 2]) {
      const written = await engine.decide(run.id, { operation_id: operation(), choice_id: step === 1 ? "stop_nexus" : "disable_relay", instruction: "" });
      expect(written.nodes.at(-1)?.error).toBeNull();
      await Promise.all(written.panels.filter(panel => panel.status === "pending").map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    }
    expect(requests).toHaveLength(4); expect(maximumInFlight).toBe(2);
    const order = [source.template.reference_asset_ids.at(-1)!, ...source.template.reference_asset_ids.slice(0, -1)];
    for (const request of requests) {
      expect(request.names).toEqual(order.map(id => `${id}.png`));
      expect(request.hashes).toEqual(order.map(id => digest(source.assets.find(asset => asset.id === id)!.bytes)));
      for (const attribute of ["15-year-old", "African-American", "dark skin", "facial features", "ponytail", "red jacket", "wrist"]) expect(request.prompt).toContain(attribute);
      expect(request.prompt).toContain("Reference 1: canonical protagonist");
      expect(request.prompt).toContain("Lighting, expression, pose and camera distance must not change");
      expect(request.prompt).not.toMatch(/Kael|New Kyoto|mustard/);
    }
    expect(requests[0].prompt).toContain('"holder":"kai_fox"');
    expect(requests[2].prompt).toContain('"holder":null');
    expect(requests[2].prompt).toContain("wrist strap empty");
    const done = engine.snapshot(run.id); expect(done.run.status).toBe("ended"); expect(done.panels.every(panel => panel.status === "complete")).toBe(true);
    expect(done.panels.every(panel => panel.metrics?.prompt_version === "story-visual-08.3-identity")).toBe(true);
    const reopened = new StoryStore(store.directory); stores.push(reopened); expect(reopened.snapshot(run.id)).toEqual(done); expect(requests).toHaveLength(4);
    expect(() => store.readAsset(run.id, "kael_reference")).toThrow();
  });

  it("keeps an unassigned Creator's original reference order and never silently uses its opening as a reference", async () => {
    const source = await bundle(3, false), store = setup();
    const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, source);
    const received: ai.ReferenceImage[][] = [];
    const engine = new StoryEngine(store, { prepare() {}, script: async () => ({ chapter: runningHellChapter(), metrics: measuredMetrics }), image: async (panel, _snapshot, _event, references) => { received.push(references); return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } });
    const written = await engine.decide(run.id, { operation_id: operation(), choice_id: "stop_nexus", instruction: "" });
    await Promise.all(written.panels.map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    expect(received).toHaveLength(2);
    for (const references of received) expect(references.map(reference => reference.name)).toEqual(["ref_1.png", "ref_2.png", "ref_3.png"]);
    expect(engine.snapshot(run.id).bible.template?.visual_references).toBeUndefined();
  });

  it("preserves the written identity with zero inputs in explicitly selected text mode", async () => {
    const source = await bundle(0, false), store = setup();
    const run = store.createRun({ operation_id: operation(), approach: "text" }, models, limits, source);
    const prompts: string[] = [];
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      expect(String(url)).toContain("/images/generations");
      const body = JSON.parse(String(init?.body)) as { prompt: string }; prompts.push(body.prompt);
      return Response.json({ created: 1, data: [{ b64_json: jpegBase64 }] });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    const engine = new StoryEngine(store, { prepare() {}, script: async () => ({ chapter: runningHellChapter(), metrics: measuredMetrics }), image: openAIProvider().image });
    const written = await engine.decide(run.id, { operation_id: operation(), choice_id: "stop_nexus", instruction: "" });
    await Promise.all(written.panels.map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) { expect(prompt).toContain(source.template.character_bible); expect(prompt).toContain("No input reference images are attached"); expect(prompt).not.toContain("Reference 1:"); }
  });

  it("keeps the pinned reference selection on an explicit isolated retry with no automatic second call", async () => {
    const source = await bundle(3), store = setup();
    const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, source);
    const calls: { panel: string; ids: (string | undefined)[] }[] = [];
    const engine = new StoryEngine(store, { prepare() {}, script: async () => ({ chapter: runningHellChapter(), metrics: measuredMetrics }), image: async (panel, _snapshot, _event, references) => {
      calls.push({ panel: panel.id, ids: references.map(reference => reference.asset_id) });
      if (calls.length === 1) throw new ai.GenerationError("image_stream_failed", "Synthetic transport interruption", 502, { ...imageMetrics, usage: null });
      return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics };
    } });
    const written = await engine.decide(run.id, { operation_id: operation(), choice_id: "stop_nexus", instruction: "" });
    await Promise.all(written.panels.map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    const failed = engine.snapshot(run.id), failedPanel = failed.panels.find(panel => panel.status === "failed")!, sibling = failed.panels.find(panel => panel.status === "complete")!;
    expect(calls).toHaveLength(2); expect(failed.summary.unknown_cost_attempts).toBe(1);
    await engine.image(run.id, failedPanel.id, { operation_id: failedPanel.operation_id, retry: false }); expect(calls).toHaveLength(2);
    // Mutating the caller's original source must not alter the saved run's authority.
    source.template.visual_references = [{ asset_id: "ref_1", role: "protagonist" }];
    const repaired = await engine.image(run.id, failedPanel.id, { operation_id: operation(), retry: true });
    expect(calls).toHaveLength(3); expect(calls[2].panel).toBe(failedPanel.id);
    expect(calls.every(call => call.ids.join(",") === "ref_3,ref_1,ref_2")).toBe(true);
    expect(repaired.panels.find(panel => panel.id === sibling.id)).toEqual(sibling);
    expect(repaired.panels.every(panel => panel.status === "complete")).toBe(true);
    expect(repaired.summary.script_calls).toBe(1); expect(repaired.summary.image_calls).toBe(3);
  });
});
