import { sameOrigin } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return engineResponse(async () => { sameOrigin(request); return getCreator().store.getDraft(recordId((await params).draftId)); });
}
