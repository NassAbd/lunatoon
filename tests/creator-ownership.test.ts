import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import * as ai from "../src/lib/server/ai";
import { applyChapter, validateStoryFoundation, validateStoryTemplate } from "../src/lib/story-engine/state";
import { ChapterSchema, StoryFoundationSchema, chapterRequestSchema, type NarrativeContext } from "../src/lib/story-engine/contracts";
import { openAIProvider, type StoryProvider } from "../src/lib/story-engine/provider";
import { openAICreatorProvider, creatorFailure } from "../src/lib/creator/provider";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import { operation, imageMetrics, jpegBase64, measuredMetrics } from "./engine-fixtures";
import { runningHellChapter, runningHellFoundation, runningHellInstruction, runningHellState, runningHellTemplate } from "./running-hell-fixtures";

const stores: StoryStore[] = [], directories: string[] = [];
const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
function setup() { const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-ownership-")); directories.push(directory); const store = new StoryStore(directory, { now: () => Date.parse("2026-10-25T00:00:00Z") }); stores.push(store); const template = runningHellTemplate(); const run = store.createRun({ operation_id: operation(), approach: "text", template_id: template.id, template_version: 1 }, models, { max_steps: 2, max_script_calls: 3, max_image_calls: 6, budget_usd: .5 }, { template, assets: [{ id: "opening", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", purpose: "Authored test fixture" }] }); return { store, run }; }
function apply(chapter = runningHellChapter(), before = runningHellState()) { return applyChapter(before, chapter, 1, 2, runningHellState().facts.map(fact => fact.id)); }
function caught(work: () => unknown) { try { work(); return null; } catch (error) { return error; } }
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });

