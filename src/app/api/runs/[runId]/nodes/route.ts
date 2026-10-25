import { readRequest } from "@/lib/server/http";
import { NewNodeRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return engineResponse(async () => getEngine().decide(recordId((await params).runId), await readRequest(request, NewNodeRequestSchema), request.signal));
}
