import { StoryRequestSchema } from "@/lib/contracts";
import { generateScript, getClient } from "@/lib/server/ai";
import { errorResponse, jsonResponse, readRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const started = performance.now();
  try {
    const input = await readRequest(request, StoryRequestSchema);
    return jsonResponse(await generateScript(getClient(), input, request.signal));
  } catch (error: unknown) { return errorResponse(error, started); }
}
