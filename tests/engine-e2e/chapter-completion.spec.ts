import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<{ scripts: number; images: number }> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, number | boolean>) { expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true); }
async function start(request: APIRequestContext) { const result = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } }); expect(result.ok()).toBe(true); return SnapshotSchema.parse(await result.json()); }
async function read(request: APIRequestContext, id: string) { const result = await request.get(`/api/runs/${id}`); expect(result.ok()).toBe(true); return SnapshotSchema.parse(await result.json()); }
async function script(request: APIRequestContext, run: Snapshot) { const result = await request.post(`/api/runs/${run.run.id}/nodes`, { data: { operation_id: randomUUID(), choice_id: "investigate", instruction: "" } }); expect(result.ok()).toBe(true); return SnapshotSchema.parse(await result.json()); }
test.beforeEach(async ({ request }) => control(request, {}));
test.afterEach(async ({ request }) => control(request, {}));

test("dialogue and independent finals precede the next decision and ending, including saved reload and restart", async ({ page, request, browser }) => {
  await control(request, { scriptDelay: 100, imageDelay: 1200, reverseImages: true, streamPreviews: true });
  const before = await stats(request), run = await start(request), url = `/run/${run.run.id}`;
  await page.goto(url);
  await page.getByRole("radio", { name: "Investigate its origin" }).check();
  await page.getByRole("button", { name: "Continue the story", exact: true }).click();
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  await expect(page.locator(".preview-image")).toHaveCount(2);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  await expect(page.locator(".book-panel").nth(1).locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-panel").first().locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  const next = page.locator(".book-decision[data-step='2']"); await expect(next).toBeVisible();
  const first = await read(request, run.run.id); const nextChoice = first.nodes[0].chapter!.next_decision.options[0];
  await next.getByRole("radio", { name: nextChoice.label }).check();
  await next.getByRole("button", { name: "Continue the story", exact: true }).click();
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toHaveCount(0);
  await expect(page.locator(".book-panel").nth(3).locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-panel").nth(2).locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".book-ending")).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toBeVisible();
  const complete = await read(request, run.run.id), after = await stats(request);
  expect(after.scripts - before.scripts).toBe(2); expect(after.images - before.images).toBe(4);

  // A saved final is not visually ready until this document has received and
  // decoded it. Hold one local GET; this never delays a provider request.
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  await page.route(url => url.pathname === `/api/runs/${run.run.id}/assets/${complete.panels[3].id}`, async route => { intercepted = true; await held; await route.continue(); });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(3);
    await expect(page.locator(".book-ending")).toHaveCount(0);
    expect(await stats(request)).toEqual(after);
  } finally { release(); }
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toBeVisible();
  await page.waitForLoadState("networkidle"); const absolute = page.url(); await page.context().close();
  expect((await request.post(`${runtime().mockURL}/__restart`)).ok()).toBe(true);
  const restored = await browser.newPage();
  try {
    await restored.goto(absolute);
    await expect(restored.locator(".generated-image.is-ready")).toHaveCount(4);
    await expect(restored.locator(".book-ending")).toBeVisible();
    expect((await read(request, run.run.id)).panels.map(panel => panel.image_path)).toEqual(complete.panels.map(panel => panel.image_path));
    expect(await stats(request)).toEqual(after);
  } finally { await restored.close(); }
});

test("a failed first-chapter image blocks the next decision across reload until explicit isolated recovery", async ({ page, request }) => {
  await control(request, { scriptDelay: 50, imageDelay: 100, failSecond: true });
  const run = await start(request), written = await script(request, run);
  await Promise.all(written.panels.map(panel => request.post(`/api/runs/${run.run.id}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id, retry: false } })));
  const failed = await read(request, run.run.id); expect(failed.panels.map(panel => panel.status)).toEqual(["complete", "failed"]);
  const beforeVisit = await stats(request);
  await page.goto(`/run/${run.run.id}`);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-decision[data-step='2'], .book-ending")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try this illustration again", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-decision[data-step='2'], .book-ending")).toHaveCount(0);
  expect(await stats(request)).toEqual(beforeVisit);
  await control(request, { imageDelay: 100 });
  await page.getByRole("button", { name: "Try this illustration again", exact: true }).click();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  const repaired = await read(request, run.run.id), after = await stats(request);
  expect(repaired.panels[0]).toEqual(failed.panels[0]);
  expect(after.scripts).toBe(beforeVisit.scripts); expect(after.images - beforeVisit.images).toBe(1);
});
