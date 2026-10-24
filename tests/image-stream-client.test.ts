import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { consumeImageResponse } from "../src/lib/image-stream-client";
import { StoryStore } from "../src/lib/story-engine/store";
import type { Snapshot } from "../src/lib/story-engine/contracts";
import { operation } from "./engine-fixtures";
let store: StoryStore; let directory: string; let snapshot: Snapshot;
beforeAll(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-client-stream-")); store = new StoryStore(directory);
  const run = store.createRun({ operation_id: operation(), approach: "reference" }, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" }, { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .3 });
  snapshot = store.snapshot(run.id);
});
afterAll(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
const preview = { type: "preview", panel_id: operation(), image_url: "data:image/jpeg;base64,/9j/2Q==", elapsed_ms: 123 };
function streamed(parts: string[]) { return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const part of parts) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }), { headers: { "Content-Type": "application/x-ndjson" } }); }
it("delivers a genuine preview across fragmented transport before a validated durable result", async () => {
  const line = JSON.stringify(preview); const seen: unknown[] = [];
  const result = await consumeImageResponse(streamed([line.slice(0, 19), line.slice(19), "\n", JSON.stringify({ type: "settled", snapshot }), "\n"]), event => seen.push(event));
  expect(seen).toEqual([preview]); expect(result).toEqual(snapshot);
});
it("does not treat a preview as a completed asset when the stream ends early", async () => {
  const seen: unknown[] = [];
  await expect(consumeImageResponse(streamed([JSON.stringify(preview) + "\n"]), event => seen.push(event))).rejects.toThrow(/interrupted/);
  expect(seen).toEqual([preview]);
});
it("rejects an unsafe image URL before handing it to the reader", async () => {
  const seen: unknown[] = [];
  await expect(consumeImageResponse(streamed([JSON.stringify({ ...preview, image_url: "https://external.invalid/image" }) + "\n"]), event => seen.push(event))).rejects.toThrow();
  expect(seen).toEqual([]);
});
it("surfaces a safe terminal server failure without returning the partial image", async () => {
  await expect(consumeImageResponse(streamed([JSON.stringify(preview) + "\n", JSON.stringify({ type: "error", code: "interrupted", message: "Check saved progress." }) + "\n"]), () => undefined)).rejects.toThrow("Check saved progress.");
});
it("rejects malformed or post-completion messages instead of applying stale data", async () => {
  await expect(consumeImageResponse(streamed(['{"type":"settled","snapshot":{}}\n']), () => undefined)).rejects.toThrow();
  await expect(consumeImageResponse(streamed([JSON.stringify({ type: "settled", snapshot }) + "\n", JSON.stringify(preview) + "\n"]), () => undefined)).rejects.toThrow(/Unexpected data/);
});
it("accepts a final JSON response from the compatible nonstreaming route", async () => {
  expect(await consumeImageResponse(Response.json(snapshot), () => { throw new Error("Unexpected preview"); })).toEqual(snapshot);
});