describe("reconstructed Running Hell ownership (not the unknown historical response)", () => {
  it("starts from consistent Kai/SpeedCore anchors and preserves possession while wearing and using it", () => {
    expect(validateStoryFoundation(runningHellFoundation()).initial_state).toEqual(runningHellState());
    expect(validateStoryTemplate(runningHellTemplate()).initial_state).toEqual(runningHellState());
    const unchanged = runningHellChapter(); unchanged.story_state_updates.object_updates = []; unchanged.story_state_updates.appearance_changes = [];
    expect(apply(unchanged).characters[0].carried_objects).toEqual(["speedcore_device"]);
    const used = apply(); expect(used.objects[0]).toMatchObject({ id: "speedcore_device", condition: "active", holder: "kai_fox" }); expect(used.characters[0].carried_objects).toEqual(["speedcore_device"]);
    expect(used.characters[0].visual_anchor).toBe("red_jacket_ponytail"); expect(runningHellState().objects[0].condition).toBe("intact");
  });
  it("accepts an explicit synchronized transfer and a dropped object with no holder", () => {
    const chapter = runningHellChapter(); chapter.story_state_updates.characters_added = [{ id: "relay_keeper", name: "Relay keeper", visual_anchor: "Original grey coveralls", injuries: [], clothing_condition: "Grey coveralls", carried_objects: [] }];
    chapter.story_state_updates.object_updates[0].holder = "relay_keeper";
    chapter.story_state_updates.appearance_changes = [{ character_id: "kai_fox", injuries_added: [], clothing_condition: null, objects_added: [], objects_removed: ["speedcore_device"] }, { character_id: "relay_keeper", injuries_added: [], clothing_condition: null, objects_added: ["speedcore_device"], objects_removed: [] }];
    const transferred = apply(chapter); expect(transferred.objects[0].holder).toBe("relay_keeper"); expect(transferred.characters.map(character => character.carried_objects)).toEqual([[], ["speedcore_device"]]);
    chapter.story_state_updates.characters_added = []; chapter.story_state_updates.object_updates[0].holder = null; chapter.story_state_updates.appearance_changes.pop();
    const dropped = apply(chapter); expect(dropped.objects[0].holder).toBeNull(); expect(dropped.characters[0].carried_objects).toEqual([]);
  });
  it("retains destroyed remnants when explicitly held, rejects restoring them, and keeps identity/chronology strict", () => {
    const chapter = runningHellChapter(); chapter.story_state_updates.object_updates[0].condition = "destroyed";
    const destroyed = apply(chapter); expect(destroyed.characters[0].carried_objects).toEqual(["speedcore_device"]);
    for (const condition of ["intact", "active", "damaged", "missing"] as const) { const restore = runningHellChapter(true); restore.story_state_updates.object_updates[0].condition = condition; expect(() => applyChapter(destroyed, restore, 2, 2, runningHellState().facts.map(fact => fact.id))).toThrow(/destroyed/); }
    const renamed = runningHellChapter(); renamed.story_state_updates.object_updates[0].name = "Different object"; expect(() => apply(renamed)).toThrow(/identity/);
    expect(() => applyChapter(runningHellState(), chapter, 0, 2)).toThrow(/chronology/);
    expect(ChapterSchema.safeParse({ ...chapter, unexpected: "extra" }).success).toBe(false);
  });
  it("reproduces the reported invariant class with a synthetic omitted inventory entry, without normalizing it", () => {
    const before = runningHellState(); const chapter = runningHellChapter(); chapter.story_state_updates.appearance_changes[0].objects_removed = ["speedcore_device"];
    const pristine = structuredClone(chapter); const error = caught(() => apply(chapter, before));
    expect(error).toMatchObject({ code: "invalid_story_state", message: "Object ownership and carried-object appearance must agree.", diagnostics: { phase: "state_validation", issues: [{ path: "objects.0.holder", rule: "held_object_missing_from_inventory" }] } });
    expect(chapter).toEqual(pristine); expect(before).toEqual(runningHellState()); expect(JSON.stringify(error)).not.toMatch(/kai_fox|speedcore_device|SpeedCore|red_jacket/);
  });
  it("rejects contradictory carried entries, unknown holders and unpaired transfers with indexed diagnostics", () => {
    const dropped = runningHellChapter(); dropped.story_state_updates.object_updates[0].holder = null;
    expect(caught(() => apply(dropped))).toMatchObject({ diagnostics: { issues: [{ path: "characters.0.carried_objects.0", rule: "carried_object_holder_mismatch" }] } });
    const unknown = runningHellChapter(); unknown.story_state_updates.object_updates[0].holder = "private_unknown_holder";
    const error = caught(() => apply(unknown)); expect(error).toMatchObject({ diagnostics: { issues: [{ path: "story_state_updates.object_updates.0.holder", rule: "unknown_object_holder" }] } }); expect(JSON.stringify(error)).not.toContain("private_unknown_holder");
    const transfer = runningHellChapter(); transfer.story_state_updates.characters_added = [{ id: "keeper", name: "Keeper", visual_anchor: "Grey uniform", injuries: [], clothing_condition: "Grey uniform", carried_objects: [] }]; transfer.story_state_updates.object_updates[0].holder = "keeper"; transfer.story_state_updates.appearance_changes[0].objects_removed = ["speedcore_device"];
    expect(caught(() => apply(transfer))).toMatchObject({ diagnostics: { issues: [{ path: "objects.0.holder", rule: "held_object_missing_from_inventory" }] } });
  });
  it("rejects inconsistent foundations before play and returns safe stable ownership rules", () => {
    const foundation = runningHellFoundation(); foundation.initial_state.characters[0].carried_objects = [];
    const error = caught(() => validateStoryFoundation(foundation)); expect(error).toMatchObject({ diagnostics: { issues: [{ path: "initial_state.objects.0.holder", rule: "held_object_missing_from_inventory" }] } });
    expect(creatorFailure(error).error).toMatchObject({ code: "invalid_foundation", issues: [{ path: "initial_state.objects.0.holder", rule: "held_object_missing_from_inventory" }] });
  });
  it("completes two decisions and four images using custom object IDs, persisting ownership without extra calls on reopen", async () => {
    const { store, run } = setup(); const contexts: NarrativeContext[] = []; let images = 0;
    const provider: StoryProvider = { prepare() {}, async script(context) { contexts.push(context); return { chapter: runningHellChapter(context.step === 2), metrics: structuredClone(measuredMetrics) }; }, async image(panel) { images++; return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } }; const engine = new StoryEngine(store, provider);
    for (let step = 1; step <= 2; step++) {
      const written = await engine.decide(run.id, { operation_id: operation(), choice_id: step === 1 ? "stop_nexus" : "disable_relay", instruction: step === 1 ? runningHellInstruction : "Leave the inert device in the relay." }); expect(written.nodes.at(-1)?.error).toBeNull();
      await Promise.all(written.panels.filter(panel => panel.status === "pending").map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    }
    const final = engine.snapshot(run.id); expect(final.run.status).toBe("ended"); expect(final.panels.every(panel => panel.status === "complete")).toBe(true); expect(final.run.state.objects[0].holder).toBeNull(); expect(final.run.state.characters[0].carried_objects).toEqual([]);
    expect(contexts[1].state.objects[0].holder).toBe("kai_fox"); expect(contexts[1].state.characters[0].carried_objects).toEqual(["speedcore_device"]); expect(contexts[1].state.facts.map(fact => fact.id)).toContain("nexus_hq_entered"); expect(contexts[1].recent_panels).toEqual(runningHellChapter().panels); expect(images).toBe(4);
    const restored = new StoryStore(store.directory); stores.push(restored); expect(restored.snapshot(run.id)).toEqual(final); expect(contexts).toHaveLength(2); expect(images).toBe(4);
  });
});

describe("ownership guidance at the official SDK boundary (mocked transport)", () => {
  it("describes both ownership mirrors without changing the strict saved JSON shape", () => {
    const schema = zodTextFormat(chapterRequestSchema(1, 2), "ownership").schema;
    expect(JSON.stringify(schema)).toContain("worn"); expect(JSON.stringify(schema)).toContain("retaining custody");
    expect(Object.keys(ChapterSchema.shape)).toEqual(["panels", "event", "story_state_updates", "next_decision", "is_ending"]); expect(StoryFoundationSchema.safeParse(runningHellFoundation()).success).toBe(true);
  });
  it("instructs both narrative stages explicitly and keeps returned usage when a coherent-looking chapter contradicts inventory", async () => {
    const { store, run } = setup(); let calls = 0; const outputs = [635, 613];
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as { input: { content: string }[]; text: unknown };
      expect(sent.input[0].content).toContain("physical custody"); expect(sent.input[0].content).toContain("Wearing or using"); expect(sent.input[0].content).toContain("old holder"); expect(sent.input[0].content).toContain("not infer custody from");
      expect(sent.text).toMatchObject({ format: { strict: true, schema: { additionalProperties: false } } }); const supplied = JSON.parse(sent.input[1].content) as NarrativeContext;
      expect(supplied.choice).toBe("Use the speed to stop NEXUS and save the city."); expect(supplied.instruction).toBe(runningHellInstruction);
      const chapter = runningHellChapter(); chapter.story_state_updates.appearance_changes[0].objects_removed = ["speedcore_device"]; chapter.panels[0].dialogues[0].text = "PRIVATE_REJECTED_OUTPUT";
      const output_tokens = outputs[calls++];
      return Response.json({ id: `resp_mock_ownership_${calls}`, model: models.story, status: "completed", output: [{ type: "message", id: "msg_mock", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(chapter), annotations: [] }] }], usage: { input_tokens: 3148, input_tokens_details: { cached_tokens: 0 }, output_tokens, total_tokens: 3148 + output_tokens } }, { headers: { "x-request-id": `req_mock_ownership_${calls}` } });
    } }); vi.spyOn(ai, "getClient").mockReturnValue(client);
    const engine = new StoryEngine(store, openAIProvider()); const first = await engine.decide(run.id, { operation_id: operation(), choice_id: "stop_nexus", instruction: runningHellInstruction });
    const second = await engine.script(run.id, first.nodes[0].id, { operation_id: operation(), retry: true });
    expect(calls).toBe(2); expect(second.run.state).toEqual(runningHellState()); expect(second.nodes[0].chapter).toBeNull(); expect(second.panels).toEqual([]);
    expect(second.summary).toMatchObject({ script_calls: 2, image_calls: 0, measured_input_tokens: 6296, measured_output_tokens: 1248, estimated_micro_usd: 4516, unknown_cost_attempts: 0 });
    expect(second.nodes[0].error).toMatchObject({ code: "invalid_story_state", request_id: "req_mock_ownership_2", diagnostics: { phase: "state_validation", issues: [{ path: "objects.0.holder", rule: "held_object_missing_from_inventory" }] } });
    expect(second.events.filter(event => event.stage === "script").map(event => event.metrics?.prompt_version)).toEqual(["persistent-story-08.2-ownership", "persistent-story-08.2-ownership"]);
    expect(JSON.stringify(second)).not.toContain("PRIVATE_REJECTED_OUTPUT");
  });
  it("defines wearing and use for newly generated foundations without weakening validation", async () => {
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      const sent = JSON.parse(String(init?.body)) as { input: { content: string }[] }; expect(sent.input[0].content).toContain("physical custody"); expect(sent.input[0].content).toContain("worn");
      return Response.json({ id: "resp_mock_foundation", model: models.story, status: "completed", output: [{ type: "message", id: "msg_mock", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(runningHellFoundation()), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 300 } });
    } }); vi.spyOn(ai, "getClient").mockReturnValue(client);
    const result = await openAICreatorProvider().foundation({ prompt: "An original runner uses his speed to protect the city.", title: "", genre: "", main_character: "", visual_style: "", atmosphere: "" }, models.story); expect(validateStoryFoundation(result.foundation)).toEqual(runningHellFoundation()); expect(result.metrics.prompt_version).toBe("creator-foundation-08.2-ownership");
  });
});
