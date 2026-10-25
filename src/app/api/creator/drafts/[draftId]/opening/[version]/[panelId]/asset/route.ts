import { sameOrigin } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { EngineError } from "@/lib/story-engine/errors";
import { engineResponse, recordId } from "@/lib/story-engine/http";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ draftId: string; version: string; panelId: string }> }) {
  try {
    sameOrigin(request);
    const { draftId, version: rawVersion, panelId } = await params;
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1) throw new EngineError("invalid_version", "Choose a saved story version.", 400);
    const asset = getCreator().store.readOpeningAsset(recordId(draftId), version, recordId(panelId));
    return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error: unknown) { return engineResponse(() => { throw error; }); }
}
