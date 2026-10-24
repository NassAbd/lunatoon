import { readRequest } from "@/lib/server/http";
import { StageRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request, { params }: { params: Promise<{ runId: string; nodeId: string }> }) {
  return engineResponse(async () => { const { runId, nodeId } = await params; return getEngine().script(recordId(runId), recordId(nodeId), await readRequest(request, StageRequestSchema), request.signal); });
}
