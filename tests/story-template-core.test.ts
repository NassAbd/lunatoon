import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import * as ai from "../src/lib/server/ai";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import { applyChapter, validateStoryTemplate } from "../src/lib/story-engine/state";
import { BibleSchema, StoryTemplateSchema, type Chapter, type NarrativeContext } from "../src/lib/story-engine/contracts";
import { openAIProvider, type StoryProvider } from "../src/lib/story-engine/provider";
import { reservation } from "../src/lib/story-engine/cost";
import { buildIllustrationPrompt } from "../src/lib/art-direction";
import { chapterFixture, jpegBase64, measuredMetrics, imageMetrics, operation } from "./engine-fixtures";

const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_script_calls: 3, max_image_calls: 6, budget_usd: .5 };
const now = Date.parse("2026-10-24T10:00:00Z");
const stores: StoryStore[] = [], directories: string[] = [];
function setup() { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-templates-")); directories.push(dir); const store = new StoryStore(dir, { now: () => now }); stores.push(store); return store; }
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
export function lightkeeperTemplate() {
  return StoryTemplateSchema.parse({ id: "last-lightkeeper", version: 1, status: "ready", title: "The Last Lightkeeper", genre: "Coastal fantasy", description: "A keeper follows a fading star.", premise: "Mara finds a tide lantern on the island shore.", world: "A seafoam island with an old lighthouse.", protagonist_id: "mara", character_bible: "Mara wears a rust cloak and has silver braids.", art_direction: "Original coastal flat ink with seafoam and coral.", object_anchor: "Copper tide lantern with a star-shaped lens.", setting_anchor: "Lighthouse island before dawn.", continuity_rules: ["The tide lantern remains copper."], initial_state: { facts: [{ id: "tide_receding", text: "The tide is receding from the island." }], characters: [{ id: "mara", name: "Mara", visual_anchor: "Mara has silver braids and a rust cloak.", injuries: [], clothing_condition: "Dry rust cloak", carried_objects: ["lantern"] }], objects: [{ id: "lantern", name: "Copper tide lantern", condition: "intact", holder: "mara" }], relationships: [], unresolved_threads: ["Why did the light fade?"] }, initial_decision: { question: "What does Mara do with the lantern?", options: [{ id: "light", label: "Light the tide lantern" }, { id: "follow", label: "Follow the receding tide" }, { id: "destroy", label: "Break the lantern to release its star" }] }, opening_beats: [{ caption: "The tide retreats.", alt: "Mara on a seafoam shore", asset_id: "opening", width: 1000, height: 800 }], cover_asset_id: "opening", reference_asset_ids: ["mara_reference"], choice_effects: [{ choice_id: "destroy", object_id: "lantern", condition: "destroyed" }] });
}
function input(template = lightkeeperTemplate()) { return { template, assets: [{ id: "opening", bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", "utf8"), mime: "image/svg+xml", purpose: "Authored opening" }, { id: "mara_reference", bytes: Buffer.from(jpegBase64, "base64"), mime: "image/jpeg", purpose: "Mara reference" }] }; }
function lightChapter(context: NarrativeContext): Chapter {
  const chapter = chapterFixture(context); const ending = context.step === context.max_steps;
  chapter.event = { action: ending ? "Mara guides the star home." : "Mara lights the lantern.", consequence: ending ? "The island's light is restored." : "The lantern reveals a safe path.", source_clue: null };
  chapter.story_state_updates = { facts_added: [{ id: ending ? "island_restored" : "safe_path", text: ending ? "The star restored the island's light." : "The lantern revealed a safe path to the fallen star." }], used_fact_ids: ending ? ["safe_path"] : [], characters_added: [], appearance_changes: [], object_updates: [], relationships_added: [], unresolved_threads: ending ? [] : ["Can the star return?"] };
  chapter.next_decision = ending ? { question: "", options: [] } : { question: "The lantern revealed a safe path. What next?", options: [{ id: "guide", label: "Guide the star home", uses_fact_ids: ["safe_path"] }, { id: "guard", label: "Guard the path for the star", uses_fact_ids: ["safe_path"] }] };
  chapter.panels.forEach(panel => { panel.visual_description = "Mara lifts the copper lantern beside the seafoam lighthouse."; panel.image_prompt = panel.visual_description; panel.dialogues.forEach(bubble => { bubble.character = "Mara"; bubble.text = ending ? "The island has its light again." : "The lantern shows the way."; }); });
  return chapter;
}

describe("immutable shared story templates", () => {
  it("validates initial identity, ownership, choices and asset references before a story can be ready", () => {
    const template = lightkeeperTemplate(); expect(validateStoryTemplate(template)).toEqual(template);
    const wrong = structuredClone(template); wrong.initial_state.objects[0].holder = null;
    expect(() => validateStoryTemplate(wrong)).toThrow(/ownership|holder|carried/i);
    const missing = structuredClone(template); missing.protagonist_id = "unknown";
    expect(() => validateStoryTemplate(missing)).toThrow(/protagonist/i);
    const duplicate = structuredClone(template); duplicate.initial_decision.options[1].id = duplicate.initial_decision.options[0].id;
    expect(() => validateStoryTemplate(duplicate)).toThrow(/unique/i);
    const badEffect = structuredClone(template); badEffect.choice_effects[0].object_id = "unknown";
    expect(() => validateStoryTemplate(badEffect)).toThrow(/object/i);
  });

  it("keeps exact legacy bibles and pins new versions and source bytes without cross-world idempotency", () => {
    const store = setup(); const legacy = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits);
    const before = store.snapshot(legacy.id); expect(before.bible.template).toBeUndefined(); expect(BibleSchema.parse(before.bible)).toEqual(before.bible);
    const request = { operation_id: operation(), approach: "reference" as const, template_id: "last-lightkeeper", template_version: 1 };
    const bundle = input(); const run = store.createRun(request, models, limits, bundle);
    expect(store.snapshot(run.id).run.state.characters[0].id).toBe("mara");
    expect(store.readAsset(run.id, "mara_reference").bytes.toString("base64")).toBe(jpegBase64);
    const changed = input(); changed.template.version = 2; changed.template.title = "New title";
    const newer = store.createRun({ ...request, operation_id: operation(), template_version: 2 }, models, limits, changed);
    expect(newer.story_id).not.toBe(run.story_id);
    expect(store.snapshot(run.id).bible.title).toBe("The Last Lightkeeper");
    expect(() => store.createRun({ ...request, template_version: 2 }, models, limits, changed)).toThrow(/operation/i);
    expect(() => store.createRun({ operation_id: request.operation_id, approach: "reference" }, models, limits)).toThrow(/operation/i);
    changed.template.version = 1;
    expect(() => store.createRun({ ...request, operation_id: operation() }, models, limits, changed)).toThrow(/immutable/i);
    expect(store.snapshot(legacy.id)).toEqual(before);
  });

  it("completes Neon and Lightkeeper through the same mocked pipeline, preserving restart and reference isolation", async () => {
    const store = setup(); const contexts: NarrativeContext[] = []; const references: string[][] = []; let calls = 0;
    const provider: StoryProvider = { prepare() {}, async script(context) { calls++; contexts.push(context); return { chapter: context.bible.template ? lightChapter(context) : chapterFixture(context), metrics: { ...measuredMetrics } }; }, async image(panel, _snapshot, _event, refs) { calls++; references.push(refs.map(ref => ref.bytes.toString("base64"))); return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } };
    const engine = new StoryEngine(store, provider);
    for (const bundle of [undefined, input()]) {
      const run = store.createRun({ operation_id: operation(), approach: "reference", ...(bundle ? { template_id: bundle.template.id, template_version: 1 } : {}) }, models, limits, bundle);
      for (let step = 1; step <= 2; step++) {
        const saved = engine.snapshot(run.id); const choice = step === 1 ? bundle ? "light" : "investigate" : saved.nodes[0].chapter!.next_decision.options[0].id;
        const written = await engine.decide(run.id, { operation_id: operation(), choice_id: choice, instruction: "" });
        expect(written.nodes.at(-1)?.error).toBeNull(); expect(written.panels.filter(panel => panel.status === "pending")).toHaveLength(2);
        await Promise.all(written.panels.filter(panel => panel.status === "pending").map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
      }
      const completed = engine.snapshot(run.id); expect(completed.run.status).toBe("ended"); expect(completed.panels.filter(panel => panel.status === "complete")).toHaveLength(4);
      const reopened = new StoryStore(store.directory); stores.push(reopened); expect(reopened.snapshot(run.id)).toEqual(completed);
    }
    expect(calls).toBe(12); expect(contexts[3].state.facts.map(fact => fact.id)).toContain("safe_path");
    expect(references.slice(4).every(refs => refs.length === 1 && refs[0] === jpegBase64)).toBe(true);
  });

  it("requires a prior chapter consequence from this template and retains hard ownership/object/ending invariants", () => {
    const template = lightkeeperTemplate(); const before = template.initial_state;
    const first = lightChapter({ step: 1, max_steps: 2 } as NarrativeContext);
    const after = applyChapter(before, first, 1, 2, ["tide_receding"]);
    const ending = lightChapter({ step: 2, max_steps: 2 } as NarrativeContext);
    ending.story_state_updates.used_fact_ids = ["tide_receding"];
    expect(() => applyChapter(after, ending, 2, 2, ["tide_receding"])).toThrow(/consequence/);
    ending.story_state_updates.used_fact_ids = ["safe_path"]; ending.story_state_updates.object_updates = [{ ...before.objects[0], holder: null }];
    expect(() => applyChapter(after, ending, 2, 2, ["tide_receding"])).toThrow(/holder|carried/);
    ending.story_state_updates.object_updates = [{ ...before.objects[0], condition: "intact" }]; after.objects[0].condition = "destroyed";
    expect(() => applyChapter(after, ending, 2, 2, ["tide_receding"])).toThrow(/destroyed/);
    ending.story_state_updates.object_updates = []; ending.is_ending = false;
    expect(() => applyChapter(after, ending, 2, 2, ["tide_receding"])).toThrow(/final/);
  });

  it("never defaults an empty template reference list to Kael and plans each supplied reference", () => {
    const store = setup(); const bundle = input(); bundle.template.reference_asset_ids = [];
    expect(() => store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, bundle)).toThrow(/reference/i);
    expect(store.createRun({ operation_id: operation(), approach: "text" }, models, limits, bundle).approach).toBe("text");
    const event = { model: models.image, stage: "image" as const, quality: "low" as const, approach: "reference" as const };
    expect(reservation({ ...event, reference_count: 3 }, now)! - reservation({ ...event, reference_count: 1 }, now)!).toBe(32000);
    const panel = lightChapter({ step: 1, max_steps: 2 } as NarrativeContext).panels[0];
    expect(buildIllustrationPrompt(panel, { identity: "Mara", style: "Coastal ink", current: "Copper lantern", protagonist: "Mara" })).not.toMatch(/Kael|Kyoto|station|the device/);
  });

  it("applies template-specific action consequences without applying Neon's device rule to other worlds", async () => {
    const store = setup(); const bundle = input(); const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, bundle);
    const provider: StoryProvider = { prepare() {}, async script(context) { return { chapter: lightChapter(context), metrics: { ...measuredMetrics } }; }, async image() { throw new Error("No image expected"); } };
    const engine = new StoryEngine(store, provider);
    const failed = await engine.decide(run.id, { operation_id: operation(), choice_id: "destroy", instruction: "" });
    expect(failed.nodes[0].error?.code).toBe("invalid_story_state"); expect(failed.run.step).toBe(0); expect(failed.summary.script_calls).toBe(1);
    provider.script = async context => { const chapter = lightChapter(context); chapter.story_state_updates.object_updates = [{ ...bundle.template.initial_state.objects[0], condition: "destroyed" }]; return { chapter, metrics: { ...measuredMetrics } }; };
    const retried = await engine.script(run.id, failed.nodes[0].id, { operation_id: operation(), retry: true });
    expect(retried.nodes[0].error).toBeNull(); expect(retried.run.state.objects[0].condition).toBe("destroyed"); expect(retried.panels).toHaveLength(2);
  });

  it("sends a strict story-specific final schema and context through the official SDK without Neon leakage", async () => {
    const store = setup(); const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, input()); const saved = store.snapshot(run.id);
    const first = lightChapter({ step: 1, max_steps: 2 } as NarrativeContext);
    const context: NarrativeContext = { bible: saved.bible, state: applyChapter(saved.run.state, first, 1, 2, ["tide_receding"]), recent_panels: first.panels, step: 2, max_steps: 2, choice: "Guide the star home", instruction: "" };
    let calls = 0;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      calls++; const sent = JSON.parse(String(init?.body)) as { input: { role: string; content: string }[]; text: unknown };
      expect(JSON.stringify(sent)).not.toMatch(/Kael|Kyoto|neon|cyberpunk/i);
      expect(sent.text).toMatchObject({ format: { strict: true, schema: { properties: { is_ending: { const: true }, story_state_updates: { properties: { used_fact_ids: { minItems: 1, items: { enum: ["safe_path"] } } } } } } } });
      return Response.json({ id: "resp_mara", model: models.story, status: "completed", output: [{ type: "message", id: "msg_mara", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(lightChapter(context)), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 300 } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    expect((await openAIProvider().script(context, models)).chapter.is_ending).toBe(true); expect(calls).toBe(1);
  });

  it("sends three local references in one SDK image request and rejects zero without fallback", async () => {
    let calls = 0;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      if (String(url) === "data:,") return new Response();
      calls++; expect(String(url)).toContain("/images/edits");
      const form = init?.body as FormData;
      expect(form.getAll("image[]")).toHaveLength(3); expect(String(form.get("prompt"))).not.toMatch(/Kael|Kyoto|station|the device/);
      return Response.json({ created: 1, data: [{ b64_json: jpegBase64 }], usage: { input_tokens: 5000, output_tokens: 100, total_tokens: 5100, input_tokens_details: { text_tokens: 500, image_tokens: 4500 } } });
    } });
    const panel = lightChapter({ step: 1, max_steps: 2 } as NarrativeContext).panels[0];
    const memory: ai.VisualMemory = { identity: "Mara with silver braids", style: "Coastal ink", current: "Copper tide lantern", protagonist: "Mara", models, references: Array.from({ length: 3 }, (_, index) => ({ bytes: Buffer.from(jpegBase64, "base64"), mime: "image/jpeg", name: `mara-${index}.jpg` })) };
    const result = await ai.generateIllustration(client, panel, undefined, "reference", memory);
    expect(result.metrics.usage?.input_image_tokens).toBe(4500); expect(result.metrics.prompt_version).toBe("story-visual-08"); expect(calls).toBe(1);
    await expect(ai.generateIllustration(client, panel, undefined, "reference", { ...memory, references: [] })).rejects.toMatchObject({ code: "reference_missing" }); expect(calls).toBe(1);
  });
});
