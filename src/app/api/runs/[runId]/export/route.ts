import { sameOrigin } from "@/lib/creator/http";
import { engineResponse } from "@/lib/story-engine/http";
import { EXPORT_CONTENT_POLICY, exportCompletedStory } from "@/lib/story-engine/export";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    sameOrigin(request);
    const result = await exportCompletedStory((await params).runId);
    return new Response(result.html, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": EXPORT_CONTENT_POLICY,
    } });
  } catch (error: unknown) { return engineResponse(() => { throw error; }); }
}
