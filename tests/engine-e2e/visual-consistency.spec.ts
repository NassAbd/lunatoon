import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { CreatorSnapshotSchema } from "../../src/lib/creator/contracts";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; scripts: number; images: number; imageReferences: { hashes: string[] }[]; imagePrompts: string[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function readDraft(request: APIRequestContext, id: string) { const response = await request.get(`/api/creator/drafts/${id}`); expect(response.ok()).toBe(true); return CreatorSnapshotSchema.parse(await response.json()); }
async function readRun(request: APIRequestContext, id: string) { const response = await request.get(`/api/runs/${id}`); expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json()); }
async function createWithReferences(page: Page, request: APIRequestContext, count: number) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data: { kaiFoundation: true, scriptDelay: 150, imageDelay: 450, reverseImages: true } })).ok()).toBe(true);
  await page.goto("/studio");
  await page.getByLabel("Describe your story", { exact: true }).fill("Kai Fox is a 15-year-old African-American boy with dark skin, a ponytail, a red jacket and the SpeedCore wrist device. He will stop NEXUS.");
  await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it your own", exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("draft")!;
  const files = await Promise.all(Array.from({ length: count }, async (_, index) => ({ name: `owned-color-reference-${index + 1}.png`, mimeType: "image/png", buffer: await sharp({ create: { width: 32, height: 48, channels: 3, background: ["#365576", "#6d8d43", "#b8473b"][index] } }).png().toBuffer() })));
  await page.getByLabel("Add reference images", { exact: true }).setInputFiles(files);
  await expect(page.locator("[data-reference-id]")).toHaveCount(count);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  return { id, draft: await readDraft(request, id) };
}
async function firstDecision(page: Page) {
  const first = page.locator(".book-decision[data-step='1']");
  await first.locator("input[value='stop_nexus']").check();
  await first.getByLabel("Add a little of your imagination").fill("He'll use his speed to introduce into Nexus's HQ.");
  await first.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
  await expect(page.locator(".book-panel .generated-image")).toHaveCount(0);
  await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(2);
}
async function secondDecision(page: Page) {
  const second = page.locator(".book-decision[data-step='2']");
  await second.locator("input[value='disable_relay']").check();
  await second.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toHaveAttribute("data-artwork", "complete");
}
test.afterEach(async ({ request }) => { expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true); });

