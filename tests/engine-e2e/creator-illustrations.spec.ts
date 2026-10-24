import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import { CreatorSnapshotSchema } from "../../src/lib/creator/contracts";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; scripts: number; images: number; openingImages: number; openingCompleted: number[]; openingPeak: number; previews: number; imageReferences: { hashes: string[] }[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) { expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true); }
async function draft(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/creator/drafts/${id}`); expect(response.ok()).toBe(true); return CreatorSnapshotSchema.parse(await response.json());
}
function image(index: number) {
  const chunk = (name: string, bytes: Buffer) => { const body = Buffer.concat([Buffer.from(name), bytes]); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); const check = Buffer.alloc(4); check.writeUInt32BE(crc32(body)); return Buffer.concat([size, body, check]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.from([0, 40 + index * 40, 80, 150, 255, 40, 80, 150, 255, 0, 40, 80, 150, 255, 40, 80, 150, 255]);
  return { name: `original-color-${index}.png`, mimeType: "image/png", buffer: Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]) };
}
async function foundation(page: Page, references: number) {
  await page.goto("/studio");
  await page.getByLabel("Describe your story", { exact: true }).fill("Ada, a star cartographer in a quiet observatory, follows her indigo chart to find a safe route home before a storm.");
  await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it your own", exact: true })).toBeVisible();
  if (references) {
    await page.getByLabel("Add reference images", { exact: true }).setInputFiles(Array.from({ length: references }, (_, index) => image(index)));
    await expect(page.locator("[data-reference-id]")).toHaveCount(references);
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  }
  return new URL(page.url()).searchParams.get("draft")!;
}
async function expectArtworkCoversPlaceholder(page: Page) {
  for (const image of await page.locator(".studio-opening-scene .generated-image.is-ready").all()) {
    await expect(image).toHaveCSS("opacity", "1");
    await image.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await image.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      // Check both loading-copy and floor-gradient areas after the reveal is opaque.
      return [0.5, 0.85].every(fraction => document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height * fraction) === element);
    })).toBe(true);
  }
}
async function screenshot(page: Page, name: string, selector: string) {
  mkdirSync("test-results-live/poc-08-1/screenshots", { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).filter(image => image.complete && image.naturalWidth).map(image => image.decode())); });
    await page.locator(".studio-opening-scene .generated-image").evaluateAll(async images => {
      await Promise.all(images.map(async element => { await (element as HTMLImageElement).decode(); await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))); }));
    });
    for (const image of await page.locator(".studio-opening-scene .generated-image").all()) await expect(image).toHaveCSS("opacity", "1");
    await expectArtworkCoversPlaceholder(page);
    await page.locator(selector).evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 28, behavior: "instant" }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results-live/poc-08-1/screenshots/${name}-${width}.png`, animations: "disabled" });
  }
}
test.afterEach(async ({ request }) => { await control(request, {}); });

