import { sameOrigin } from "../../../../../lib/creator/http";
import { DeletionTargetSchema } from "../../../../../lib/content-management/contracts";
import { ContentDeletionService } from "../../../../../lib/content-management/service";
import { EngineError } from "../../../../../lib/story-engine/errors";
import { engineResponse } from "../../../../../lib/story-engine/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return engineResponse(() => { sameOrigin(request); const params = new URL(request.url).searchParams; const target = DeletionTargetSchema.safeParse({ kind: params.get("kind"), id: params.get("id") }); if (!target.success) throw new EngineError("invalid_request", "Choose a valid local story to manage.", 400); return new ContentDeletionService().preview(target.data); });
}
