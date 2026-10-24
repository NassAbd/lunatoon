import { sameOrigin } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
type Props = { params: Promise<{ draftId: string; assetId: string }> };
export async function GET(request: Request, { params }: Props) {
  try {
    sameOrigin(request); const { draftId, assetId } = await params;
    const asset = getCreator().store.readReference(recordId(draftId), assetId);
    return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return engineResponse(() => { throw error; }); }
}
export async function DELETE(request: Request, { params }: Props) {
  return engineResponse(async () => { sameOrigin(request); const { draftId, assetId } = await params; const store = getCreator().store; store.removeReference(recordId(draftId), assetId); return store.getDraft(draftId); });
}
