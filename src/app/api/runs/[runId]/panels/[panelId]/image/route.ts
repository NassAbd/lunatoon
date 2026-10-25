import { readRequest } from "@/lib/server/http";
import { StageRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { getEngine } from "@/lib/story-engine/runtime";
import { IMAGE_STREAM_CONTENT_TYPE, type ImageStreamEvent } from "@/lib/story-engine/image-stream";
import { EngineError } from "@/lib/story-engine/errors";
import { GenerationError } from "@/lib/server/ai";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request, { params }: { params: Promise<{ runId: string; panelId: string }> }) {
  if (!request.headers.get("accept")?.includes(IMAGE_STREAM_CONTENT_TYPE)) {
    return engineResponse(async () => { const { runId, panelId } = await params; return getEngine().image(recordId(runId), recordId(panelId), await readRequest(request, StageRequestSchema), request.signal); });
  }
  try {
    const { runId, panelId } = await params;
    recordId(runId); recordId(panelId);
    const input = await readRequest(request, StageRequestSchema);
    const engine = getEngine();
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    let connected = true;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: ImageStreamEvent) => {
          if (connected && !signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const snapshot = await engine.image(runId, panelId, input, signal, preview => send({ type: "preview", panel_id: panelId, ...preview }));
          send({ type: "settled", snapshot });
        } catch (error: unknown) {
          send({ type: "error", code: error instanceof EngineError || error instanceof GenerationError ? error.code : "image_request_failed", message: error instanceof EngineError || error instanceof GenerationError ? error.message : "This illustration could not finish. Reload the saved story to check its status before trying again." });
        } finally {
          if (connected) { connected = false; controller.close(); }
        }
      },
      cancel() { connected = false; cancellation.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": `${IMAGE_STREAM_CONTENT_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error: unknown) { return engineResponse(() => { throw error; }); }
}
