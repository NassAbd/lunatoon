import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { CreatorStore } from "../../src/lib/creator/store";
import { StoryFoundationSchema, SnapshotSchema, type Snapshot, type StoryTemplate } from "../../src/lib/story-engine/contracts";
import { NEON_PROTOCOL_TEMPLATE } from "../../src/lib/story-templates/catalog";

type Stats = { foundations: number; scripts: number; images: number; previews: number };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
}
async function createRun(request: APIRequestContext, template: Pick<StoryTemplate, "id" | "version"> = NEON_PROTOCOL_TEMPLATE) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference", template_id: template.id, template_version: template.version } });
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function submit(page: Page, saved: Snapshot) {
  await page.goto(`/run/${saved.run.id}`);
  await page.getByRole("radio", { name: /Destroy the device/ }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await page.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
}
async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function geometry(page: Page) {
  return page.locator(".book-panel .panel-canvas").evaluateAll(panels => ({ scroll: scrollY, panels: panels.map(panel => {
    const bounds = panel.getBoundingClientRect();
    return { top: bounds.top, width: bounds.width, height: bounds.height };
  }) }));
}
async function expectOnlyChapterCalls(request: APIRequestContext, before: Stats, previews = 0) {
  const after = await stats(request);
  expect(after.foundations).toBe(before.foundations);
  expect(after.scripts - before.scripts).toBe(1);
  expect(after.images - before.images).toBe(2);
  expect(after.previews - before.previews).toBe(previews);
}
function isolatedDirectory() {
  const directory = realpathSync(runtime().dataDirectory);
  if (!directory.startsWith(`${realpathSync(os.tmpdir())}${path.sep}`) || !path.basename(directory).startsWith("lunatoon-browser-")) throw new Error("Waiting fixtures require the isolated browser harness directory.");
  return directory;
}
async function creatorFixture(environmentRoles: boolean, color = "#355d6d") {
  // Synthetic local assets exercise pinned Creator ownership without generating
  // a foundation/opening or reading any existing user files.
  const store = new CreatorStore(isolatedDirectory());
  try {
    const draft = store.createDraft({ operation_id: randomUUID() }).draft;
    const references = [];
    for (let index = 0; index < 3; index++) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"><rect width="60" height="90" fill="${color}"/><path d="M0 ${45 + index * 5}L20 35L40 50L60 30V90H0Z" fill="${["#a5c4ab", "#e2c58a", "#ad9dc6"][index]}"/></svg>`;
      const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
      references.push(store.addReference(draft.id, { bytes, mime: "image/png", width: 60, height: 90, purpose: `Synthetic owned reference ${index + 1}` }));
    }
    const opening = store.registerArtwork(draft.id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#dae1da"/></svg>'), mime: "image/svg+xml", width: 600, height: 800, purpose: "Synthetic authored decorative opening" });
    const foundation = StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, NEON_PROTOCOL_TEMPLATE[key as keyof StoryTemplate]])), title: "Owned waiting-artwork fixture", opening_beats: NEON_PROTOCOL_TEMPLATE.opening_beats.map(({ caption, alt }) => ({ caption, alt })) });
    const saved = store.saveTemplate(draft.id, { operation_id: randomUUID(), foundation, reference_asset_ids: references.map(reference => reference.id), ...(environmentRoles ? { visual_references: references.map((reference, index) => ({ asset_id: reference.id, role: index < 2 ? "environment" as const : "protagonist" as const })) } : {}), cover_asset_id: opening.id, opening_asset_ids: foundation.opening_beats.map(() => opening.id) });
    return { template: saved.latest_template!, references };
  } finally { store.close(); }
}

test.beforeEach(async ({ request }) => { await control(request, {}); });
test.afterEach(async ({ request }) => { await control(request, {}); });

