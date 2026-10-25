import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { CreatorSnapshotSchema } from "../../src/lib/creator/contracts";
import { SnapshotSchema, type NarrativeContext } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; foundationInputs: unknown[]; scripts: number; images: number; contexts: NarrativeContext[]; imageReferences: { hashes: string[] }[]; endpoints: string[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) { expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true); }
async function draft(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/creator/drafts/${id}`); expect(response.ok()).toBe(true);
  return CreatorSnapshotSchema.parse(await response.json());
}
async function createDraft(request: APIRequestContext) {
  const response = await request.post("/api/creator/drafts", { data: { operation_id: randomUUID() } }); expect(response.ok()).toBe(true);
  return CreatorSnapshotSchema.parse(await response.json());
}
async function readRun(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/runs/${id}`); expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
function png(red: number, green: number, blue: number, width = 2) {
  const chunk = (name: string, bytes: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), bytes]); const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
    const check = Buffer.alloc(4); check.writeUInt32BE(crc32(body)); return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(2 * (1 + width * 4));
  for (let y = 0; y < 2; y++) for (let x = 0; x < width; x++) { const offset = y * (1 + width * 4) + 1 + x * 4; rows.set([red, green, blue, 255], offset); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("tEXt", Buffer.from("Comment\0PRIVATE_TEST_METADATA")), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const fixture = (index: number) => ({ name: `authored-color-${index}.png`, mimeType: "image/png", buffer: png(40 + index * 40, 70 + index * 20, 160 - index * 20) });
const prompt = "Ada, a patient star cartographer, follows a faded indigo chart home from an observatory before a storm.";
async function captureDesktop(page: Page, name: string, target?: string) {
  mkdirSync("test-results-live/poc-08/screenshots", { recursive: true });
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
    if (target) await page.locator(target).evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 32, behavior: "instant" }));
    else await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results-live/poc-08/screenshots/${name}-${width}.png`, animations: "disabled" });
  }
}

test.afterEach(async ({ request }) => { await control(request, {}); });

for (const referenceCount of [0, 1, 3]) {
  test(`Creator Describe → Generate → edit → save → play completes with ${referenceCount} owned reference images`, async ({ page, request, browser }) => {
    test.setTimeout(90000);
    await control(request, { imageDelay: 650, scriptDelay: 200 });
    const before = await stats(request);
    await page.goto("/studio");
    await expect(page.getByRole("heading", { level: 1, name: "A story only you could start." })).toBeVisible();
    await page.getByLabel("Describe your story", { exact: true }).fill(prompt);
    await page.getByText("Shape the details", { exact: true }).click();
    await page.getByLabel(/^Title.*optional/i).fill(`Ada's Atlas ${referenceCount}`);
    await page.getByLabel(/^Genre.*optional/i).fill("Celestial Adventure");
    await page.getByLabel(/^Main character.*optional/i).fill("Ada, a patient cartographer with a right-shoulder braid and silver spectacles");
    await page.getByLabel(/^Visual style.*optional/i).fill("Original flat indigo, cream and silver ink");
    await page.getByLabel(/^Atmosphere.*optional/i).fill("Quiet wonder before a storm");
    if (referenceCount === 0) await captureDesktop(page, "creator-prompt");
    expect(await stats(request)).toEqual(before);
    await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Make it your own", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/studio\?draft=[a-f0-9-]+$/);
    const draftId = new URL(page.url()).searchParams.get("draft")!;
    const foundation = await draft(request, draftId);
    expect(foundation.draft.foundation?.protagonist_id).toBe("ada");
    expect(foundation.summary.calls).toBe(1);
    expect(foundation.summary.measured_input_tokens).toBe(400);
    expect(foundation.summary.measured_output_tokens).toBe(900);
    expect(foundation.summary.estimated_micro_usd).toBeGreaterThan(0);
    expect(foundation.summary.unknown_cost_attempts).toBe(0);
    const afterFoundation = await stats(request);
    expect(afterFoundation.foundations - before.foundations).toBe(1);
    expect(afterFoundation.scripts).toBe(before.scripts);
    expect(afterFoundation.images).toBe(before.images);
    expect(afterFoundation.foundationInputs.at(-1)).toMatchObject({ prompt, title: `Ada's Atlas ${referenceCount}`, genre: "Celestial Adventure" });
    if (referenceCount) {
      await page.getByLabel("Add reference images", { exact: true }).setInputFiles(Array.from({ length: referenceCount }, (_, index) => fixture(index)));
      await expect.poll(async () => (await draft(request, draftId)).draft.reference_asset_ids.length).toBe(referenceCount);
    }
    if (referenceCount === 3) {
      const beforeRemoval = await draft(request, draftId); const removed = beforeRemoval.draft.reference_asset_ids[1];
      await page.locator(`[data-reference-id='${removed}']`).getByRole("button", { name: /remove reference/i }).click();
      await expect.poll(async () => (await draft(request, draftId)).draft.reference_asset_ids.length).toBe(2);
      // The committed response must also reach the UI before replacing a file.
      // setInputFiles can otherwise bypass a still-disabled native input.
      await expect(page.locator("[data-reference-id]")).toHaveCount(2);
      await expect(page.getByLabel("Add reference images", { exact: true })).toBeEnabled();
      await page.getByLabel("Add reference images", { exact: true }).setInputFiles(fixture(3));
      await expect.poll(async () => (await draft(request, draftId)).draft.reference_asset_ids.length).toBe(3);
      await expect(page.locator("[data-reference-id]")).toHaveCount(3);
      expect((await draft(request, draftId)).draft.reference_asset_ids).not.toContain(removed);
      await captureDesktop(page, "creator-references", ".studio-references");
    }
    const withReferences = await draft(request, draftId);
    const ownedHashes: string[] = [];
    for (const id of withReferences.draft.reference_asset_ids) {
      const response = await request.get(`/api/creator/drafts/${draftId}/references/${id}`); expect(response.ok()).toBe(true);
      const bytes = await response.body();
      expect(bytes.includes(Buffer.from("PRIVATE_TEST_METADATA"))).toBe(false);
      const hash = createHash("sha256").update(bytes).digest("hex"); ownedHashes.push(hash);
      expect(withReferences.assets.find(asset => asset.id === id)?.sha256).toBe(hash);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
    const editedTitle = `Ada's Quiet Way Home ${referenceCount}`;
    await page.getByLabel("Story title", { exact: true }).fill(editedTitle);
    await page.getByLabel("Synopsis", { exact: true }).fill("An edited story about a cartographer finding her own quiet route home.");
    await page.getByLabel("Choice 1", { exact: true }).fill("Trace the moonlit silver fold on Ada's chart");
    if (referenceCount !== 1) await captureDesktop(page, `creator-edit-${referenceCount}-refs`, ".studio-preview");
    expect(await stats(request)).toEqual(afterFoundation);
    await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ready to play", exact: true })).toBeVisible();
    const saved = await draft(request, draftId);
    expect(saved.draft.status).toBe("ready"); expect(saved.latest_template?.title).toBe(editedTitle);
    expect(saved.latest_template?.reference_asset_ids).toEqual(withReferences.draft.reference_asset_ids);
    expect(saved.latest_template?.initial_decision.options[0].label).toBe("Trace the moonlit silver fold on Ada's chart");
    expect(saved.latest_template?.description).toContain("An edited story");
    const afterOpening = await stats(request);
    expect(afterOpening.images - afterFoundation.images).toBe(2);
    if (referenceCount === 0) await expect(page.getByText("Illustrations use this story’s written visual guide. No reference images attached.", { exact: true })).toBeVisible();
    if (referenceCount === 3) await captureDesktop(page, "creator-saved-story", ".studio-ready");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ready to play", exact: true })).toBeVisible();
    expect(await stats(request)).toEqual(afterOpening);
    await page.getByRole("button", { name: "Play your story", exact: true }).click();
    await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
    const runUrl = page.url(); const runId = runUrl.split("/").at(-1)!;
    const initial = await readRun(request, runId);
    expect(initial.bible.template).toEqual(saved.latest_template);
    expect(initial.run.approach).toBe(referenceCount ? "reference" : "text");
    await expect(page.getByRole("heading", { level: 1, name: editedTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(3);
    expect(await stats(request)).toEqual(afterOpening);
    const first = page.locator(".book-decision[data-step='1']");
    await first.locator("input[value='trace_crease']").check();
    await first.getByLabel("Add a little of your imagination").fill("The tower bell rings once through the storm.");
    await first.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator(".speech-bubble")).toHaveCount(2);
    await expect(page.locator(".generated-image")).toHaveCount(0);
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
    const written = await readRun(request, runId);
    if (referenceCount === 3) {
      // Editing the draft cannot change a run's already-pinned visual memory.
      expect((await request.delete(`/api/creator/drafts/${draftId}/references/${saved.latest_template!.reference_asset_ids[0]}`)).ok()).toBe(true);
      expect((await draft(request, draftId)).draft.reference_asset_ids).toHaveLength(2);
      expect((await readRun(request, runId)).bible.template?.reference_asset_ids).toHaveLength(3);
    }
    const second = page.locator(".book-decision[data-step='2']");
    await second.locator(`input[value='${written.nodes[0].chapter!.next_decision.options[0].id}']`).check();
    await second.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
    await expect(page.locator(".book-ending")).toHaveAttribute("data-artwork", "complete");
    if (referenceCount === 3) await captureDesktop(page, "creator-completed-reader-mock", ".book-ending");
    const completed = await readRun(request, runId); expect(completed.run.status).toBe("ended");
    expect(completed.summary.image_calls).toBe(4); expect(completed.summary.script_calls).toBe(2);
    expect(completed.summary.unknown_cost_attempts).toBe(0);
    const generated = await stats(request);
    expect(generated.foundations - before.foundations).toBe(1);
    expect(generated.scripts - before.scripts).toBe(2);
    expect(generated.images - before.images).toBe(6);
    expect(JSON.stringify(generated.contexts.slice(before.contexts.length))).not.toMatch(/Kael|Mara|Ivo|New Kyoto|tide_lantern|seed_compass/);
    for (const record of generated.imageReferences.slice(before.imageReferences.length)) expect(record.hashes.toSorted()).toEqual(ownedHashes.toSorted());
    expect(generated.endpoints.slice(before.endpoints.length).filter(endpoint => ["edits", "generations"].includes(endpoint))).toEqual(Array(6).fill(referenceCount ? "edits" : "generations"));
    if (referenceCount === 0) {
      await expect(page.locator("#replay-mode option[value='reference']")).toBeDisabled();
      const updated = await request.post(`/api/creator/drafts/${draftId}/save`, { data: { operation_id: randomUUID(), mode: "illustrate", foundation: { ...saved.draft.foundation!, title: `${editedTitle} · revised` }, reference_asset_ids: [] } });
      expect(updated.ok()).toBe(true);
      const versionTwo = CreatorSnapshotSchema.parse(await updated.json());
      expect(versionTwo.latest_template?.version).toBe(2);
      expect((await readRun(request, runId)).bible.template).toEqual(saved.latest_template);
      await page.goto(`/studio?draft=${draftId}`);
      await page.getByRole("button", { name: "Play your story", exact: true }).click();
      await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
      const newRun = await readRun(request, page.url().split("/").at(-1)!);
      expect(newRun.bible.template?.version).toBe(2); expect(newRun.nodes).toHaveLength(0);
      await page.goto(runUrl);
    }
    await page.reload(); await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
    expect(await stats(request)).toEqual(generated);
    if (referenceCount === 3) {
      // All generation is complete. Close the finished browser visit so its
      // speculative sockets cannot hold Next's graceful shutdown open.
      await page.waitForLoadState("networkidle"); await page.context().close();
      expect((await request.post(`${runtime().mockURL}/__restart`, { timeout: 20000 })).ok()).toBe(true);
      const restored = await browser.newPage({ viewport: { width: 1024, height: 1100 } });
      try {
        await restored.goto(runUrl); await expect(restored.locator(".generated-image.is-ready")).toHaveCount(4);
        expect((await readRun(request, runId)).bible).toEqual(initial.bible);
        expect(await stats(request)).toEqual(generated);
      } finally { await restored.close(); }
    }
  });
}

