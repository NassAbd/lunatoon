import { z } from "zod";
import { errorResponse, jsonResponse } from "../server/http";
import { EngineError } from "./errors";
import { Id } from "./contracts";

export function recordId(value: string) {
  if (!Id.safeParse(value).success) throw new EngineError("invalid_id", "A valid local run or record ID is required.", 400);
  return value;
}
export async function engineResponse(work: () => unknown | Promise<unknown>) {
  const started = performance.now();
  try { return jsonResponse(await work()); }
  catch (error: unknown) {
    if (error instanceof EngineError) return jsonResponse({ error: { code: error.code, message: error.message, request_id: null } }, error.status);
    if (error instanceof z.ZodError) return jsonResponse({ error: { code: "invalid_record", message: "Saved data or server settings do not match the story engine contract. Preserve the data and check configuration.", request_id: null } }, 500);
    return errorResponse(error, started);
  }
}
