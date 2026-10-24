import { readRequest } from "@/lib/server/http";
import { NewRunRequestSchema } from "@/lib/story-engine/contracts";
import { engineResponse } from "@/lib/story-engine/http";
import { getEngine, runSettings } from "@/lib/story-engine/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return engineResponse(async () => {
    const input = await readRequest(request, NewRunRequestSchema); const engine = getEngine(); const { models, limits } = runSettings();
    const run = engine.store.createRun(input, models, limits); return engine.snapshot(run.id);
  });
}
