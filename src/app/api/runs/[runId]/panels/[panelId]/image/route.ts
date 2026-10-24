import { readRequest } from "@/lib/server/http";
import { StageRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request, { params }: { params: Promise<{ runId: string; panelId: string }> }) {
  return engineResponse(async () => { const { runId, panelId } = await params; return getEngine().image(recordId(runId), recordId(panelId), await readRequest(request, StageRequestSchema), request.signal); });
}
