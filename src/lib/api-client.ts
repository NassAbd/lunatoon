import { z } from "zod";
import { ErrorResponseSchema, ImageResponseSchema, StoryResponseSchema, type ScriptPanel, type StoryRequest } from "./contracts";

export class RequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly duration_ms: number, public readonly request_id: string | null) { super(message); }
}

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const started = performance.now();
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  let data: unknown;
  try { data = await response.json() as unknown; } catch { throw new RequestError("The server returned an unreadable response.", "invalid_response", performance.now() - started, null); }
  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(data);
    if (parsed.success) throw new RequestError(parsed.data.error.message, parsed.data.error.code, parsed.data.duration_ms, parsed.data.error.request_id);
    throw new RequestError(`Request failed (HTTP ${response.status}).`, "http_error", performance.now() - started, null);
  }
  return schema.parse(data);
}

export const fetchStory = (request: StoryRequest, signal: AbortSignal) => post("/api/story", request, StoryResponseSchema, signal);
export async function fetchImage(panel: ScriptPanel, signal: AbortSignal) {
  const result = await post("/api/image", { panel }, ImageResponseSchema, signal);
  // Include browser decoding in end-to-end completion; retain server latency separately.
  const image = new Image();
  image.src = result.image_url;
  await image.decode();
  signal.throwIfAborted();
  return result;
}
