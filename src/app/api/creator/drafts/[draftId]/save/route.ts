import { SaveDraftSchema } from "@/lib/creator/opening-contracts";
import { z } from "zod";
import { creatorRequest } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { validateStoryFoundation } from "@/lib/story-engine/state";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
const SaveRequest = SaveDraftSchema.extend({ mode: z.enum(["draft", "illustrate"]).default("draft") }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return engineResponse(async () => {
    const input = await creatorRequest(request, SaveRequest);
    const foundation = validateStoryFoundation(input.foundation);
    const draftId = recordId((await params).draftId); const store = getCreator().store;
    const saved = { operation_id: input.operation_id, foundation, reference_asset_ids: input.reference_asset_ids };
    // Saving never starts provider work. The explicit illustrate action first
    // freezes this version; individual image routes claim the charged stages.
    return input.mode === "illustrate" ? store.saveIllustratedVersion(draftId, saved) : store.saveDraft(draftId, saved);
  });
}
