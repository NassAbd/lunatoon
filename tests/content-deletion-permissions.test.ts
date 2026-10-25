import { mkdtempSync, rmSync } from "node:fs";
import type { PathLike } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { StoryStore } from "../src/lib/story-engine/store";
import { ContentDeletionService } from "../src/lib/content-management/service";
import { writeManagedAsset } from "../src/lib/content-management/files";
import { operation, jpegBase64 } from "./engine-fixtures";

const denied = vi.hoisted(() => ({ path: null as string | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual,
    existsSync: (file: PathLike) => String(file) === denied.path ? false : actual.existsSync(file),
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
      if (String(args[0]) === denied.path) throw Object.assign(new Error("synthetic access denied"), { code: "EACCES" });
      return actual.lstatSync(...args);
    },
  };
});
const dirs: string[] = [], stores: StoryStore[] = [];
afterEach(() => { denied.path = null; stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
it("does not report an inaccessible owned file as absent or cleanup complete", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-delete-permissions-")); dirs.push(dir);
  const store = new StoryStore(dir); stores.push(store);
  const run = store.createRun({ operation_id: operation(), approach: "text" }, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" }, { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .5 });
  const relative = `images/${run.id}/${operation()}.jpg`; writeManagedAsset(dir, { owner_kind: "run", owner_id: run.id, path: relative, bytes: Buffer.from(jpegBase64, "base64") });
  const service = new ContentDeletionService(dir); const preview = service.preview({ kind: "run", id: run.id }); denied.path = path.join(store.directory, relative);
  const receipt = service.begin({ action: "begin", operation_id: operation(), kind: "run", id: run.id, confirmation_revision: preview.confirmation_revision });
  expect(receipt.status).toBe("cleanup_failed"); expect(receipt.error_code).toBe("cleanup_io_error"); expect(receipt.remaining_files).toBe(1);
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs"); expect(actual.existsSync(denied.path)).toBe(true);
  denied.path = null; expect(service.resume(receipt.operation_id).status).toBe("complete"); expect(actual.existsSync(path.join(dir, relative))).toBe(false);
});
