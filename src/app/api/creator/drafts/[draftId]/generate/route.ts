import { GenerateFoundationSchema } from "@/lib/creator/contracts";
import { creatorRequest } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return engineResponse(async () => {
    const input = await creatorRequest(request, GenerateFoundationSchema);
    return getCreator().service.generate(recordId((await params).draftId), input, request.signal);
  });
}
