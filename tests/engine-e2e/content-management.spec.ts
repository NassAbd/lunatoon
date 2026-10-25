import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";
import { CreatorSnapshotSchema } from "../../src/lib/creator/contracts";

const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext) => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function createRun(request: APIRequestContext) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json());
}
async function expectDeleted(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  // Durable tombstones distinguish intentionally deleted content from an
  // unknown ID and prevent late work or stale create operations resurrecting it.
  expect(response.status()).toBe(410);
  expect(await response.json()).toMatchObject({ error: { code: "content_deleted" } });
}
async function captureDialog(page: Page, name: string) {
  mkdirSync("test-results-live/poc-08-1/screenshots", { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    const bounds = await page.getByRole("dialog").boundingBox(); expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - 550)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results-live/poc-08-1/screenshots/${name}-${width}.png`, animations: "disabled" });
  }
}
test.afterEach(async ({ request }) => { expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true); });

test("reading deletion requires accessible confirmation and preserves its sibling and original story", async ({ page, request }) => {
  const first = await createRun(request); const sibling = await createRun(request);
  const before = await stats(request);
  await page.goto("/saved");
  const card = page.locator(`[data-run-id='${first.run.id}']`);
  const remove = card.getByRole("button", { name: /Delete reading/ });
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Delete this reading?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The original story will remain available.");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await captureDialog(page, "reading-delete-confirmation");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
  expect((await request.get(`/api/runs/${first.run.id}`)).ok()).toBe(true);
  await remove.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toBeVisible();
  await page.evaluate(() => Object.assign(window, { managementDocument: document.documentElement }));
  await remove.click();
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Reading deleted permanently." })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { managementDocument?: Element }).managementDocument === document.documentElement)).toBe(true);
  await expectDeleted(request, `/api/runs/${first.run.id}`);
  expect(SnapshotSchema.parse(await (await request.get(`/api/runs/${sibling.run.id}`)).json())).toEqual(sibling);
  await expect(page.locator(`[data-run-id='${sibling.run.id}']`)).toBeVisible();
  expect((await request.get("/story/neon-protocol")).ok()).toBe(true);
  expect(await stats(request)).toEqual(before);
  await page.reload();
  await expect(page.locator(`[data-run-id='${first.run.id}']`)).toHaveCount(0);
  await expect(page.locator(`[data-run-id='${sibling.run.id}']`)).toBeVisible();
  expect(await stats(request)).toEqual(before);
});

test("pending filesystem cleanup is reported honestly and resumed explicitly after reload", async ({ page, request }) => {
  // UI contract fixture only: filesystem interruption/recovery is exercised by
  // isolated store tests. This response never deletes the real mock-server run.
  const run = await createRun(request); const before = await stats(request); const operationId = randomUUID();
  const receipt = { operation_id: operationId, kind: "run", id: run.run.id, status: "cleanup_failed", deleted_run_count: 1, remaining_files: 1, error_code: "cleanup_failed" };
  let began = false; let resumed = false;
  await page.route("**/api/content/deletions?kind=run", route => route.fulfill({ json: { receipts: began && !resumed ? [receipt] : [] } }));
  await page.route("**/api/content/deletions", async route => {
    const body = route.request().postDataJSON() as { action: string; operation_id: string };
    if (body.action === "begin") { began = true; await route.fulfill({ json: receipt }); }
    else { expect(body).toMatchObject({ action: "resume", operation_id: operationId }); resumed = true; await route.fulfill({ json: { ...receipt, status: "complete", remaining_files: 0, error_code: null } }); }
  });
  await page.goto("/saved");
  await page.locator(`[data-run-id='${run.run.id}']`).getByRole("button", { name: /Delete reading/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently", exact: true }).click();
  const cleanup = page.locator(`[data-deletion-id='${operationId}']`);
  await expect(cleanup).toContainText("Some local files still need cleanup");
  await expect(page.getByText("Reading deleted permanently.", { exact: true })).toHaveCount(0);
  expect(resumed).toBe(false);
  await page.reload();
  await expect(cleanup).toBeVisible();
  expect(resumed).toBe(false);
  await cleanup.getByRole("button", { name: "Retry cleanup", exact: true }).click();
  await expect(cleanup).toHaveCount(0);
  await expect(page.getByText("Reading deleted permanently.", { exact: true })).toBeVisible();
  expect(await stats(request)).toEqual(before);
});

test("creator deletion confirms its reading count and preserves unrelated and built-in stories", async ({ page, request }) => {
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 60, scriptDelay: 40 } });
  async function illustratedStory(title: string) {
    const created = CreatorSnapshotSchema.parse(await (await request.post("/api/creator/drafts", { data: { operation_id: randomUUID() } })).json());
    const id = created.draft.id;
    const written = CreatorSnapshotSchema.parse(await (await request.post(`/api/creator/drafts/${id}/generate`, { data: { operation_id: randomUUID(), title, prompt: "Ada, a star cartographer, follows an indigo chart home from a quiet observatory before a storm." } })).json());
    const saved = CreatorSnapshotSchema.parse(await (await request.post(`/api/creator/drafts/${id}/save`, { data: { operation_id: randomUUID(), mode: "illustrate", foundation: written.draft.foundation, reference_asset_ids: [] } })).json());
    const responses = await Promise.all(saved.opening!.panels.map(panel => request.post(`/api/creator/drafts/${id}/opening/${saved.opening!.version}/${panel.id}/image`, { data: { operation_id: randomUUID(), retry: false } })));
    expect(responses.every(response => response.ok())).toBe(true);
    return CreatorSnapshotSchema.parse(await (await request.get(`/api/creator/drafts/${id}`)).json());
  }
  const target = await illustratedStory("Ada's story to delete"); const other = await illustratedStory("Ada's story to keep");
  const readings = await Promise.all([0, 1].map(async () => {
    const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "text", template_id: target.latest_template!.id, template_version: target.latest_template!.version } });
    expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json());
  }));
  const builtIn = await createRun(request); const before = await stats(request);
  const preservedPanel = other.opening!.panels[0];
  const preservedUrl = `/api/creator/drafts/${other.draft.id}/opening/${other.opening!.version}/${preservedPanel.id}/asset`;
  const preservedBytes = await (await request.get(preservedUrl)).body();
  await page.goto(`/studio?draft=${target.draft.id}`);
  const card = page.locator(`[data-draft-id='${target.draft.id}']`);
  await card.getByRole("button", { name: /Delete story/ }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this story?", exact: true });
  await expect(dialog).toContainText("2 saved readings");
  await expect(dialog).toContainText("opening illustrations");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await captureDialog(page, "creator-delete-confirmation");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await request.get(`/api/creator/drafts/${target.draft.id}`)).ok()).toBe(true);
  await card.getByRole("button", { name: /Delete story/ }).click();
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(page.locator(`[data-draft-id='${target.draft.id}']`)).toHaveCount(0);
  await expectDeleted(request, `/api/creator/drafts/${target.draft.id}`);
  for (const reading of readings) await expectDeleted(request, `/api/runs/${reading.run.id}`);
  expect((await request.get(`/api/runs/${builtIn.run.id}`)).ok()).toBe(true);
  expect((await request.get(`/api/creator/drafts/${other.draft.id}`)).ok()).toBe(true);
  expect(await (await request.get(preservedUrl)).body()).toEqual(preservedBytes);
  await expectDeleted(request, `/api/creator/drafts/${target.draft.id}/opening/${target.opening!.version}/${target.opening!.panels[0].id}/asset`);
  await page.goto("/");
  await expect(page.locator("#stories [data-story='neon-protocol']")).toBeVisible();
  await expect(page.locator("#stories").getByRole("button", { name: /Delete story/ })).toHaveCount(0);
  expect(await stats(request)).toEqual(before);
});
