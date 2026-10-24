import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return engineResponse(async () => getEngine().snapshot(recordId((await params).runId)));
}