for (const references of [0, 1, 3]) {
  test(`an explicit Save & Illustrate independently saves ${references === 3 ? 4 : 3} opening scenes with ${references} references and reuses them across readings`, async ({ page, request, browser }) => {
    const count = references === 3 ? 4 : 3;
    await control(request, { foundationOpeningCount: count, imageDelay: 450, reverseImages: true, streamPreviews: references > 0 });
    const before = await stats(request); const id = await foundation(page, references);
    await page.getByLabel("Story title", { exact: true }).fill(`Ada's Illustrated Opening ${references}`);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
    expect((await draft(request, id)).latest_template).toBeNull();
    expect((await stats(request)).images).toBe(before.images);
    await page.reload();
    await expect(page.getByLabel("Story title", { exact: true })).toHaveValue(`Ada's Illustrated Opening ${references}`);
    await expect(page.getByRole("button", { name: "Play your story", exact: true })).toHaveCount(0);
    expect((await stats(request)).images).toBe(before.images);
    await expect(page.locator(".studio-save")).toContainText(/API charges|may incur/i);
    await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
    const scenes = page.locator(".studio-opening-scene");
    await expect(scenes).toHaveCount(count);
    await expect(page.locator(".studio-opening")).toContainText("Opening illustrations generating");
    const bounds = await scenes.locator(".studio-opening-art").evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
    if (references) await expect(scenes.locator(".preview-image")).not.toHaveCount(0);
    await expect(scenes.nth(count - 1).locator(".generated-image.is-ready")).toHaveCount(1);
    await expect(scenes.first().locator(".generated-image")).toHaveCount(0);
    await expect(scenes.locator(".generated-image.is-ready")).toHaveCount(count);
    await expect(page.getByRole("button", { name: "Play your story", exact: true })).toBeEnabled();
    expect(await scenes.locator(".studio-opening-art").evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })))).toEqual(bounds);
    await expectArtworkCoversPlaceholder(page);
    const saved = await draft(request, id);
    expect(saved.opening?.status).toBe("ready"); expect(saved.latest_template?.status).toBe("ready");
    expect(saved.opening?.panels).toHaveLength(count);
    const illustrated = await stats(request);
    expect(illustrated.foundations - before.foundations).toBe(1);
    expect(illustrated.images - before.images).toBe(count);
    expect(illustrated.openingImages - before.openingImages).toBe(count);
    expect(illustrated.openingPeak).toBeGreaterThanOrEqual(count);
    expect(illustrated.openingCompleted.slice(before.openingCompleted.length)).toEqual(Array.from({ length: count }, (_, index) => count - index));
    for (const record of illustrated.imageReferences.slice(before.imageReferences.length)) expect(record.hashes).toHaveLength(references);
    if (references === 3) {
      await screenshot(page, "opening-illustrated-mock", ".studio-opening");
      await screenshot(page, "opening-ready-actions-mock", ".studio-opening .studio-ready");
    }
    await page.reload();
    await expect(page.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(count);
    await expectArtworkCoversPlaceholder(page);
    expect(await stats(request)).toEqual(illustrated);
    await page.getByRole("button", { name: "Play your story", exact: true }).click();
    await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
    const firstId = page.url().split("/").at(-1)!;
    const first = SnapshotSchema.parse(await (await request.get(`/api/runs/${firstId}`)).json());
    expect(first.bible.template).toEqual(saved.latest_template);
    await expect(page.locator(".opening-beat img")).toHaveCount(count);
    const secondResponse = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: references ? "reference" : "text", template_id: saved.latest_template!.id, template_version: saved.latest_template!.version } });
    expect(secondResponse.ok()).toBe(true); const second = SnapshotSchema.parse(await secondResponse.json());
    expect(second.bible.template).toEqual(first.bible.template);
    expect(second.bible.assets).toEqual(first.bible.assets);
    expect(await stats(request)).toEqual(illustrated);
    // Completed artwork and unchanged counters are proven above. Release the
    // finished visit's socket pool before gracefully restarting the owned child.
    const studioUrl = new URL(`/studio?draft=${id}`, page.url()).href;
    await page.waitForLoadState("networkidle"); await page.context().close();
    expect((await request.post(`${runtime().mockURL}/__restart`, { timeout: 20000 })).ok()).toBe(true);
    const restored = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    try {
      await restored.goto(studioUrl);
      await expect(restored.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(count);
      expect(await stats(request)).toEqual(illustrated);
    } finally { await restored.close(); }
  });
}

