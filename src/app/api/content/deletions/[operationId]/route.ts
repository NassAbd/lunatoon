import { sameOrigin } from "../../../../../lib/creator/http";
import { ContentDeletionService } from "../../../../../lib/content-management/service";
import { engineResponse, recordId } from "../../../../../lib/story-engine/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ operationId: string }> }) {
  return engineResponse(async () => { sameOrigin(request); return new ContentDeletionService().status(recordId((await context.params).operationId)); });
}
