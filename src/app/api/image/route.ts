import { ImageRequestSchema } from "@/lib/contracts";
import { generateIllustration, getClient } from "@/lib/server/ai";
import { errorResponse, jsonResponse, readRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const started = performance.now();
  try {
    const input = await readRequest(request, ImageRequestSchema);
    return jsonResponse(await generateIllustration(getClient(), input.panel, request.signal, input.approach));
  } catch (error: unknown) { return errorResponse(error, started); }
}
