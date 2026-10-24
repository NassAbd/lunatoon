import { describe, expect, it } from "vitest";
import { applyChapter, initialState } from "../src/lib/story-engine/state";
import { chapterFixture } from "./engine-fixtures";

describe("validated narrative memory", () => {
  it("adds concrete source facts and preserves immutable identity plus mutable appearance", () => {
    const before = initialState();
    const after = applyChapter(before, chapterFixture(), 1, 2);
    expect(before.facts).toHaveLength(2);
    expect(after.facts).toHaveLength(4);
    expect(after.characters[0].visual_anchor).toBe(before.characters[0].visual_anchor);
    expect(after.characters[0].injuries).toContain("A shallow cut on his right hand");
  });
  it("rejects decisions that do not use two newly established facts", () => {
    const chapter = chapterFixture(); chapter.next_decision.options[0].uses_fact_ids = ["device_source"];
    expect(() => applyChapter(initialState(), chapter, 1, 2)).toThrow(/two/);
  });
  it("rejects unknown or contradictory facts and restored destroyed objects", () => {
    const before = initialState(); before.objects[0].condition = "destroyed";
    const chapter = chapterFixture(); chapter.story_state_updates.object_updates = [{ ...before.objects[0], condition: "intact" }];
    expect(() => applyChapter(before, chapter, 1, 2)).toThrow(/destroyed/);
    chapter.story_state_updates.object_updates = []; chapter.story_state_updates.facts_added[0] = { id: before.facts[0].id, text: "A contradictory fact" };
    expect(() => applyChapter(before, chapter, 1, 2)).toThrow(/fact/);
  });
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
