import { describe, expect, it } from "vitest";
import { applyChapter, initialState } from "../src/lib/story-engine/state";
import { chapterFixture, choiceChapterFixture } from "./engine-fixtures";

describe("validated narrative memory", () => {
  it("adds concrete source facts and preserves immutable identity plus mutable appearance", () => {
    const before = initialState();
    const after = applyChapter(before, chapterFixture(), 1, 2);
    expect(before.facts).toHaveLength(2);
    expect(after.facts).toHaveLength(4);
    expect(after.characters[0].visual_anchor).toBe(before.characters[0].visual_anchor);
    expect(after.characters[0].injuries).toContain("A shallow cut on his right hand");
  });
  it("accepts a next decision grounded in one newly established consequence", () => {
    const chapter = chapterFixture(); chapter.next_decision.options[0].uses_fact_ids = ["device_source"];
    expect(applyChapter(initialState(), chapter, 1, 2).facts).toHaveLength(4);
  });
  it("rejects unknown or contradictory facts and restored destroyed objects", () => {
    const before = initialState(); before.objects[0].condition = "destroyed";
    const chapter = chapterFixture(); chapter.story_state_updates.object_updates = [{ ...before.objects[0], condition: "intact" }];
    expect(() => applyChapter(before, chapter, 1, 2)).toThrow(/destroyed/);
    chapter.story_state_updates.object_updates = []; chapter.story_state_updates.facts_added[0] = { id: before.facts[0].id, text: "A contradictory fact" };
    expect(() => applyChapter(before, chapter, 1, 2)).toThrow(/fact/);
  });
});

it("accepts synthetic Activate/no-twist next choices with one causal reference, reproducing the old compound gate", () => {
  const chapter = choiceChapterFixture("activate");
  // Keep two facts here to isolate the reported next-choice predicate from the fact-count quota.
  chapter.story_state_updates.facts_added.push({ id: "device_activated", text: "Kael has activated the device." });
  expect(applyChapter(initialState(), chapter, 1, 2).objects[0].condition).toBe("active");
});

it.each(["activate", "destroy", "investigate"] as const)("preserves %s consequences through a second decision using one saved anchor", choice => {
  const first = choiceChapterFixture(choice);
  const state = applyChapter(initialState(), first, 1, 2);
  const after = applyChapter(state, choiceChapterFixture(choice, true), 2, 2);
  expect(after.objects).toEqual(state.objects);
  expect(after.characters).toEqual(state.characters);
  expect(after.facts).toEqual(expect.arrayContaining(state.facts));
  expect(after.unresolved_threads).toEqual([]);
});

it.each([
  { references: [] as string[], rule: "missing_new_fact_reference" },
  { references: ["city_ai_silent"], rule: "missing_new_fact_reference" },
  { references: ["device_source", "private_unknown_id"], rule: "unknown_fact_reference" },
])("reports a safe, precise next-choice reference failure: $rule", ({ references, rule }) => {
  const chapter = chapterFixture(); chapter.next_decision.options[0].uses_fact_ids = references;
  let failure: unknown;
  try { applyChapter(initialState(), chapter, 1, 2); } catch (error: unknown) { failure = error; }
  expect(failure).toMatchObject({ code: "invalid_story_state", diagnostics: { phase: "state_validation", issues: [{ path: "next_decision.options.0.uses_fact_ids", rule }] } });
  expect(JSON.stringify(failure)).not.toContain("private_unknown_id");
});

it("does not count repeated references as additional evidence or rewrite them", () => {
  const chapter = chapterFixture(); chapter.next_decision.options[0].uses_fact_ids = ["device_source", "device_source"];
  expect(applyChapter(initialState(), chapter, 1, 2).facts).toHaveLength(4);
  expect(chapter.next_decision.options[0].uses_fact_ids).toEqual(["device_source", "device_source"]);
});

it("still rejects endings with unresolved actions, future options or no saved consequence", () => {
  const state = applyChapter(initialState(), chapterFixture(), 1, 2);
  const ending = chapterFixture({ step: 2, max_steps: 2 } as Parameters<typeof chapterFixture>[0]);
  ending.story_state_updates.used_fact_ids = ["device_source"];
  ending.story_state_updates.unresolved_threads = ["Kael still needs to escape."];
  expect(() => applyChapter(state, ending, 2, 2)).toThrow(/unresolved/);
  ending.story_state_updates.unresolved_threads = [];
  ending.next_decision.options = chapterFixture().next_decision.options;
  expect(() => applyChapter(state, ending, 2, 2)).toThrow(/decision/);
  ending.next_decision.options = []; ending.story_state_updates.used_fact_ids = [];
  expect(() => applyChapter(state, ending, 2, 2)).toThrow(/first decision/);
});

