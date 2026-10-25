import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { CreatorSnapshotSchema, type CreatorSnapshot } from "../../src/lib/creator/contracts";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; scripts: number; images: number; openingImages: number; previews: number };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function isolatedDirectory() {
  const directory = realpathSync(runtime().dataDirectory);
  if (!directory.startsWith(`${realpathSync(os.tmpdir())}${path.sep}`) || !path.basename(directory).startsWith("lunatoon-browser-")) throw new Error("Creator waiting fixtures require the isolated browser harness directory.");
  return directory;
}
async function control(request: APIRequestContext, data: Record<string, boolean | number>) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
}
async function readDraft(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/creator/drafts/${id}`); expect(response.ok()).toBe(true);
  return CreatorSnapshotSchema.parse(await response.json());
}
async function upload(request: APIRequestContext, draftId: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"><rect width="60" height="90" fill="${color}"/><path d="M0 55L24 30L44 52L60 40V90H0Z" fill="#b0c6ba"/></svg>`;
  const response = await request.post(`/api/creator/drafts/${draftId}/references`, { multipart: { file: { name: "authored-setting.png", mimeType: "image/png", buffer: await sharp(Buffer.from(svg)).png().toBuffer() } } });
  expect(response.ok()).toBe(true); return CreatorSnapshotSchema.parse(await response.json());
}
async function generatedOpening(request: APIRequestContext, setting: boolean) {
  isolatedDirectory();
  await control(request, { foundationOpeningCount: 3, foundationDelay: 20, imageDelay: 60 });
  const before = await stats(request);
  const created = await request.post("/api/creator/drafts", { data: { operation_id: randomUUID() } }); expect(created.ok()).toBe(true);
  const id = CreatorSnapshotSchema.parse(await created.json()).draft.id;
  const generated = await request.post(`/api/creator/drafts/${id}/generate`, { data: { operation_id: randomUUID(), prompt: "Ada maps the stars from her quiet observatory and searches for a safe route home before a storm." } }); expect(generated.ok()).toBe(true);
  const referenced = await upload(request, id, "#465c76");
  const assetId = referenced.draft.reference_asset_ids[0];
  const prepared = await request.post(`/api/creator/drafts/${id}/save`, { data: { operation_id: randomUUID(), mode: "illustrate", foundation: referenced.draft.foundation, reference_asset_ids: [assetId], ...(setting ? { visual_references: [{ asset_id: assetId, role: "environment" }] } : {}) } });
  expect(prepared.ok()).toBe(true); const pending = CreatorSnapshotSchema.parse(await prepared.json());
  expect(pending.opening?.panels).toHaveLength(3);
  // Exercise the real local opening routes and mocked SDK, not handcrafted
  // template metadata. The mock returns one shared JPEG; asset IDs may dedupe.
  const completed = await Promise.all(pending.opening!.panels.map(panel => request.post(`/api/creator/drafts/${id}/opening/${pending.latest_template!.version}/${panel.id}/image`, { data: { operation_id: randomUUID(), retry: false } })));
  for (const response of completed) expect(response.ok()).toBe(true);
  const saved = await readDraft(request, id);
  expect(saved.opening?.panels.map(panel => panel.status)).toEqual(["complete", "complete", "complete"]);
  expect(saved.latest_template?.status).toBe("ready");
  expect(saved.opening!.panels[0].shot_direction).toMatch(/^Wide establishing composition\./);
  expect(saved.opening!.panels[1].shot_direction).toMatch(/^Medium character-focused/);
  expect(saved.opening!.panels[2].shot_direction).toMatch(/^Close detail/);
  const after = await stats(request);
  expect(after.foundations - before.foundations).toBe(1);
  expect(after.images - before.images).toBe(3);
  expect(after.openingImages - before.openingImages).toBe(3);
  expect(after.scripts).toBe(before.scripts);
  return saved;
}
async function createRun(request: APIRequestContext, creator: CreatorSnapshot) {
  const template = creator.latest_template!;
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference", template_id: template.id, template_version: template.version } }); expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function submit(page: Page, saved: Snapshot) {
  await page.goto(`/run/${saved.run.id}`);
  const decision = page.locator(".book-decision[data-step='1']");
  await decision.locator("input[value='trace_crease']").check();
  await decision.getByLabel("Add a little of your imagination").fill("The observatory bell rings once.");
  await decision.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
}
function immutableFingerprint(saved: Snapshot, creator: CreatorSnapshot) {
  const directory = isolatedDirectory();
  const db = new DatabaseSync(path.join(directory, "creator.sqlite"), { readOnly: true });
  let records: unknown[];
  try {
    records = [db.prepare("SELECT document FROM creator_templates WHERE id=? AND version=?").get(creator.latest_template!.id, creator.latest_template!.version), db.prepare("SELECT document FROM creator_openings WHERE template_id=? AND version=?").get(creator.latest_template!.id, creator.latest_template!.version), db.prepare("SELECT document FROM creator_assets WHERE draft_id=? ORDER BY id").all(creator.draft.id)];
  } finally { db.close(); }
  const reader = new DatabaseSync(path.join(directory, "stories.sqlite"), { readOnly: true });
  try { records.push(reader.prepare("SELECT document FROM stories WHERE id=?").get(saved.bible.id)); } finally { reader.close(); }
  return hash(JSON.stringify(records));
}
async function expectOnlyChapterCalls(request: APIRequestContext, before: Stats) {
  const after = await stats(request);
  expect(after.foundations).toBe(before.foundations); expect(after.openingImages).toBe(before.openingImages);
  expect(after.scripts - before.scripts).toBe(1); expect(after.images - before.images).toBe(2); expect(after.previews).toBe(before.previews);
}
async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.afterEach(async ({ request }) => { await control(request, {}); });

