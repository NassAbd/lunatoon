import { describe, expect, it, vi } from "vitest";
import { runContinuation } from "../src/lib/pipeline";
import { CHOICES, INITIAL_CONTEXT, type ImageResponse } from "../src/lib/contracts";
import { metricsFixture, storyFixture } from "./fixtures";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const request = { context: INITIAL_CONTEXT, choice: CHOICES[0], instruction: "" } as const;
const image = (id: string): ImageResponse => ({ panel_id: id, image_url: "data:image/jpeg;base64,test", metrics: metricsFixture });

describe("progressive continuation", () => {
  it("publishes text first, starts both images concurrently, and publishes whichever finishes first", async () => {
    const first = deferred<ImageResponse>();
    const second = deferred<ImageResponse>();
    const events: string[] = [];
    const run = runContinuation(request, {
      story: async () => storyFixture,
      image: (panel) => { events.push(`start:${panel.panel_id}`); return panel.sequence_index === 1 ? first.promise : second.promise; },
    }, {
      script: async () => { events.push("script"); },
      image: (result) => { events.push(`ready:${result.panel_id}`); },
      imageError: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toEqual(["script", "start:panel_1", "start:panel_2"]));
    second.resolve(image("panel_2"));
    await vi.waitFor(() => expect(events).toContain("ready:panel_2"));
    expect(events).not.toContain("ready:panel_1");
    first.resolve(image("panel_1"));
    await run;
  });
  it("preserves a successful image when its sibling fails", async () => {
    const ready = vi.fn();
    const failed = vi.fn();
    await runContinuation(request, {
      story: async () => storyFixture,
      image: async (panel) => { if (panel.sequence_index === 1) throw new Error("Rate limited"); return image(panel.panel_id); },
    }, { script: async () => {}, image: ready, imageError: failed });
    expect(ready).toHaveBeenCalledWith(image("panel_2"));
    expect(failed).toHaveBeenCalledWith("panel_1", expect.objectContaining({ message: "Rate limited" }));
  });
  it("does not start images when the script fails", async () => {
    const generateImage = vi.fn();
    await expect(runContinuation(request, { story: async () => { throw new Error("Refused"); }, image: generateImage }, { script: vi.fn(), image: vi.fn(), imageError: vi.fn() })).rejects.toThrow("Refused");
    expect(generateImage).not.toHaveBeenCalled();
  });
});