for (const count of [1, 2, 3]) {
  test(`${count} references keep the explicitly selected protagonist first across opening and both decisions`, async ({ page, request }) => {
    const before = await stats(request);
    const { id, draft } = await createWithReferences(page, request, count);
    const refs = draft.draft.reference_asset_ids;
    for (let index = 0; index < count; index++) await expect(page.getByLabel(`Use Reference ${index + 1} for`, { exact: true })).toHaveValue("unspecified");
    await expect(page.getByText(/No main-character reference selected/)).toBeVisible();
    // Deliberately select the last upload: the first upload is never presumed to be a face.
    if (count > 1) await page.getByLabel("Use Reference 1 for", { exact: true }).selectOption("environment");
    if (count > 2) await page.getByLabel("Use Reference 2 for", { exact: true }).selectOption("style");
    await page.getByLabel(`Use Reference ${count} for`, { exact: true }).selectOption("protagonist");
    expect((await stats(request)).images).toBe(before.images);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(`Use Reference ${count} for`, { exact: true })).toHaveValue("protagonist");
    if (count === 3) {
      mkdirSync("test-results-live/poc-08-3/screenshots", { recursive: true });
      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.waitForLoadState("networkidle");
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
        await page.locator(".studio-references").evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 32, behavior: "instant" }));
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results-live/poc-08-3/screenshots/reference-purposes-${width}.png`, animations: "disabled" });
      }
    }
    await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play your story", exact: true })).toBeEnabled();
    const illustrated = await readDraft(request, id);
    expect(illustrated.latest_template?.visual_references?.filter(reference => reference.role === "protagonist")).toEqual([{ asset_id: refs[count - 1], role: "protagonist" }]);
    const hashes = refs.map(assetId => illustrated.assets.find(asset => asset.id === assetId)!.sha256);
    const expectedHashes = [hashes[count - 1], ...hashes.slice(0, count - 1)];
    await page.getByRole("button", { name: "Play your story", exact: true }).click();
    await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
    const url = page.url(), runId = url.split("/").at(-1)!;
    const initial = await readRun(request, runId);
    expect(initial.bible.template?.visual_references).toEqual(illustrated.latest_template?.visual_references);
    await firstDecision(page);
    if (count > 1) {
      // A later mutable draft selection must not alter this already-pinned run.
      await page.goto(`/studio?draft=${id}`);
      await page.getByLabel("Use Reference 1 for", { exact: true }).selectOption("protagonist");
      await expect(page.getByLabel(`Use Reference ${count} for`, { exact: true })).toHaveValue("unspecified");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
      expect((await readRun(request, runId)).bible).toEqual(initial.bible);
      await page.goto(url);
    }
    await secondDecision(page);
    const completed = await readRun(request, runId), generated = await stats(request);
    expect(completed.run.status).toBe("ended");
    expect(completed.run.state.objects[0].holder).toBeNull();
    expect(completed.run.state.characters[0].carried_objects).toEqual([]);
    expect(generated.images - before.images).toBe(7);
    expect(generated.scripts - before.scripts).toBe(2);
    for (const record of generated.imageReferences.slice(before.imageReferences.length)) expect(record.hashes).toEqual(expectedHashes);
    for (const prompt of generated.imagePrompts.slice(before.imagePrompts.length)) {
      expect(prompt).toMatch(/dark skin/i); expect(prompt).toMatch(/15-year-old/i); expect(prompt).toMatch(/ponytail/i); expect(prompt).toMatch(/red jacket/i);
      expect(prompt).not.toMatch(/Kael|Mara|Ivo|Ada|star_chart|tide_lantern/);
    }
    await page.reload(); await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(4);
    expect(await stats(request)).toEqual(generated);
    expect((await readRun(request, runId)).bible).toEqual(initial.bible);
  });
}

test("unspecified references remain a conservative fallback and removing a main-character upload clears only the draft", async ({ page, request }) => {
  const before = await stats(request), { id, draft } = await createWithReferences(page, request, 2);
  await expect(page.getByText(/No main-character reference selected/)).toBeVisible();
  await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play your story", exact: true })).toBeEnabled();
  const saved = await readDraft(request, id);
  expect(saved.latest_template?.visual_references?.some(reference => reference.role === "protagonist")).toBe(false);
  const hashes = draft.draft.reference_asset_ids.map(assetId => saved.assets.find(asset => asset.id === assetId)!.sha256);
  await page.getByRole("button", { name: "Play your story", exact: true }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  const url = page.url(), runId = url.split("/").at(-1)!;
  const initial = await readRun(request, runId);
  await firstDecision(page); await secondDecision(page);
  const finished = await stats(request);
  for (const record of finished.imageReferences.slice(before.imageReferences.length)) expect(record.hashes).toEqual(hashes);
  expect(finished.images - before.images).toBe(7);
  await page.goto(`/studio?draft=${id}`);
  await page.getByLabel("Use Reference 2 for", { exact: true }).selectOption("protagonist");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await page.getByRole("button", { name: "Remove reference 2", exact: true }).click();
  await expect(page.locator("[data-reference-id]")).toHaveCount(1);
  await expect(page.getByText(/No main-character reference selected/)).toBeVisible();
  await expect(page.getByLabel("Use Reference 1 for", { exact: true })).toHaveValue("unspecified");
  await page.reload(); await expect(page.getByText(/No main-character reference selected/)).toBeVisible();
  expect((await readRun(request, runId)).bible).toEqual(initial.bible);
  expect(await stats(request)).toEqual(finished);
});
