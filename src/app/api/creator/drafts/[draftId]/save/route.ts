import { SaveTemplateSchema } from "@/lib/creator/contracts";
import { creatorRequest } from "@/lib/creator/http";
import { registerPlaceholders } from "@/lib/creator/artwork";
import { getCreator } from "@/lib/creator/runtime";
import { validateStoryFoundation } from "@/lib/story-engine/state";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
const SaveRequest = SaveTemplateSchema.omit({ cover_asset_id: true, opening_asset_ids: true });
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return engineResponse(async () => {
    const input = await creatorRequest(request, SaveRequest);
    const foundation = validateStoryFoundation(input.foundation);
    const draftId = recordId((await params).draftId); const store = getCreator().store;
    const artwork = registerPlaceholders(store, draftId, foundation);
    return store.saveTemplate(draftId, { ...input, foundation, ...artwork });
  });
}
