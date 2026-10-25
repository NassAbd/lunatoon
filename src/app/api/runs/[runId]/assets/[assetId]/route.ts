import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string; assetId: string }> }) {
  const { runId, assetId } = await params;
  try {
    const asset = getEngine().store.readAsset(recordId(runId), assetId);
    return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return engineResponse(() => { throw error; }); }
}
