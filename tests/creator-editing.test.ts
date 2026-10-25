import { describe, expect, it } from "vitest";
import { StoryFoundationSchema } from "../src/lib/story-engine/contracts";
import { NEON_PROTOCOL_TEMPLATE } from "../src/lib/story-templates/catalog";
import { updateFoundationChoice } from "../src/lib/creator/editing";

function foundation() {
  const source = NEON_PROTOCOL_TEMPLATE;
  return StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, source[key as keyof typeof source]])), opening_beats: source.opening_beats.map(({ caption, alt }) => ({ caption, alt })) });
}

describe("Creator choice editing", () => {
  it("removes only the edited choice's inferred effects while preserving IDs, other choices and state", () => {
    const before = foundation(); const original = structuredClone(before);
    const after = updateFoundationChoice(before, "destroy", "Protect the device");
    expect(after.initial_decision.options.find(option => option.id === "destroy")?.label).toBe("Protect the device");
    expect(after.initial_decision.options.map(option => option.id)).toEqual(before.initial_decision.options.map(option => option.id));
    expect(after.choice_effects).toEqual(before.choice_effects.filter(effect => effect.choice_id !== "destroy"));
    expect(after.initial_decision.options.filter(option => option.id !== "destroy")).toEqual(before.initial_decision.options.filter(option => option.id !== "destroy"));
    expect(after.initial_state).toBe(before.initial_state); expect(after.continuity_rules).toBe(before.continuity_rules);
    expect(before).toEqual(original);
  });

  it("preserves inferred effects when the choice label did not change or the ID is absent", () => {
    const before = foundation();
    expect(updateFoundationChoice(before, "destroy", before.initial_decision.options[1].label)).toBe(before);
    expect(updateFoundationChoice(before, "not_a_choice", "Protect the device")).toBe(before);
  });
});