test("a lost generation response recovers the newer saved foundation without repeating it or replacing later manual edits", async ({ page, request }) => {
  await control(request, {}); const before = await stats(request);
  await page.goto("/studio");
  await page.getByLabel("Describe your story", { exact: true }).fill(prompt);
  await page.getByText("Shape the details", { exact: true }).click();
  await page.getByLabel(/^Title.*optional/i).fill("Ada's first map");
  await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue("Ada's first map");
  const draftId = new URL(page.url()).searchParams.get("draft")!;
  await page.getByLabel(/^Title.*optional/i).fill("Ada's recovered second map");
  let forwarded = 0;
  await page.route(`**/api/creator/drafts/${draftId}/generate`, async route => {
    // The mocked provider and durable commit finish, but the browser loses the
    // response. Recovery must read that result, never issue another paid call.
    forwarded++;
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue("Ada's recovered second map");
  expect(forwarded).toBe(1);
  const recovered = await draft(request, draftId);
  expect(recovered.draft.foundation?.title).toBe("Ada's recovered second map");
  expect(recovered.attempts.map(attempt => attempt.status)).toEqual(["succeeded", "succeeded"]);
  const after = await stats(request); expect(after.foundations - before.foundations).toBe(2);
  expect(after.scripts).toBe(before.scripts); expect(after.images).toBe(before.images);
  await page.getByLabel("Story title", { exact: true }).fill("Ada's manual title after recovery");
  await page.getByRole("button", { name: "Check saved result", exact: true }).click();
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue("Ada's manual title after recovery");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  expect((await draft(request, draftId)).draft.foundation?.title).toBe("Ada's manual title after recovery");
  await page.reload();
  await expect(page.getByLabel("Story title", { exact: true })).toHaveValue("Ada's manual title after recovery");
  expect(await stats(request)).toEqual(after);
});

test("Creator foundation claims are idempotent, retain failed usage and require explicit acknowledged unknown retries", async ({ request }) => {
  await control(request, { invalidFoundation: true, foundationDelay: 350 });
  const before = await stats(request); const created = await createDraft(request); const id = created.draft.id;
  const input = { operation_id: randomUUID(), prompt };
  const responses = await Promise.all([request.post(`/api/creator/drafts/${id}/generate`, { data: input }), request.post(`/api/creator/drafts/${id}/generate`, { data: input })]);
  expect(responses.every(response => response.ok())).toBe(true);
  let current = await draft(request, id);
  expect(current.attempts).toHaveLength(1); expect(current.attempts[0].status).toBe("failed");
  expect(current.summary.measured_output_tokens).toBe(900); expect(current.summary.estimated_micro_usd).toBeGreaterThan(0);
  expect(current.summary.unknown_cost_attempts).toBe(0); expect(current.draft.foundation).toBeNull();
  expect((await stats(request)).foundations - before.foundations).toBe(1);
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: { ...input, prompt: `${prompt} Changed.` } })).status()).toBe(409);
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: { ...input, operation_id: randomUUID() } })).status()).toBe(409);
  await control(request, { uncertainFoundation: true });
  const uncertain = { ...input, operation_id: randomUUID(), retry_of: current.attempts[0].id };
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: uncertain })).ok()).toBe(true);
  current = await draft(request, id);
  expect(current.attempts.at(-1)?.status).toBe("failed"); expect(current.summary.unknown_cost_attempts).toBe(1); expect(current.summary.held_micro_usd).toBeGreaterThan(0);
  const failedUnknownId = current.attempts.at(-1)!.id;
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: uncertain })).ok()).toBe(true);
  expect((await stats(request)).foundations - before.foundations).toBe(2);
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: { ...input, operation_id: randomUUID(), retry_of: failedUnknownId } })).status()).toBe(409);
  await control(request, {});
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: { ...input, operation_id: randomUUID(), retry_of: failedUnknownId, acknowledge_unknown: true } })).ok()).toBe(true);
  current = await draft(request, id); expect(current.attempts.at(-1)?.status).toBe("succeeded"); expect(current.summary.calls).toBe(3); expect(current.summary.unknown_cost_attempts).toBe(1);
  expect((await request.post(`/api/creator/drafts/${id}/generate`, { data: { ...input, operation_id: randomUUID() } })).status()).toBe(402);
  expect((await stats(request)).foundations - before.foundations).toBe(3);
  expect((await stats(request)).images).toBe(before.images);
  expect((await stats(request)).scripts).toBe(before.scripts);
});

