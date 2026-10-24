import { describe, expect, it } from "vitest";
import { CHOICES, INITIAL_CONTEXT, StoryRequestSchema, ValidatedScriptSchema } from "../src/lib/contracts";
import { scriptFixture } from "./fixtures";

describe("POC public contracts", () => {
  it("accepts the three choices and trims an optional twist", () => {
    for (const choice of CHOICES) {
      expect(StoryRequestSchema.parse({ context: INITIAL_CONTEXT, choice, instruction: "  A cyborg cat appears.  " }).instruction).toBe("A cyborg cat appears.");
    }
  });
  it("rejects unknown choices, changed context, and oversized twists", () => {
    const request = { context: INITIAL_CONTEXT, choice: CHOICES[0] };
    expect(StoryRequestSchema.safeParse({ ...request, choice: "Run away" }).success).toBe(false);
    expect(StoryRequestSchema.safeParse({ ...request, context: "New story" }).success).toBe(false);
    expect(StoryRequestSchema.safeParse({ ...request, instruction: "x".repeat(501) }).success).toBe(false);
  });
  it("requires exactly two ordered, distinct panels with one or two bubbles", () => {
    expect(ValidatedScriptSchema.safeParse(scriptFixture).success).toBe(true);
    expect(ValidatedScriptSchema.safeParse({ ...scriptFixture, panels: [scriptFixture.panels[0]] }).success).toBe(false);
    expect(ValidatedScriptSchema.safeParse({ ...scriptFixture, panels: [scriptFixture.panels[0], scriptFixture.panels[0]] }).success).toBe(false);
    const empty = structuredClone(scriptFixture);
    empty.panels[0].dialogues = [];
    expect(ValidatedScriptSchema.safeParse(empty).success).toBe(false);
  });
});
