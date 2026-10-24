import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { generateScript, generateIllustration } from "../src/lib/server/ai";
import { CHARACTER_IDENTITY, CHOICES, INITIAL_CONTEXT } from "../src/lib/contracts";
import { scriptFixture } from "./fixtures";

describe("official SDK integration (mocked transport)", () => {
  it("sends a strict schema and parses exactly two panels", async () => {
    let sent: Record<string, unknown> = {};
    const client = new OpenAI({ apiKey: "test-only", fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: "resp_test", model: "gpt-4.1-mini", status: "completed", output: [{ type: "message", id: "msg_test", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(scriptFixture), annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } }, { headers: { "x-request-id": "req_test" } });
    } });
    const result = await generateScript(client, { context: INITIAL_CONTEXT, choice: CHOICES[0], instruction: "A cyborg cat appears." });
    expect(result.script.panels).toHaveLength(2);
    expect(sent.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    expect(JSON.stringify(sent)).toContain(CHARACTER_IDENTITY);
    expect(result.metrics.usage?.total_tokens).toBe(300);
  });
  it("reports a refusal without launching image calls", async () => {
    const client = new OpenAI({ apiKey: "test-only", fetch: async () => Response.json({ id: "resp_test", model: "gpt-4.1-mini", status: "completed", output: [{ type: "message", id: "msg_test", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Cannot fulfill" }] }] }) });
    await expect(generateScript(client, { context: INITIAL_CONTEXT, choice: CHOICES[0], instruction: "" })).rejects.toThrow(/declined/);
  });
  it("requests one JPEG with the fixed identity and returns base64 plus usage", async () => {
    let sent: Record<string, unknown> = {};
    const client = new OpenAI({ apiKey: "test-only", fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ created: 1, data: [{ b64_json: "aW1hZ2U=" }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } });
    } });
    const result = await generateIllustration(client, scriptFixture.panels[0]);
    expect(sent).toMatchObject({ n: 1, output_format: "jpeg", size: "1024x1536" });
    expect(sent.prompt).toContain(CHARACTER_IDENTITY);
    expect(result.image_url).toBe("data:image/jpeg;base64,aW1hZ2U=");
    expect(result.metrics.usage?.total_tokens).toBe(30);
  });
  it("rejects missing image output", async () => {
    const client = new OpenAI({ apiKey: "test-only", fetch: async () => Response.json({ created: 1, data: [] }) });
    await expect(generateIllustration(client, scriptFixture.panels[0])).rejects.toThrow(/No illustration/);
  });
});
