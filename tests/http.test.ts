import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHOICES, INITIAL_CONTEXT, StoryRequestSchema } from "../src/lib/contracts";
import { getClient } from "../src/lib/server/ai";
import { errorResponse, readRequest } from "../src/lib/server/http";

afterEach(() => vi.unstubAllEnvs());

describe("server request and error boundaries", () => {
  const valid = { context: INITIAL_CONTEXT, choice: CHOICES[0], instruction: "" };
  it("accepts a same-origin validated request", async () => {
    const result = await readRequest(new Request("http://localhost/api/story", { method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify(valid) }), StoryRequestSchema);
    expect(result.choice).toBe(CHOICES[0]);
  });
  it("uses the browser-facing Host when Next normalizes the request URL to localhost", async () => {
    const result = await readRequest(new Request("http://localhost:3001/api/story", {
      method: "POST", headers: { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3001" }, body: JSON.stringify(valid),
    }), StoryRequestSchema);
    expect(result.choice).toBe(CHOICES[0]);
  });
  it("rejects malformed JSON, oversized requests, invalid data, and cross-origin requests", async () => {
    for (const [body, origin, message] of [
      ["{", "http://localhost", "valid JSON"],
      ["a".repeat(12001), "http://localhost", "too large"],
      [JSON.stringify({ ...valid, choice: "skip" }), "http://localhost", "does not match"],
      [JSON.stringify(valid), "https://elsewhere.example", "Cross-origin"],
    ]) {
      await expect(readRequest(new Request("http://localhost/api/story", { method: "POST", headers: { origin }, body }), StoryRequestSchema)).rejects.toThrow(message);
    }
  });
  it("fails clearly when credentials are absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    try { getClient(); throw new Error("Expected a configuration error"); } catch (error) {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = errorResponse(error, performance.now());
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ error: { code: "missing_api_key" } });
      log.mockRestore();
    }
  });
  it("sanitizes upstream errors while preserving the request ID", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = errorResponse(new OpenAI.RateLimitError(429, { message: "sensitive upstream detail" }, "sensitive upstream detail", new Headers({ "x-request-id": "req_123" })), performance.now());
    const body = await result.text();
    expect(result.status).toBe(429);
    expect(body).toContain("req_123");
    expect(body).not.toContain("sensitive");
    expect(result.headers.get("cache-control")).toBe("no-store");
    log.mockRestore();
  });
});
