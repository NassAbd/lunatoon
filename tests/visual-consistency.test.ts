import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageRequestSchema } from "../src/lib/contracts";
import { buildIllustrationPrompt, isReferenceModelSupported } from "../src/lib/art-direction";
import { generateIllustration } from "../src/lib/server/ai";
import { scriptFixture } from "./fixtures";

afterEach(() => vi.unstubAllEnvs());

describe("visual continuity contract", () => {
  it("preserves existing callers and accepts only the two explicit approaches", () => {
    expect(ImageRequestSchema.parse({ panel: scriptFixture.panels[0] }).approach).toBe("text");
    expect(ImageRequestSchema.parse({ panel: scriptFixture.panels[0], approach: "reference" }).approach).toBe("reference");
    expect(ImageRequestSchema.safeParse({ panel: scriptFixture.panels[0], approach: "auto" }).success).toBe(false);
  });
  it("directs distinct shots and reserves the actual bubble positions", () => {
    const first = buildIllustrationPrompt(scriptFixture.panels[0]);
    const second = buildIllustrationPrompt(scriptFixture.panels[1]);
    expect(first).toContain("establishing wide shot");
    expect(second).toContain("expressive close-up");
    expect(first).toContain("top-left");
    expect(first).toContain("flat color");
    expect(first).toContain("No photorealism");
    expect(first).toContain("anatomical left");
  });
  it("only enables reference edits for documented model IDs", () => {
    expect(isReferenceModelSupported("gpt-image-2.5-flare")).toBe(true);
    expect(isReferenceModelSupported("gpt-image-2.5-flare-2026-09-08")).toBe(true);
    expect(isReferenceModelSupported("unknown-model")).toBe(false);
  });
});

describe("reference edit using official SDK, mocked HTTP", () => {
  it("uses the same authored PNG, one edit, no unsupported fidelity option or hidden fallback", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare");
    const urls: string[] = [];
    let form: FormData | undefined;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      if (String(url) === "data:,") return new Response(); // SDK local multipart probe, not an API call.
      urls.push(String(url));
      form = init?.body as FormData;
      return Response.json({ created: 1, data: [{ b64_json: "aW1hZ2U=" }] }, { headers: { "x-request-id": "req_edit" } });
    } });
    const result = await generateIllustration(client, scriptFixture.panels[0], undefined, "reference");
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/images/edits");
    const file = form?.get("image");
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe("image/png");
    expect((file as File).name).toBe("kael-reference.png");
    expect(form?.get("input_fidelity")).toBeNull();
    expect(form?.get("n")).toBe("1");
    expect(result.metrics).toMatchObject({ approach: "reference", quality: "low", request_id: "req_edit" });
  });
  it("stops an unsupported reference model before making a paid request", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "unknown-model");
    const fetch = vi.fn();
    const client = new OpenAI({ apiKey: "test-only", fetch });
    await expect(generateIllustration(client, scriptFixture.panels[0], undefined, "reference")).rejects.toThrow(/reference/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not substitute a text generation call after a reference failure", async () => {
    vi.stubEnv("OPENAI_IMAGE_MODEL", "gpt-image-2.5-flare");
    const fetch = vi.fn(async (url: RequestInfo | URL) => String(url) === "data:," ? new Response() : Response.json({ error: { message: "Unavailable", type: "permission_error" } }, { status: 403 }));
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch });
    await expect(generateIllustration(client, scriptFixture.panels[0], undefined, "reference")).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("api.openai.com"))).toHaveLength(1);
  });
});
