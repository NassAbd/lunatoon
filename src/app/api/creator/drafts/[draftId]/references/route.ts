import { boundedBody, sameOrigin } from "@/lib/creator/http";
import { getCreator } from "@/lib/creator/runtime";
import { normalizeReference, UPLOAD_LIMIT_BYTES, ReferenceValidationError } from "@/lib/creator/uploads";
import { EngineError } from "@/lib/story-engine/errors";
import { engineResponse, recordId } from "@/lib/story-engine/http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return engineResponse(async () => {
    sameOrigin(request);
    const draftId = recordId((await params).draftId);
    const store = getCreator().store; store.getDraft(draftId);
    const bytes = await boundedBody(request, UPLOAD_LIMIT_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new EngineError("invalid_upload", "Choose a PNG, JPEG or WebP image.", 400); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File) || [...form.keys()].some(key => !["file", "purpose"].includes(key))) throw new EngineError("invalid_upload", "Upload one reference image at a time.", 400);
    const rawPurpose = form.get("purpose");
    const purpose = typeof rawPurpose === "string" && rawPurpose.trim().length <= 200 ? rawPurpose.trim() || "Story visual reference" : "Story visual reference";
    const normalized = await normalizeReference(Buffer.from(await files[0].arrayBuffer())).catch(error => {
      if (error instanceof ReferenceValidationError) throw new EngineError("invalid_upload", error.message, 400);
      throw error;
    });
    store.addReference(draftId, { ...normalized, purpose });
    return store.getDraft(draftId);
  });
}
