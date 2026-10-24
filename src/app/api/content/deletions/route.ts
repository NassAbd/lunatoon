import { z } from "zod";
import { creatorRequest, sameOrigin } from "../../../../lib/creator/http";
import { DeletionRequestSchema } from "../../../../lib/content-management/contracts";
import { ContentDeletionService } from "../../../../lib/content-management/service";
import { EngineError } from "../../../../lib/story-engine/errors";
import { engineResponse } from "../../../../lib/story-engine/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return engineResponse(() => { sameOrigin(request); const kind = z.enum(["run", "creator"]).optional().safeParse(new URL(request.url).searchParams.get("kind") ?? undefined); if (!kind.success) throw new EngineError("invalid_request", "Choose a valid content kind.", 400); return { receipts: new ContentDeletionService().list(kind.data) }; });
}
export async function POST(request: Request) {
  return engineResponse(async () => { const input = await creatorRequest(request, DeletionRequestSchema); const service = new ContentDeletionService(); return input.action === "begin" ? service.begin(input) : service.resume(input.operation_id); });
}
