import OpenAI from "openai";
import { z } from "zod";
import { GenerationError } from "./ai";

export async function readRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost even when the browser used 127.0.0.1.
  const publicURL = new URL(request.url);
  publicURL.host = request.headers.get("host") ?? publicURL.host;
  if (origin && origin !== publicURL.origin) throw new GenerationError("invalid_origin", "Cross-origin generation is not supported.", 403);
  const text = await request.text();
  if (text.length > 12_000) throw new GenerationError("request_too_large", "This request is too large.", 413);
  let data: unknown;
  try { data = JSON.parse(text) as unknown; } catch { throw new GenerationError("invalid_json", "Send a valid JSON request.", 400); }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new GenerationError("invalid_request", "The request does not match the two-panel experiment. Check your choice and keep the twist under 500 characters.", 400);
  return parsed.data;
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown, started: number) {
  let code = "generation_failed";
  let message = "Generation failed. Please try again.";
  let status = 502;
  let requestId: string | null = null;
  if (error instanceof GenerationError) {
    ({ code, message, status } = error);
  } else if (error instanceof OpenAI.APIError) {
    requestId = error.requestID ?? null;
    if (error.status === 401) { code = "invalid_api_key"; message = "The server API key was rejected. Check OPENAI_API_KEY in .env.local."; }
    else if (error.status === 403 || error.status === 404) { code = "model_unavailable"; message = "The selected model is unavailable to this API project. Check model access and server model settings."; }
    else if (error.status === 429) { code = "rate_limit_or_quota"; message = "OpenAI reported a rate limit or quota error. Check API billing and limits before retrying."; status = 429; }
    else if (error.status === 400) { code = "request_rejected"; message = "OpenAI rejected the request. Check model compatibility, image access, or try a different twist."; }
    else if (error instanceof OpenAI.APIConnectionTimeoutError) { code = "upstream_timeout"; message = "OpenAI timed out. Try again; the latency targets are experimental."; status = 504; }
  } else if (error instanceof z.ZodError) {
    code = "invalid_model_output"; message = "The model output did not satisfy the panel contract. Try again.";
  }
  // Do not log request payloads, credentials, or raw upstream error messages.
  console.error("[lunatoon]", { code, status, request_id: requestId });
  return jsonResponse({ error: { code, message, request_id: requestId }, duration_ms: Math.round(performance.now() - started) }, status);
}