test("legacy completed opening metadata supplies one owned establishing image without changing its frozen story", async ({ page, request }) => {
  const creator = await generatedOpening(request, false), saved = await createRun(request, creator);
  expect(creator.latest_template?.visual_references).toBeUndefined();
  const frozen = immutableFingerprint(saved, creator), before = await stats(request);
  const firstOpening = creator.opening!.panels[0].asset_id!;
  await control(request, { scriptDelay: 120, imageDelay: 6000, streamPreviews: false });
  await submit(page, saved);
  const panels = page.locator(".book-panel"), second = panels.nth(1);
  for (const panel of await panels.all()) {
    await expect(panel.locator(".waiting-artwork img")).toHaveCount(1);
    await expect(panel.locator(".waiting-artwork img")).toHaveAttribute("src", `/api/runs/${saved.run.id}/assets/${firstOpening}`);
  }
  await expect(page.locator(".generated-image, .preview-image")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  mkdirSync("test-results-live/poc-08-5/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
    await second.locator(".waiting-artwork img").evaluate(image => (image as HTMLImageElement).decode());
    await second.locator(".panel-canvas").evaluate(panel => { const header = document.querySelector(".book-header")!.getBoundingClientRect(); window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - Math.max(92, header.height + 16), behavior: "instant" }); });
    await twoFrames(page);
    const header = await page.locator(".book-header").boundingBox(), bubble = await second.locator(".speech-bubble").boundingBox();
    expect(header && bubble && bubble.y >= header.y + header.height).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results-live/poc-08-5/screenshots/legacy-creator-waiting-${width}.png`, animations: "disabled" });
  }
  await expect(panels.first().locator(".generated-image.is-ready")).toHaveCount(1, { timeout: 10_000 });
  await expect(second.locator(".generated-image")).toHaveCount(0);
  await expect(second.locator(".waiting-artwork img")).toHaveCount(1);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".waiting-artwork")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  expect(immutableFingerprint(saved, creator)).toBe(frozen);
  const complete = SnapshotSchema.parse(await (await request.get(`/api/runs/${saved.run.id}`)).json());
  expect(complete.bible).toEqual(saved.bible);
  await expectOnlyChapterCalls(request, before);
  const completedStats = await stats(request);
  await page.reload(); await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  expect(await stats(request)).toEqual(completedStats);
  expect(immutableFingerprint(saved, creator)).toBe(frozen);
});

test("a newly saved Setting reference complements its opening and cannot reveal another Creator's reference", async ({ page, request }) => {
  const creator = await generatedOpening(request, true), saved = await createRun(request, creator);
  const foreignResponse = await request.post("/api/creator/drafts", { data: { operation_id: randomUUID() } }); expect(foreignResponse.ok()).toBe(true);
  const foreignId = CreatorSnapshotSchema.parse(await foreignResponse.json()).draft.id;
  const foreign = await upload(request, foreignId, "#8d4357"), foreignAsset = foreign.draft.reference_asset_ids[0];
  expect((await request.get(`/api/runs/${saved.run.id}/assets/${foreignAsset}`)).status()).toBe(404);
  const before = await stats(request), frozen = immutableFingerprint(saved, creator);
  await control(request, { scriptDelay: 120, imageDelay: 1800 });
  const requests: string[] = []; page.on("request", req => { if (req.url().includes("/assets/")) requests.push(new URL(req.url()).pathname); });
  await submit(page, saved);
  const expected = [creator.draft.reference_asset_ids[0], creator.opening!.panels[0].asset_id!].map(id => `/api/runs/${saved.run.id}/assets/${id}`);
  for (const panel of await page.locator(".book-panel").all()) {
    await expect(panel.locator(".waiting-artwork img")).toHaveCount(2);
    expect(await panel.locator(".waiting-artwork img").evaluateAll(images => images.map(image => image.getAttribute("src")))).toEqual(expected);
  }
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  expect(requests.some(url => url.includes(foreignAsset))).toBe(false);
  for (const url of expected) expect(requests).toContain(url);
  expect(immutableFingerprint(saved, creator)).toBe(frozen);
  await expectOnlyChapterCalls(request, before);
});

for (const missing of [false, true]) {
  test(`${missing ? "missing" : "unrecognized"} legacy scene metadata preserves the decorative fallback`, async ({ page, request }) => {
    const creator = await generatedOpening(request, false);
    const db = new DatabaseSync(path.join(isolatedDirectory(), "creator.sqlite"));
    try {
      if (missing) db.prepare("DELETE FROM creator_openings WHERE template_id=? AND version=?").run(creator.latest_template!.id, creator.latest_template!.version);
      else {
        const row = db.prepare("SELECT document FROM creator_openings WHERE template_id=? AND version=?").get(creator.latest_template!.id, creator.latest_template!.version)!;
        const value = JSON.parse(String(row.document)) as { panels: { shot_direction: string }[] };
        // Keyword-rich free text is not the exact server-authored classification.
        value.panels[0].shot_direction = "Wide establishing environment scenery, unverified custom direction.";
        db.prepare("UPDATE creator_openings SET document=? WHERE template_id=? AND version=?").run(JSON.stringify(value), creator.latest_template!.id, creator.latest_template!.version);
      }
    } finally { db.close(); }
    const saved = await createRun(request, creator), before = await stats(request), frozen = immutableFingerprint(saved, creator);
    await control(request, { scriptDelay: 120, imageDelay: 1500 });
    await submit(page, saved);
    await expect(page.locator(".waiting-artwork, .preview-image")).toHaveCount(0);
    await expect(page.locator(".book-panel").first().getByText("Illustrating this moment…", { exact: true })).toBeVisible();
    await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
    expect(immutableFingerprint(saved, creator)).toBe(frozen);
    await expectOnlyChapterCalls(request, before);
  });
}

test("an unavailable selected scenery GET falls back locally while dialogue and isolated final images remain usable", async ({ page, request }) => {
  const creator = await generatedOpening(request, false), saved = await createRun(request, creator), before = await stats(request), frozen = immutableFingerprint(saved, creator);
  const openingId = creator.opening!.panels[0].asset_id!, missingPath = `/api/runs/${saved.run.id}/assets/${openingId}`;
  const owned = saved.bible.assets.find(asset => asset.id === openingId)!;
  const bytesHash = hash(readFileSync(path.join(isolatedDirectory(), owned.path)));
  let missingGets = 0;
  await page.route(url => url.pathname === missingPath, async route => { missingGets++; await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "asset_not_found" } }) }); });
  await control(request, { scriptDelay: 120, imageDelay: 1800 });
  await submit(page, saved);
  await expect.poll(() => missingGets).toBeGreaterThan(0);
  await expect(page.locator(".book-panel .waiting-artwork")).toHaveCount(0);
  await expect(page.locator(".book-panel").first().getByText("Illustrating this moment…", { exact: true })).toBeVisible();
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  await expect(page.locator(".book-panel").first().locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-panel").nth(1).locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  expect(hash(readFileSync(path.join(isolatedDirectory(), owned.path)))).toBe(bytesHash);
  expect(immutableFingerprint(saved, creator)).toBe(frozen);
  await expectOnlyChapterCalls(request, before);
});
