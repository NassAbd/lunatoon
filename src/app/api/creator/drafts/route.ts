import { CreateDraftSchema } from "@/lib/creator/contracts";
import { creatorRequest } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { engineResponse } from "@/lib/story-engine/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return engineResponse(async () => { const input = await creatorRequest(request, CreateDraftSchema); return getCreator().store.createDraft(input); });
}
