import { readTemplateAsset } from "@/lib/story-templates/server";
import { EngineError } from "@/lib/story-engine/errors";
import { engineResponse } from "@/lib/story-engine/http";
import { sameOrigin } from "@/lib/creator/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ templateId: string; assetId: string }> }) {
  try {
    sameOrigin(request);
    const { templateId, assetId } = await params;
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) throw new EngineError("invalid_version", "Choose a saved story version.", 400);
    const asset = readTemplateAsset(templateId, version, assetId);
    return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return engineResponse(() => { throw error; }); }
}
