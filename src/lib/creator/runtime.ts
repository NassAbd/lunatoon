import path from "node:path";
import { CreatorStore } from "./store";
import { CreatorService } from "./service";
import { OpeningService } from "./opening-service";
const runtime = globalThis as typeof globalThis & { lunatoonCreatorStores?: Map<string, CreatorStore> };
export function getCreator() {
  const directory = path.resolve(process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data"));
  const stores = runtime.lunatoonCreatorStores ??= new Map();
  let store = stores.get(directory);
  if (!store) { store = new CreatorStore(directory); stores.set(directory, store); }
  return { store, service: new CreatorService(store), opening: new OpeningService(store) };
}