test("a failed opening keeps successful siblings and requires one explicit acknowledged retry", async ({ page, request }) => {
  await control(request, { foundationOpeningCount: 3, imageDelay: 250, failOpeningSequence: 2, streamPreviews: true });
  const before = await stats(request); const id = await foundation(page, 1);
  await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
  await expect(page.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(2);
  const failed = page.locator(".studio-opening-scene[data-status='failed']");
  await expect(failed).toHaveCount(1);
  await expect(page.locator(".studio-opening")).toContainText("Opening partially illustrated");
  await expect(page.getByRole("button", { name: "Play your story", exact: true })).toHaveCount(0);
  const saved = await draft(request, id); const successful = saved.opening!.panels.filter(panel => panel.status === "complete").map(panel => ({ id: panel.id, asset_id: panel.asset_id }));
  const afterFailure = await stats(request); expect(afterFailure.images - before.images).toBe(3);
  await page.reload(); await expect(failed).toHaveCount(1);
  expect(await stats(request)).toEqual(afterFailure);
  await screenshot(page, "opening-partial-failure-mock", ".studio-opening");
  await control(request, { foundationOpeningCount: 3, imageDelay: 100 });
  await expect(failed.getByRole("button", { name: "Retry illustration", exact: true })).toBeDisabled();
  await failed.getByRole("checkbox", { name: /previous illustration may have been charged/i }).check();
  await failed.getByRole("button", { name: "Retry illustration", exact: true }).click();
  await expect(page.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(3);
  const finished = await draft(request, id);
  expect(finished.opening!.panels.filter(panel => successful.some(item => item.id === panel.id)).map(panel => ({ id: panel.id, asset_id: panel.asset_id }))).toEqual(successful);
  expect((await stats(request)).images - afterFailure.images).toBe(1);
  expect((await stats(request)).foundations).toBe(afterFailure.foundations);
});

test("refresh and an application restart during opening generation never repeat uncertain paid work", async ({ page, request }) => {
  await control(request, { foundationOpeningCount: 3, imageDelay: 5000, streamPreviews: true });
  const before = await stats(request); const id = await foundation(page, 1);
  await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
  await expect.poll(async () => (await stats(request)).openingImages - before.openingImages).toBe(3);
  await expect(page.locator(".studio-opening-scene .preview-image")).not.toHaveCount(0);
  const started = await draft(request, id);
  expect(started.opening!.attempts).toHaveLength(3);
  await page.reload();
  expect((await stats(request)).openingImages - before.openingImages).toBe(3);
  // Only this harness-owned child and isolated SQLite are interrupted/modified.
  expect((await request.post(`${runtime().mockURL}/__interrupt_restart`, { timeout: 20000 })).ok()).toBe(true);
  const directory = path.resolve(runtime().dataDirectory);
  expect(directory.startsWith(path.resolve(os.tmpdir()) + path.sep)).toBe(true);
  expect(path.basename(directory)).toMatch(/^lunatoon-browser-/);
  const db = new DatabaseSync(path.join(directory, "creator.sqlite"));
  try { db.prepare("UPDATE creator_opening_attempts SET document=json_set(document,'$.lease_until',0) WHERE draft_id=? AND json_extract(document,'$.status')='running'").run(id); }
  finally { db.close(); }
  const interrupted = await draft(request, id);
  expect(interrupted.opening!.panels.every(panel => ["failed", "interrupted"].includes(panel.status))).toBe(true);
  await page.goto(`/studio?draft=${id}`);
  await expect(page.locator(".studio-opening-scene .generated-image")).toHaveCount(0);
  await expect(page.locator(".studio-opening-scene").getByRole("button", { name: "Retry illustration", exact: true })).toHaveCount(3);
  expect((await stats(request)).openingImages - before.openingImages).toBe(3);
  await page.reload();
  expect((await stats(request)).openingImages - before.openingImages).toBe(3);
  await control(request, { foundationOpeningCount: 3, imageDelay: 80 });
  const first = page.locator(".studio-opening-scene").first();
  await first.getByRole("checkbox", { name: /previous illustration may have been charged/i }).check();
  await first.getByRole("button", { name: "Retry illustration", exact: true }).click();
  await expect(first.locator(".generated-image.is-ready")).toHaveCount(1);
  expect((await stats(request)).openingImages - before.openingImages).toBe(4);
  const recovered = await draft(request, id);
  expect(recovered.opening!.panels.filter(panel => panel.status === "complete")).toHaveLength(1);
  expect(recovered.opening!.summary.unknown_cost_attempts).toBeGreaterThanOrEqual(3);
  expect(recovered.opening!.attempts).toHaveLength(4);
});

test("opening claims are idempotent, unfinished scenes require an explicit action, and new visual context never overwrites a saved run", async ({ page, request }) => {
  await control(request, { foundationOpeningCount: 3, imageDelay: 180 });
  const id = await foundation(page, 0); const generated = await draft(request, id); const before = await stats(request);
  const saveBody = { operation_id: randomUUID(), mode: "illustrate", foundation: generated.draft.foundation, reference_asset_ids: [] };
  const savedResponse = await request.post(`/api/creator/drafts/${id}/save`, { data: saveBody }); expect(savedResponse.ok()).toBe(true);
  const saved = CreatorSnapshotSchema.parse(await savedResponse.json());
  const replayed = CreatorSnapshotSchema.parse(await (await request.post(`/api/creator/drafts/${id}/save`, { data: saveBody })).json());
  expect(replayed.opening?.version).toBe(saved.opening?.version); expect(await stats(request)).toEqual(before);
  const panel = saved.opening!.panels[0]; const operationId = randomUUID();
  const imageUrl = `/api/creator/drafts/${id}/opening/${saved.opening!.version}/${panel.id}/image`;
  const responses = await Promise.all([request.post(imageUrl, { data: { operation_id: operationId } }), request.post(imageUrl, { data: { operation_id: operationId } })]);
  expect(responses.every(response => response.ok())).toBe(true);
  const one = await stats(request); expect(one.images - before.images).toBe(1);
  await page.reload(); await expect(page.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Illustrate remaining scenes", exact: true })).toBeEnabled();
  expect(await stats(request)).toEqual(one);
  await page.getByRole("button", { name: "Illustrate remaining scenes", exact: true }).click();
  await expect(page.locator(".studio-opening-scene .generated-image.is-ready")).toHaveCount(3);
  const complete = await draft(request, id); const all = await stats(request); expect(all.images - before.images).toBe(3);
  const readingResponse = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "text", template_id: complete.latest_template!.id, template_version: complete.latest_template!.version } });
  expect(readingResponse.ok()).toBe(true); const reading = SnapshotSchema.parse(await readingResponse.json());
  const renamedResponse = await request.post(`/api/creator/drafts/${id}/save`, { data: { ...saveBody, operation_id: randomUUID(), foundation: { ...complete.draft.foundation!, title: "Ada's renamed illustrated opening" } } });
  expect(renamedResponse.ok()).toBe(true); const renamed = CreatorSnapshotSchema.parse(await renamedResponse.json());
  expect(renamed.opening?.status).toBe("ready");
  expect(renamed.opening?.panels.map(item => item.asset_id)).toEqual(complete.opening?.panels.map(item => item.asset_id));
  const changedResponse = await request.post(`/api/creator/drafts/${id}/save`, { data: { ...saveBody, operation_id: randomUUID(), foundation: { ...renamed.draft.foundation!, art_direction: "Original flat terracotta and ivory block-print comic, broad carved contours and strong daylight shadows. No text." } } });
  expect(changedResponse.ok()).toBe(true); const changed = CreatorSnapshotSchema.parse(await changedResponse.json());
  expect(changed.opening?.panels.every(item => item.status === "pending" && item.asset_id === null)).toBe(true);
  await page.reload(); await expect(page.getByRole("button", { name: "Play your story", exact: true })).toHaveCount(0);
  expect(await stats(request)).toEqual(all);
  const reread = SnapshotSchema.parse(await (await request.get(`/api/runs/${reading.run.id}`)).json());
  expect(reread.bible).toEqual(reading.bible);
  for (const beat of reading.bible.template!.opening_beats) expect((await request.get(`/api/runs/${reading.run.id}/assets/${beat.asset_id}`)).ok()).toBe(true);
});
