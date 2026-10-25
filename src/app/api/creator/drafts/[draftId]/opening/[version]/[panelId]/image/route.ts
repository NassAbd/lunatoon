import { creatorRequest } from "@/lib/creator/http";
import { OpeningImageSchema } from "@/lib/creator/opening-contracts";
import type { OpeningStreamEvent } from "@/lib/creator/contracts";
import { getCreator } from "@/lib/creator/runtime";
import { GenerationError } from "@/lib/server/ai";
import { EngineError } from "@/lib/story-engine/errors";
import { engineResponse, recordId } from "@/lib/story-engine/http";
import { IMAGE_STREAM_CONTENT_TYPE } from "@/lib/story-engine/image-stream";

export const runtime = "nodejs";
export const maxDuration = 240;
type Context = { params: Promise<{ draftId: string; version: string; panelId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const input = await creatorRequest(request, OpeningImageSchema);
    const values = await params;
    const draftId = recordId(values.draftId); const panelId = recordId(values.panelId);
    const version = Number(values.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new EngineError("invalid_version", "Choose a saved story version.", 400);
    const service = getCreator().opening;
    if (!request.headers.get("accept")?.includes(IMAGE_STREAM_CONTENT_TYPE)) return engineResponse(() => service.generate(draftId, version, panelId, input, request.signal));
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    let connected = true;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: OpeningStreamEvent) => {
          if (connected && !signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const snapshot = await service.generate(draftId, version, panelId, input, signal, preview => send({ type: "preview", panel_id: panelId, ...preview }));
          send({ type: "settled", snapshot });
        } catch (error: unknown) {
          const safe = error instanceof EngineError || error instanceof GenerationError;
          send({ type: "error", code: safe ? error.code : "opening_request_failed", message: safe ? error.message : "This opening illustration could not finish. Check saved progress before explicitly trying again." });
        } finally {
          if (connected) { connected = false; controller.close(); }
        }
      },
      cancel() { connected = false; cancellation.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": `${IMAGE_STREAM_CONTENT_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error: unknown) { return engineResponse(() => { throw error; }); }
}
