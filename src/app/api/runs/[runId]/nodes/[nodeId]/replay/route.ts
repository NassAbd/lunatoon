import { readRequest } from "@/lib/server/http";
import { ReplayRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ runId: string; nodeId: string }> }) {
  return engineResponse(async () => { const { runId, nodeId } = await params; return getEngine().replay(recordId(runId), recordId(nodeId), await readRequest(request, ReplayRequestSchema)); });
}