test("saved bundled scenery rotates honestly without extra calls, then independent finals preserve the reading position", async ({ page, request }) => {
  await control(request, { scriptDelay: 150, imageDelay: 6000, streamPreviews: false });
  const before = await stats(request), saved = await createRun(request);
  await submit(page, saved);
  const panels = page.locator(".book-panel"), second = panels.nth(1);
  await expect(page.locator(".generated-image, .preview-image")).toHaveCount(0);
  await expect(panels.first().locator(".waiting-artwork img")).toHaveCount(2);
  await expect(second.locator(".waiting-artwork img.is-current")).toHaveAttribute("src", `/api/runs/${saved.run.id}/assets/city`);
  await expect(second.getByText("Saved scenery · atmosphere while you wait", { exact: true })).toBeVisible();
  await expect(second.locator(".waiting-artwork")).toHaveAttribute("aria-hidden", "true");
  await expect(second.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  mkdirSync("test-results-live/poc-08-4/screenshots", { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await second.locator(".waiting-artwork img").evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    await second.locator(".panel-canvas").evaluate(panel => window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - 32, behavior: "instant" }));
    await twoFrames(page);
    await page.screenshot({ path: `test-results-live/poc-08-4/screenshots/mocked-waiting-artwork-${width}.png`, animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await second.locator(".panel-canvas").evaluate(panel => window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - 80, behavior: "instant" }));
  await page.evaluate(() => Object.assign(window, { waitingReader: document.querySelector(".saved-reader"), waitingPanels: [...document.querySelectorAll(".book-panel .panel-canvas")] }));
  await twoFrames(page); const waiting = await geometry(page);
  await expect(panels.first().locator(".generated-image.is-ready")).toHaveCount(1, { timeout: 10_000 });
  await expect(second.locator(".generated-image")).toHaveCount(0);
  expect(await geometry(page)).toEqual(waiting);
  await expect(second.locator(".waiting-artwork img.is-current")).toHaveAttribute("src", `/api/runs/${saved.run.id}/assets/watchers`, { timeout: 10_000 });
  await expect(second.locator(".waiting-artwork img.is-current")).toHaveCSS("transition-duration", "1.4s");
  await expect(second.locator(".generated-image.is-ready")).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  await expect(page.locator(".waiting-artwork")).toHaveCount(0);
  const final = await geometry(page);
  expect(Math.abs(final.panels[1].top - waiting.panels[1].top)).toBeLessThanOrEqual(2);
  expect(final.panels.map(({ width, height }) => ({ width, height }))).toEqual(waiting.panels.map(({ width, height }) => ({ width, height })));
  expect(await page.evaluate(() => { const memory = window as Window & { waitingReader?: Element; waitingPanels?: Element[] }; return memory.waitingReader === document.querySelector(".saved-reader") && memory.waitingPanels?.every((panel, index) => panel === document.querySelectorAll(".book-panel .panel-canvas")[index]); })).toBe(true);
  await expectOnlyChapterCalls(request, before);
});

test("only saved environment-role references appear and another Creator story's artwork is inaccessible to this run", async ({ page, request }) => {
  const own = await creatorFixture(true), foreign = await creatorFixture(true, "#8d4357");
  await control(request, { scriptDelay: 150, imageDelay: 1500, streamPreviews: false });
  const before = await stats(request), saved = await createRun(request, own.template);
  expect(saved.bible.template?.visual_references).toEqual(own.template.visual_references);
  const foreignAsset = foreign.references[0].id;
  expect(saved.bible.assets.some(asset => asset.id === foreignAsset)).toBe(false);
  const crossStory = await request.get(`/api/runs/${saved.run.id}/assets/${foreignAsset}`);
  expect(crossStory.status()).toBe(404);
  const requested: string[] = []; page.on("request", req => { if (req.url().includes("/assets/")) requested.push(new URL(req.url()).pathname); });
  await submit(page, saved);
  const expected = own.references.slice(0, 2).map(reference => `/api/runs/${saved.run.id}/assets/${reference.id}`);
  for (const panel of await page.locator(".book-panel").all()) {
    await expect(panel.locator(".waiting-artwork img")).toHaveCount(2);
    expect(await panel.locator(".waiting-artwork img").evaluateAll(images => images.map(image => image.getAttribute("src")))).toEqual(expected);
  }
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  expect(requested.some(url => url.includes(foreignAsset))).toBe(false);
  expect(requested.some(url => url.includes(own.references[2].id))).toBe(false);
  for (const src of expected) expect(requested).toContain(src);
  await expectOnlyChapterCalls(request, before);
});

test("unspecified Creator references keep the honest placeholder instead of guessing which image is scenery", async ({ page, request }) => {
  const fixture = await creatorFixture(false);
  await control(request, { scriptDelay: 150, imageDelay: 1200, streamPreviews: false });
  const before = await stats(request), saved = await createRun(request, fixture.template);
  await submit(page, saved);
  await expect(page.locator(".waiting-artwork, .preview-image")).toHaveCount(0);
  await expect(page.locator(".book-panel").first().getByText("Illustrating this moment…", { exact: true })).toBeVisible();
  await expect(page.locator(".book-panel").first().locator(".generation-composition")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expectOnlyChapterCalls(request, before);
});

test("genuine provider previews replace atmospheric artwork until each final illustration is ready", async ({ page, request }) => {
  await control(request, { scriptDelay: 150, imageDelay: 1800, streamPreviews: true, reverseImages: true });
  const before = await stats(request), saved = await createRun(request);
  await submit(page, saved);
  await expect(page.locator(".preview-image.is-ready")).toHaveCount(2);
  await expect(page.locator(".waiting-artwork")).toHaveCount(0);
  await expect(page.getByText("Preview · still illustrating", { exact: true })).toHaveCount(2);
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".book-panel").nth(1).locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-panel").first().locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".preview-image, .waiting-artwork")).toHaveCount(0);
  await expectOnlyChapterCalls(request, before, 2);
});

test("reduced motion disables scenery rotation and crossfade without blocking final-image reveal", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await control(request, { scriptDelay: 150, imageDelay: 1800, streamPreviews: false });
  const before = await stats(request), saved = await createRun(request);
  await submit(page, saved);
  const atmosphere = page.locator(".book-panel").nth(1).locator(".waiting-artwork");
  await expect(atmosphere.locator("img.is-current")).toHaveAttribute("src", `/api/runs/${saved.run.id}/assets/city`);
  await expect(atmosphere.locator("img.is-current")).toHaveCSS("transition-duration", "0s");
  await page.clock.fastForward(16_100);
  await expect(atmosphere.locator("img.is-current")).toHaveAttribute("src", `/api/runs/${saved.run.id}/assets/city`);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".waiting-artwork")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  expect(await page.locator(".generated-image").first().evaluate(image => parseFloat(getComputedStyle(image).animationDuration))).toBeLessThan(0.001);
  await expectOnlyChapterCalls(request, before);
});