it("requires second-decision causality from the first continuation, rather than only the fixed opening", () => {
  const before = applyChapter(initialState(), chapterFixture(), 1, 2);
  const ending = chapterFixture({ step: 2, max_steps: 2 } as Parameters<typeof chapterFixture>[0]);
  ending.story_state_updates.used_fact_ids = ["device_knows_kael", "city_ai_silent"];
  expect(() => applyChapter(before, ending, 2, 2)).toThrow(/first decision/);
});

it("rejects contradictory object holder and carried-object records", () => {
  const proposed = chapterFixture(); proposed.story_state_updates.object_updates = [{ id: "device", name: initialState().objects[0].name, condition: "missing", holder: null }];
  expect(() => applyChapter(initialState(), proposed, 1, 2)).toThrow(/holder/);
});

it("accepts Destroy the device / Destroy it with a hammer without a fact containing the exact source phrase", async () => {
  const { hammerChapterFixture } = await import("./engine-fixtures");
  const chapter = hammerChapterFixture();
  const after = applyChapter(initialState(), chapter, 1, 2);
  expect(after.objects[0]).toMatchObject({ condition: "destroyed", holder: null });
  expect(after.characters[0].carried_objects).not.toContain("device");
  expect(after.facts.map(f => f.id)).toContain("tracking_stopped");
});

it("allows no origin revelation but still requires strict chapter JSON and preserves old clue records", async () => {
  const { hammerChapterFixture } = await import("./engine-fixtures");
  const { ChapterSchema } = await import("../src/lib/story-engine/contracts");
  const chapter = hammerChapterFixture(); chapter.event.source_clue = null;
  expect(applyChapter(initialState(), chapter, 1, 2).objects[0].condition).toBe("destroyed");
  expect(ChapterSchema.safeParse(chapterFixture()).success).toBe(true);
  const malformed = { ...chapter, event: { action: chapter.event.action, consequence: chapter.event.consequence } };
  expect(ChapterSchema.safeParse(malformed).success).toBe(false);
});

it("does not allow destroyed props to become restorable through a missing state or skip chronology", async () => {
  const { hammerChapterFixture } = await import("./engine-fixtures");
  const before = applyChapter(initialState(), hammerChapterFixture(), 1, 2);
  const chapter = chapterFixture(); chapter.story_state_updates.object_updates = [{ ...before.objects[0], condition: "missing" }];
  expect(() => applyChapter(before, chapter, 1, 2)).toThrow(/destroyed/);
  expect(() => applyChapter(initialState(), chapterFixture(), 0, 2)).toThrow(/chronology/);
});

it("sends a strict required-but-nullable source clue in the official SDK schema", async () => {
  const { zodTextFormat } = await import("openai/helpers/zod");
  const { ChapterSchema } = await import("../src/lib/story-engine/contracts");
  const format = zodTextFormat(ChapterSchema, "neon_reliability");
  const schema = format.schema as { additionalProperties: boolean; properties: { event: { required: string[]; properties: { source_clue: unknown } } } };
  expect(format.strict).toBe(true); expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.event.required).toContain("source_clue");
  expect(JSON.stringify(schema.properties.event.properties.source_clue)).toContain('"type":"null"');
});

it("lets a next choice combine a new consequence with opening context while rejecting unknown or disconnected facts", async () => {
  const { hammerChapterFixture } = await import("./engine-fixtures");
  const chapter = hammerChapterFixture();
  chapter.next_decision.options[1].uses_fact_ids = ["tracking_stopped", "city_ai_silent"];
  expect(applyChapter(initialState(), chapter, 1, 2).objects[0].condition).toBe("destroyed");
  chapter.next_decision.options[1].uses_fact_ids = ["tracking_stopped", "invented_fact"];
  expect(() => applyChapter(initialState(), chapter, 1, 2)).toThrow(/facts/);
  chapter.next_decision.options[1].uses_fact_ids = ["device_knows_kael", "city_ai_silent"];
  expect(() => applyChapter(initialState(), chapter, 1, 2)).toThrow(/consequence/);
});

it("still rejects a live-shaped dropped-device update if appearance incorrectly retains possession", async () => {
  const { hammerChapterFixture } = await import("./engine-fixtures");
  const chapter = hammerChapterFixture();
  chapter.next_decision.options[1].uses_fact_ids = ["tracking_stopped", "city_ai_silent"];
  chapter.story_state_updates.appearance_changes = [];
  expect(() => applyChapter(initialState(), chapter, 1, 2)).toThrow(/holder/);
});
