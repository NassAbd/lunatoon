import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as remove } from "../src/app/api/content/deletions/route";
import { GET as preview } from "../src/app/api/content/deletions/preview/route";
import { GET as status } from "../src/app/api/content/deletions/[operationId]/route";
import { StoryStore } from "../src/lib/story-engine/store";
import { operation } from "./engine-fixtures";
const dirs: string[] = [], stores: StoryStore[] = [];
function setup() { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-delete-http-")); dirs.push(dir); vi.stubEnv("LUNATOON_DATA_DIR", dir); return dir; }
const request = (url: string, init?: RequestInit) => new Request(`http://localhost:3000${url}`, init);
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); vi.unstubAllEnvs(); });
describe("local deletion HTTP boundary", () => {
  it("keeps GET side-effect free and rejects cross-site or malformed mutations", async () => {
    const dir = setup(); expect(await (await list(request("/api/content/deletions"))).json()).toEqual({ receipts: [] });
    expect((await preview(request("/api/content/deletions/preview?kind=run&id=invalid"))).status).toBe(400);
    expect((await remove(request("/api/content/deletions", { method: "POST", headers: { origin: "https://elsewhere.test", "content-type": "application/json" }, body: JSON.stringify({ action: "resume", operation_id: operation() }) }))).status).toBe(403);
    expect((await list(request("/api/content/deletions", { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(readdirSync(dir)).toEqual([]);
  });
  it("requires explicit confirmed POST, returns private receipts and safely replays deletion", async () => {
    const dir = setup(), store = new StoryStore(dir); stores.push(store);
    const run = store.createRun({ operation_id: operation(), approach: "text" }, { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" }, { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .5 });
    const response = await preview(request(`/api/content/deletions/preview?kind=run&id=${run.id}`)); const planned = await response.json(); expect(response.headers.get("cache-control")).toContain("no-store"); expect(store.snapshot(run.id).run.id).toBe(run.id);
    const input = { action: "begin", kind: "run", id: run.id, operation_id: operation(), confirmation_revision: planned.confirmation_revision };
    const submitted = await remove(request("/api/content/deletions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })); const receipt = await submitted.json(); expect(submitted.status).toBe(200); expect(receipt.status).toBe("complete");
    expect(JSON.stringify(receipt)).not.toMatch(/plan_json|path|title|document|claim_token|script|prompt/);
    expect(await (await status(request(`/api/content/deletions/${input.operation_id}`), { params: Promise.resolve({ operationId: input.operation_id }) })).json()).toEqual(receipt);
    const replay = await remove(request("/api/content/deletions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })); expect(await replay.json()).toEqual(receipt);
    expect(await (await list(request("/api/content/deletions?kind=run"))).json()).toEqual({ receipts: [] });
  });
});
