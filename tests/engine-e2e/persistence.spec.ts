import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number; contexts: { state: { facts: { id: string }[]; characters: { injuries: string[]; clothing_condition: string }[] }; recent_panels: unknown[] }[]; imagePrompts: string[]; endpoints: string[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function start(request: APIRequestContext, approach = "reference") { const res = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach } }); expect(res.ok()).toBe(true); return SnapshotSchema.parse(await res.json()); }
async function illustrate(request: APIRequestContext, saved: Snapshot) { await Promise.all(saved.panels.filter(p => p.status === "pending").map(p => request.post(`/api/runs/${saved.run.id}/panels/${p.id}/image`, { data: { operation_id: p.operation_id, retry: false } }))); return SnapshotSchema.parse(await (await request.get(`/api/runs/${saved.run.id}`)).json()); }

test("saved two-decision story paints dialogue first, completes images independently, survives refresh and real process restart", async ({ page, request }) => {
  const before = await stats(request); await page.goto("/"); await page.getByRole("button", { name: "Start a persistent story" }).click(); await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  const url = page.url(); const runId = url.split("/").at(-1)!;
  await page.getByRole("radio", { name: "Investigate its origin" }).check(); await page.getByLabel("YOUR TWIST").fill("A mysterious cyborg cat suddenly appears.");
  await page.getByRole("button", { name: "Generate saved continuation" }).click();
  await expect(page.getByText("Aster Transit Lab. You're opening their TL-9 hatch?", { exact: true })).toBeVisible();
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".generated-image")).toHaveCount(1); await expect(page.locator(".generated-image")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "Follow the cat into the Aster Lab maintenance route" })).toBeEnabled();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1440);
  await page.screenshot({ path: "test-results-engine/saved-story-desktop.png", fullPage: true });
  const first = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(first.panels.every(p => p.image_path && existsSync(path.join(runtime().dataDirectory, p.image_path)))).toBe(true);
  const generated = await stats(request); expect(generated.scripts - before.scripts).toBe(1); expect(generated.images - before.images).toBe(2);
  await page.reload(); await expect(page.locator(".generated-image")).toHaveCount(2); expect((await stats(request)).images).toBe(generated.images);
  const restart = await request.post(`${runtime().mockURL}/__restart`); expect(restart.ok()).toBe(true);
  await page.goto(url); await expect(page.locator(".generated-image")).toHaveCount(2); expect(await stats(request)).toEqual(generated);
  const restored = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json()); expect(restored.panels.map(p => p.image_path)).toEqual(first.panels.map(p => p.image_path));
  await page.getByRole("radio", { name: "Follow the cat into the Aster Lab maintenance route" }).check(); await page.getByRole("button", { name: "Generate saved continuation" }).click();
  await expect(page.getByText("THE END · YOUR STORY IS SAVED.")).toBeVisible(); await expect(page.locator(".generated-image")).toHaveCount(4);
  const final = await stats(request); expect(final.scripts - before.scripts).toBe(2); expect(final.images - before.images).toBe(4);
  expect(final.contexts.at(-1)!.state.facts.map(f => f.id)).toEqual(expect.arrayContaining(["device_source", "cat_access"])); expect(final.contexts.at(-1)!.state.characters[0].injuries).toContain("A shallow cut on his right hand"); expect(final.contexts.at(-1)!.recent_panels).toHaveLength(2);
  expect(final.imagePrompts.at(-1)).toContain("torn at the right cuff");
});

test("duplicate operation IDs claim one narrative/image request and cross-run asset reads are rejected", async ({ request }) => {
  const before = await stats(request); const run = await start(request, "text"); const base = `/api/runs/${run.run.id}`;
  const decision = { operation_id: randomUUID(), choice_id: "investigate", instruction: "A cyborg cat appears." };
  const responses = await Promise.all([request.post(`${base}/nodes`, { data: decision }), request.post(`${base}/nodes`, { data: decision })]); expect(responses.every(r => r.ok())).toBe(true);
  let saved = SnapshotSchema.parse(await (await request.get(base)).json()); const panel = saved.panels[0];
  await Promise.all([request.post(`${base}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id } }), request.post(`${base}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id } })]);
  const after = await stats(request); expect(after.scripts - before.scripts).toBe(1); expect(after.images - before.images).toBe(1);
  saved = await illustrate(request, SnapshotSchema.parse(await (await request.get(base)).json())); expect(saved.panels.every(p => p.status === "complete")).toBe(true);
  const other = await start(request); expect((await request.get(`/api/runs/${other.run.id}/assets/${panel.id}`)).status()).toBe(404);
  expect((await request.post(`${base}/nodes`, { data: { ...decision, instruction: "Changed" } })).status()).toBe(409);
  expect((await request.post(`${base}/nodes`, { headers: { Origin: "https://other.invalid" }, data: decision })).status()).toBe(403);
});

test("failed image retry consumes one call only, preserves its sibling and script, and hard call limit blocks more work", async ({ page, request }) => {
  const before = await stats(request); const run = await start(request); const base = `/api/runs/${run.run.id}`;
  await request.post(`${runtime().mockURL}/__control`, { data: { failSecond: true, imageDelay: 150 } });
  let saved = SnapshotSchema.parse(await (await request.post(`${base}/nodes`, { data: { operation_id: randomUUID(), choice_id: "investigate", instruction: "A cyborg cat appears." } })).json()); saved = await illustrate(request, saved);
  expect(saved.panels.map(p => p.status)).toEqual(["complete", "failed"]); const sibling = saved.panels[0].image_path;
  await page.goto(`/run/${run.run.id}`); await expect(page.getByText("Unknown-cost attempts: 1.", { exact: false })).toBeVisible();
  await request.post(`${runtime().mockURL}/__control`, { data: { failSecond: false, imageDelay: 150 } });
  await page.getByRole("button", { name: "Retry panel 2 image · one paid call" }).click(); await expect(page.locator(".generated-image")).toHaveCount(2);
  saved = SnapshotSchema.parse(await (await request.get(base)).json()); expect(saved.panels[0].image_path).toBe(sibling); expect(saved.summary.image_calls).toBe(3);
  expect((await stats(request)).scripts - before.scripts).toBe(1); expect((await stats(request)).images - before.images).toBe(3);
  // A same-script replay reserves two calls; only one slot remains afterwards, so the next two-panel chapter cannot start.
  saved = SnapshotSchema.parse(await (await request.post(`${base}/nodes/${saved.nodes[0].id}/replay`, { data: { operation_id: randomUUID(), approach: "text" } })).json()); await illustrate(request, saved);
  const denied = await request.post(`${base}/nodes`, { data: { operation_id: randomUUID(), choice_id: "follow_cat", instruction: "" } }); expect(denied.status()).toBe(402);
  expect((await stats(request)).scripts - before.scripts).toBe(1);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 900 } });
});
