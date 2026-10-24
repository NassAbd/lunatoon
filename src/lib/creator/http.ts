import { z } from "zod";
import { EngineError } from "../story-engine/errors";

export function sameOrigin(request: Request) {
  const url = new URL(request.url); url.host = request.headers.get("host") ?? url.host;
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin && origin !== url.origin) throw new EngineError("invalid_origin", "Open Creator Studio from this local Lunatoon installation.", 403);
}

export async function boundedBody(request: Request, limit: number) {
  sameOrigin(request);
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > limit) throw new EngineError("request_too_large", "This upload or story is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new EngineError("request_too_large", "This upload or story is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export async function creatorRequest<T>(request: Request, schema: z.ZodType<T>) {
  const bytes = await boundedBody(request, 96 * 1024);
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new EngineError("invalid_json", "Send a valid story request.", 400); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new EngineError("invalid_request", "Check the story fields and their length limits before continuing.", 400);
  return parsed.data;
}
