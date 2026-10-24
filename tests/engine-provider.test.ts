import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ai from "../src/lib/server/ai";
import { openAIProvider } from "../src/lib/story-engine/provider";
import type { NarrativeContext } from "../src/lib/story-engine/contracts";
import { chapterRequestSchema } from "../src/lib/story-engine/contracts";
import { applyChapter, initialState } from "../src/lib/story-engine/state";
import { chapterFixture, choiceChapterFixture } from "./engine-fixtures";

afterEach(() => vi.restoreAllMocks());

describe("persistent narrative request contract (official SDK, mocked transport)", () => {
  it("plans consequences and final object custody before writing panel descriptions", () => {
    expect(Object.keys(chapterRequestSchema(2, 2, ["device_destroyed", "signal_ended"]).shape)).toEqual([
      "is_ending", "event", "story_state_updates", "panels", "next_decision",
    ]);
  });
  it.each([[1, 2, false], [2, 2, true], [1, 1, true]] as const)("binds step %s of %s to ending=%s before requesting tokens", async (step, max_steps, ending) => {
    const context: NarrativeContext = {
      bible: { id: "test", title: "Neon Protocol", opening: "Opening", character_bible: "Kael", art_direction: "Flat ink", device_anchor: "Black square", setting_anchor: "Station", assets: [] },
      state: step > 1 ? applyChapter(initialState(), chapterFixture(), 1, 2) : initialState(), recent_panels: chapterFixture().panels,
      step, max_steps, choice: "Examine the fragments while the cameras are blind", instruction: "Keep the evidence in a bag.",
    };
    let sent: Record<string, unknown> = {};
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: "resp_stage", model: "gpt-4.1-mini", status: "completed", output: [{ type: "message", id: "msg_stage", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(chapterFixture(context)), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 300 } }, { headers: { "x-request-id": "req_stage" } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    const result = await openAIProvider().script(context, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" });
    expect(sent.text).toMatchObject({ format: { type: "json_schema", strict: true, schema: {
      additionalProperties: false,
      properties: { is_ending: { const: ending }, ...(ending ? {
        next_decision: { properties: { options: { maxItems: 0 } } },
        story_state_updates: { properties: { unresolved_threads: { maxItems: 0 } } },
      } : { next_decision: { properties: { options: { minItems: 2, maxItems: 3, items: { properties: { uses_fact_ids: { minItems: 1, maxItems: 4 } } } } } } }) },
    } } });
    const input = sent.input as { role: string; content: string }[];
    expect(input[0].content).toContain(`CURRENT CHAPTER: ${step} of ${max_steps}`);
    expect(input[0].content).toContain("recent_panels are already completed history");
    const supplied = JSON.parse(input[1].content) as NarrativeContext;
    expect(supplied.choice).toBe(context.choice); expect(supplied.instruction).toBe(context.instruction);
    expect(supplied.recent_panels).toEqual(context.recent_panels);
    if (step > 1) {
      expect(sent.text).toMatchObject({ format: { schema: { properties: {
        story_state_updates: { properties: { used_fact_ids: { minItems: 1, items: { enum: ["device_source", "cat_access"] } } } },
      } } } });
      expect(supplied).toMatchObject({ continuity_fact_ids: ["device_source", "cat_access"] });
    }
    expect(input[1].content.lastIndexOf('"choice"')).toBeGreaterThan(input[1].content.indexOf('"recent_panels"'));
    expect(result.metrics).toMatchObject({ request_id: "req_stage", prompt_version: "persistent-neon-05.1-causal" });
  });
  it("continues a one-consequence saved chapter through the official SDK without requiring a second fact", async () => {
    const context: NarrativeContext = {
      bible: { id: "test", title: "Neon Protocol", opening: "Opening", character_bible: "Kael", art_direction: "Flat ink", device_anchor: "Black square", setting_anchor: "Station", assets: [] },
      state: applyChapter(initialState(), choiceChapterFixture("activate"), 1, 2), recent_panels: choiceChapterFixture("activate").panels,
      step: 2, max_steps: 2, choice: "Escape through the open gate", instruction: "",
    };
    let calls = 0;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(sent.text).toMatchObject({ format: { schema: { properties: { story_state_updates: { properties: { facts_added: { minItems: 1 }, used_fact_ids: { minItems: 1, items: { enum: ["escape_gate_opened"] } } } } } } } });
      return Response.json({ id: "resp_one_fact", model: "gpt-4.1-mini", status: "completed", output: [{ type: "message", id: "msg_one_fact", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(choiceChapterFixture("activate", true)), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 300 } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    const result = await openAIProvider().script(context, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" });
    expect(result.chapter.is_ending).toBe(true); expect(calls).toBe(1);
  });
});
