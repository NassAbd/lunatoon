import path from "node:path";
import { getModelConfig } from "../server/ai";
import { LimitsSchema } from "./contracts";
import { StoryStore } from "./store";
import { StoryEngine } from "./service";
import { openAIProvider } from "./provider";

const runtime = globalThis as typeof globalThis & { lunatoonStores?: Map<string, StoryStore> };
export function getEngine() {
  const directory = path.resolve(process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data"));
  const stores = runtime.lunatoonStores ??= new Map();
  let store = stores.get(directory); if (!store) { store = new StoryStore(directory); stores.set(directory, store); }
  return new StoryEngine(store, openAIProvider());
}
export function runSettings() {
  const config = getModelConfig();
  return { models: { story: config.story, image: config.image, quality: config.quality }, limits: LimitsSchema.parse({ max_steps: Number(process.env.LUNATOON_MAX_STEPS || 2), max_image_calls: Number(process.env.LUNATOON_MAX_IMAGE_CALLS || 6), max_script_calls: Number(process.env.LUNATOON_MAX_SCRIPT_CALLS || 3), budget_usd: Number(process.env.LUNATOON_RUN_BUDGET_USD || 0.3) }) };
}
