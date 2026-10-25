import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { CreatorStore, getSavedTemplateBundle } from "../../src/lib/creator/store";
import { StoryFoundationSchema, SnapshotSchema } from "../../src/lib/story-engine/contracts";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../../src/lib/story-templates/catalog";
import { listSavedRuns } from "../../src/lib/story-library";
import { ContentDeletionService } from "../../src/lib/content-management/service";
import { readFileIntents } from "../../src/lib/content-management/files";

const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext) => (await request.get(`${runtime().mockURL}/__stats`)).json();
function isolatedDirectory() {
  const directory = realpathSync(runtime().dataDirectory);
  if (!directory.startsWith(`${realpathSync(os.tmpdir())}${path.sep}`) || !path.basename(directory).startsWith("lunatoon-browser-")) throw new Error("Legacy fixtures require the isolated browser harness directory.");
  return directory;
}
async function readRun(request: APIRequestContext, id: string) { const response = await request.get(`/api/runs/${id}`); expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json()); }
async function createRun(request: APIRequestContext, template?: { id: string; version: number }) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference", ...(template ? { template_id: template.id, template_version: template.version } : {}) } });
  expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json());
}
async function deleted(request: APIRequestContext, url: string) { const response = await request.get(url); expect(response.status()).toBe(410); expect(await response.json()).toMatchObject({ error: { code: "content_deleted" } }); }
function pageForRun(directory: string, id: string) {
  for (let page = 1; page < 100; page++) { const result = listSavedRuns({ directory, page, limit: 12 }); if (result.runs.some(run => run.id === id)) return page; if (!result.has_next) break; }
  throw new Error("The legacy reading is absent from the saved listing.");
}
function removeSyntheticIntents(directory: string, ids: string[]) {
  // Emulate pre8.1 records, when these exact owned DB paths existed without a
  // file-intent journal. Never alter originals or another fixture's receipts.
  const retained = readFileIntents(directory).filter(intent => !ids.includes(intent.owner_id));
  writeFileSync(path.join(directory, "content-write-intents.jsonl"), retained.map(item => JSON.stringify(item)).join("\n") + (retained.length ? "\n" : ""));
}
async function legacyCreators() {
  const directory = isolatedDirectory(); const store = new CreatorStore(directory);
  const shared = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#539fbc" } }).png().toBuffer();
  try {
    const results = ["Legacy coastal story", "Surviving coastal story"].map(title => {
      const draft = store.createDraft({ operation_id: randomUUID() }).draft;
      const reference = store.addReference(draft.id, { bytes: shared, mime: "image/png", width: 32, height: 48, purpose: "Original synthetic shared reference" });
      const artwork = store.registerArtwork(draft.id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#d9e9df"/><circle cx="300" cy="300" r="70" fill="#e7c779"/></svg>'), mime: "image/svg+xml", width: 600, height: 800, purpose: "Original synthetic pre8.1 decorative opening" });
      const foundation = StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, LAST_LIGHTKEEPER_TEMPLATE[key as keyof typeof LAST_LIGHTKEEPER_TEMPLATE]])), title, opening_beats: LAST_LIGHTKEEPER_TEMPLATE.opening_beats.map(({ caption, alt }) => ({ caption, alt })) });
      const saved = store.saveTemplate(draft.id, { operation_id: randomUUID(), foundation, reference_asset_ids: [reference.id], cover_asset_id: artwork.id, opening_asset_ids: foundation.opening_beats.map(() => artwork.id) });
      expect(saved.opening).toBeNull(); expect(saved.latest_template?.status).toBe("ready");
      return { draft: saved.draft, template: saved.latest_template!, reference, artwork };
    });
    removeSyntheticIntents(directory, results.map(result => result.draft.id));
    return { directory, target: results[0], sibling: results[1] };
  } finally { store.close(); }
}
test.afterEach(async ({ request }) => { expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true); });

test("an older pre-template reading deletes from its saved page without navigation or loss of sibling references", async ({ page, request }) => {
  const directory = isolatedDirectory(), target = await createRun(request), sibling = await createRun(request);
  expect(target.bible.template).toBeUndefined();
  const db = new DatabaseSync(path.join(directory, "stories.sqlite"));
  try { db.prepare("UPDATE story_runs SET document=? WHERE id=?").run(JSON.stringify({ ...target.run, created_at: 1, updated_at: 1 }), target.run.id); } finally { db.close(); }
  removeSyntheticIntents(directory, [target.run.id]);
  const shared = sibling.bible.assets.find(asset => asset.id === "kael_reference")!;
  const bytes = readFileSync(path.join(directory, shared.path));
  const before = await stats(request);
  await page.goto(`/saved?page=${pageForRun(directory, target.run.id)}`);
  const card = page.locator(`[data-run-id='${target.run.id}']`);
  await expect(card.getByRole("button", { name: /Delete reading/ })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { legacyDocument: document.documentElement }));
  await card.getByRole("button", { name: /Delete reading/ }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this reading?", exact: true });
  await expect(dialog).toContainText("The original story will remain available.");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await readRun(request, target.run.id)).run.id).toBe(target.run.id);
  await card.getByRole("button", { name: /Delete reading/ }).click();
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { legacyDocument?: Element }).legacyDocument === document.documentElement)).toBe(true);
  await deleted(request, `/api/runs/${target.run.id}`);
  expect(await readRun(request, sibling.run.id)).toEqual(sibling);
  expect(readFileSync(path.join(directory, shared.path))).toEqual(bytes);
  expect((await request.get("/story/neon-protocol")).ok()).toBe(true);
  expect(await stats(request)).toEqual(before);
});

