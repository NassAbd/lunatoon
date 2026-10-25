import { describe, expect, it } from "vitest";
import { z } from "zod";
import { boundedBody, creatorRequest, sameOrigin } from "../src/lib/creator/http";

describe("bounded local creator requests", () => {
  it("rejects cross-site writes and asset reads, and accepts the normalized local host", () => {
    expect(() => sameOrigin(new Request("http://localhost/api", { headers: { host: "127.0.0.1:3110", origin: "http://127.0.0.1:3110" } }))).not.toThrow();
    expect(() => sameOrigin(new Request("http://localhost/api", { headers: { origin: "https://elsewhere.example" } }))).toThrow();
    expect(() => sameOrigin(new Request("http://localhost/api", { headers: { "sec-fetch-site": "cross-site" } }))).toThrow();
  });
  it("bounds actual body bytes even when content-length is absent or falsely small", async () => {
    for (const declared of [null, "1"]) {
      const headers = new Headers(); if (declared) headers.set("content-length", declared);
      await expect(boundedBody(new Request("http://localhost/api", { method: "POST", body: "x".repeat(11), headers }), 10)).rejects.toMatchObject({ code: "request_too_large" });
    }
    expect((await boundedBody(new Request("http://localhost/api", { method: "POST", body: "ok" }), 10)).toString()).toBe("ok");
  });
  it("validates strict request contracts before store or provider work", async () => {
    const schema = z.object({ prompt: z.string().min(20).max(4000) }).strict();
    for (const body of ['{}', '{"prompt":"short"}', 'invalid']) await expect(creatorRequest(new Request("http://localhost/api", { method: "POST", body }), schema)).rejects.toMatchObject({ status: 400 });
  });
});
