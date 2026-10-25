import { describe, expect, it } from "vitest";
import { layoutDialogue } from "../src/lib/dialogue-layout";
import { scriptFixture } from "./fixtures";

describe("legible dialogue overlays", () => {
  it("leaves a single bubble in its requested position", () => {
    const dialogues = scriptFixture.panels[0].dialogues;
    expect(layoutDialogue(dialogues)).toEqual(dialogues);
  });
  it("separates two bubbles competing for the same horizontal band without changing the script", () => {
    const first = scriptFixture.panels[0].dialogues[0];
    const dialogues = [first, { ...first, id: "second", position: "top-right" as const }];
    expect(layoutDialogue(dialogues).map((bubble) => bubble.position)).toEqual(["top-left", "bottom-right"]);
    expect(dialogues[1].position).toBe("top-right");
    expect(layoutDialogue(dialogues).map((bubble) => bubble.text)).toEqual(dialogues.map((bubble) => bubble.text));
  });
});