test("Made by you deletes a legacy SVG story through its owned draft, preserving another story and shared reference", async ({ page, request }) => {
  const { directory, target, sibling } = await legacyCreators();
  const readings = await Promise.all([createRun(request, target.template), createRun(request, target.template)]);
  const otherRun = await createRun(request, sibling.template), builtIn = await createRun(request);
  const sharedPath = path.join(directory, "creator/assets", `${sibling.reference.sha256}.png`);
  const sharedBytes = readFileSync(sharedPath);
  const bundle = getSavedTemplateBundle(sibling.template.id, sibling.template.version, directory)!;
  const before = await stats(request);
  await page.goto("/#creator-stories");
  const card = page.locator(`#creator-stories [data-story='${target.template.id}']`);
  await expect(card.getByRole("button", { name: /Delete story/ })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { legacyDocument: document.documentElement }));
  await card.getByRole("button", { name: /Delete story/ }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this story?", exact: true });
  await expect(dialog).toContainText("2 saved readings"); await expect(dialog).toContainText("1 saved version");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await request.get(`/api/creator/drafts/${target.draft.id}`)).ok()).toBe(true);
  await card.getByRole("button", { name: /Delete story/ }).click();
  await dialog.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { legacyDocument?: Element }).legacyDocument === document.documentElement)).toBe(true);
  await deleted(request, `/api/creator/drafts/${target.draft.id}`);
  for (const reading of readings) await deleted(request, `/api/runs/${reading.run.id}`);
  expect(await readRun(request, otherRun.run.id)).toEqual(otherRun);
  expect(await readRun(request, builtIn.run.id)).toEqual(builtIn);
  expect(readFileSync(sharedPath)).toEqual(sharedBytes);
  expect(getSavedTemplateBundle(sibling.template.id, sibling.template.version, directory)).toEqual(bundle);
  expect((await request.get(`/api/templates/${sibling.template.id}/assets/${sibling.reference.id}?version=${sibling.template.version}`)).ok()).toBe(true);
  await expect(page.locator(`#creator-stories [data-story='${sibling.template.id}']`)).toBeVisible();
  await expect(page.locator("#stories").getByRole("button", { name: /Delete story/ })).toHaveCount(0);
  expect(await stats(request)).toEqual(before);
});

test("an interrupted legacy Creator deletion remains discoverable in Made by you and resumes only on explicit cleanup", async ({ page, request }) => {
  const { directory, target, sibling } = await legacyCreators();
  await createRun(request, target.template);
  const service = new ContentDeletionService(directory, { checkpoint: phase => { if (phase === "marked") throw new Error("Synthetic interruption after durable tombstones"); } });
  const preview = service.preview({ kind: "creator", id: target.draft.id }), operation = randomUUID();
  expect(() => service.begin({ action: "begin", operation_id: operation, kind: "creator", id: target.draft.id, confirmation_revision: preview.confirmation_revision })).toThrow("Synthetic interruption");
  expect(service.status(operation).status).toBe("pending");
  const sharedPath = path.join(directory, "creator/assets", `${sibling.reference.sha256}.png`), hash = createHash("sha256").update(readFileSync(sharedPath)).digest("hex");
  const before = await stats(request);
  await page.goto("/#creator-stories");
  const pending = page.locator(`#creator-stories [data-deletion-id='${operation}']`);
  await expect(pending).toContainText("Deletion in progress");
  await expect(page.locator(`#creator-stories [data-story='${target.template.id}']`)).toHaveCount(0);
  expect(service.status(operation).status).toBe("pending");
  await page.reload(); await expect(pending).toBeVisible();
  expect(service.status(operation).status).toBe("pending");
  await pending.getByRole("button", { name: "Retry cleanup", exact: true }).click();
  await expect(pending).toHaveCount(0);
  await expect(page.locator("#creator-stories").getByRole("status").filter({ hasText: "Story deleted permanently." })).toBeVisible();
  expect(service.status(operation).status).toBe("complete");
  expect(existsSync(sharedPath)).toBe(true);
  expect(createHash("sha256").update(readFileSync(sharedPath)).digest("hex")).toBe(hash);
  expect((await request.get(`/api/creator/drafts/${sibling.draft.id}`)).ok()).toBe(true);
  expect(await stats(request)).toEqual(before);
});
