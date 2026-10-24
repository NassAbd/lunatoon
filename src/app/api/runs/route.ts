import { readRequest } from "@/lib/server/http";
import { NewRunRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse } from "@/lib/story-engine/http";
import { getEngine, runSettings } from "@/lib/story-engine/runtime";
import { getTemplateBundle } from "@/lib/story-templates/server";
import { EngineError } from "@/lib/story-engine/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return engineResponse(async () => {
    const input = await readRequest(request, NewRunRequestSchema); const engine = getEngine(); const { models, limits } = runSettings();
    const bundle = input.template_id ? getTemplateBundle(input.template_id, input.template_version) : undefined;
    if (input.template_id && !bundle) throw new EngineError("template_not_found", "This story version was not found.", 404);
    const run = engine.store.createRun(input, models, limits, bundle ?? undefined); return engine.snapshot(run.id);
  });
}
