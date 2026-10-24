import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { generateIllustration, GenerationError, type VisualMemory } from "../src/lib/server/ai";
import { ImageStreamEventSchema, type IllustrationPreview } from "../src/lib/story-engine/image-stream";
import { reservation, usageCost, PRICES } from "../src/lib/story-engine/cost";
import { scriptFixture } from "./fixtures";
import { imageMetrics, jpegBase64, operation } from "./engine-fixtures";

const memory: VisualMemory = { identity: "Kael", style: "Flat ink", current: "Yellow coat", reference: Buffer.from("reference"), models: { image: "gpt-image-2.5-flare", quality: "low" } };
const metadata = { created_at: 1, background: "opaque", output_format: "jpeg", quality: "low", size: "1024x1536" };
const partial = { ...metadata, type: "image_edit.partial_image", partial_image_index: 0, b64_json: jpegBase64 };
const complete = { ...metadata, type: "image_edit.completed", b64_json: jpegBase64, usage: { input_tokens: 10, input_tokens_details: { text_tokens: 7, image_tokens: 3 }, output_tokens: 120, total_tokens: 130 } };
function transport(events: unknown[]) {
  let calls = 0; let sent: FormData | undefined;
  const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
    if (String(url) === "data:,") return new Response("");
    calls++; sent = init?.body as FormData;
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream", "x-request-id": "req_stream" } });
  } });
  return { client, calls: () => calls, body: () => sent };
}
describe("reference image streaming (official SDK, mocked transport)", () => {
  it("delivers a real preview before the final response with one unchanged reference request and measured usage", async () => {
    const mock = transport([partial, complete]); const previews: IllustrationPreview[] = [];
    const result = await generateIllustration(mock.client, scriptFixture.panels[0], undefined, "reference", memory, preview => previews.push(preview));
    expect(previews).toHaveLength(1); expect(previews[0].image_url).toBe(`data:image/jpeg;base64,${jpegBase64}`);
    expect(mock.calls()).toBe(1);
    for (const [key, value] of Object.entries({ model: memory.models.image, stream: "true", partial_images: "1", quality: "low", size: "1024x1536", output_format: "jpeg", output_compression: "85" })) expect(mock.body()?.get(key)).toBe(value);
    expect(mock.body()?.get("image")).toBeInstanceOf(File);
    expect(result.metrics).toMatchObject({ request_id: "req_stream", partial_images_requested: 1, partial_images_received: 1, usage: { output_tokens: 120, input_image_tokens: 3 } });
    expect(result.metrics.first_partial_ms).toBeGreaterThanOrEqual(0);
  });
  it("accepts an immediate final with no fabricated preview", async () => {
    const mock = transport([complete]); const previews: IllustrationPreview[] = [];
    const result = await generateIllustration(mock.client, scriptFixture.panels[0], undefined, "reference", memory, preview => previews.push(preview));
    expect(previews).toHaveLength(0); expect(result.metrics.partial_images_received).toBe(0); expect(result.metrics.first_partial_ms).toBeUndefined();
  });
  it("does not promote a preview when the stream is truncated or repeat the paid call", async () => {
    const mock = transport([partial]); const previews: IllustrationPreview[] = [];
    const result = generateIllustration(mock.client, scriptFixture.panels[0], undefined, "reference", memory, preview => previews.push(preview));
    await expect(result).rejects.toMatchObject({ code: "incomplete_image_stream", metrics: { request_id: "req_stream", usage: null, partial_images_received: 1 } });
    expect(previews).toHaveLength(1); expect(mock.calls()).toBe(1);
  });
  it("preserves safe diagnostics and unknown usage when a provider error follows a preview", async () => {
    const mock = transport([partial, { error: { type: "server_error", message: "private provider details", code: "server_error" } }]);
    const result = generateIllustration(mock.client, scriptFixture.panels[0], undefined, "reference", memory, () => {});
    await expect(result).rejects.toBeInstanceOf(GenerationError);
    await expect(result).rejects.toMatchObject({ code: "image_stream_failed", metrics: { request_id: "req_stream", usage: null } });
    await expect(result).rejects.not.toThrow("private provider details"); expect(mock.calls()).toBe(1);
  });
  it("retains returned usage even when final image bytes are invalid", async () => {
    const mock = transport([{ ...complete, b64_json: "aW52YWxpZA==" }]);
    await expect(generateIllustration(mock.client, scriptFixture.panels[0], undefined, "reference", memory, () => {})).rejects.toMatchObject({ code: "image_stream_failed", metrics: { usage: { output_tokens: 120 }, request_id: "req_stream" } });
  });
  it("keeps an unverified streaming model on its existing final-image request without a paid fallback", async () => {
    const requests: FormData[] = []; const previews: IllustrationPreview[] = [];
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      if (String(url) === "data:,") return new Response("");
      requests.push(init?.body as FormData);
      return Response.json({ created: 1, data: [{ b64_json: jpegBase64 }], usage: complete.usage });
    } });
    const result = await generateIllustration(client, scriptFixture.panels[0], undefined, "reference", { ...memory, models: { ...memory.models, image: "gpt-image-2.5-sunburst" } }, value => previews.push(value));
    expect(requests).toHaveLength(1); expect(requests[0].get("stream")).toBeNull();
    expect(requests[0].get("model")).toBe("gpt-image-2.5-sunburst"); expect(previews).toEqual([]);
    expect(result.image_url).toBe(previewURL());
  });
  it("reserves preview output once and accounts only returned usage", () => {
    const base = { model: "gpt-image-2.5-flare", stage: "image" as const, quality: "low" as const };
    expect(reservation({ ...base, approach: "reference" }, Date.parse("2026-10-24"))).toBe(74_000);
    expect(reservation({ ...base, approach: "text" }, Date.parse("2026-10-24"))).toBe(55_000);
    expect(usageCost({ ...base, price_version: PRICES.version }, imageMetrics)).toEqual({ total: 18970, reference: 11520 });
  });
  it("validates bounded JPEG preview messages and rejects non-image URLs", () => {
    const preview = { type: "preview", panel_id: operation(), image_url: `data:image/jpeg;base64,${jpegBase64}`, elapsed_ms: 20 };
    expect(ImageStreamEventSchema.safeParse(preview).success).toBe(true);
    expect(ImageStreamEventSchema.safeParse({ ...preview, image_url: "https://example.test/private.png" }).success).toBe(false);
  });
});
function previewURL() { return `data:image/jpeg;base64,${jpegBase64}`; }