test("Creator reference uploads reject unsafe or foreign assets and cannot exceed three active images", async ({ request }) => {
  await control(request, {}); const before = await stats(request);
  const created = await createDraft(request); const id = created.draft.id;
  const upload = (file: { name: string; mimeType: string; buffer: Buffer }) => request.post(`/api/creator/drafts/${id}/references`, { multipart: { file, purpose: "Authored color test reference" } });
  for (const file of [
    { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    { name: "script.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
    { name: "too-wide.png", mimeType: "image/png", buffer: png(0, 0, 0, 4097) },
    { name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024) },
  ]) { const response = await upload(file); expect(response.status()).toBeGreaterThanOrEqual(400); expect(response.status()).toBeLessThan(500); }
  expect((await draft(request, id)).draft.reference_asset_ids).toEqual([]);
  for (let index = 0; index < 3; index++) expect((await upload(fixture(index))).ok()).toBe(true);
  expect((await upload(fixture(3))).status()).toBe(400);
  const saved = await draft(request, id); expect(saved.draft.reference_asset_ids).toHaveLength(3);
  const other = await createDraft(request); const ownedId = saved.draft.reference_asset_ids[0];
  expect((await request.get(`/api/creator/drafts/${other.draft.id}/references/${ownedId}`)).status()).toBe(404);
  expect((await request.delete(`/api/creator/drafts/${other.draft.id}/references/${ownedId}`)).status()).toBe(404);
  expect((await request.post(`/api/creator/drafts/${id}/references`, { headers: { Origin: "https://foreign.invalid" }, multipart: { file: fixture(3) } })).status()).toBe(403);
  expect((await draft(request, id)).draft.reference_asset_ids).toEqual(saved.draft.reference_asset_ids);
  expect(await stats(request)).toEqual(before);
});
