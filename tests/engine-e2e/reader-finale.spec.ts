import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number };
type AnchorMemory = { reader: Element; decision: Element; panels: Element[] };
type Anchor = { timeOrigin: number; scroll: number; readerSame: boolean; decisionSame: boolean; panelsSame: boolean; decisionHeight: number; panelBounds: { top: number; width: number; height: number }[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
}
async function createRun(request: APIRequestContext) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function readRun(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/runs/${id}`); expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function writeChapter(request: APIRequestContext, run: Snapshot, choiceId: string, instruction: string) {
  const response = await request.post(`/api/runs/${run.run.id}/nodes`, { data: { operation_id: randomUUID(), choice_id: choiceId, instruction } });
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function finishImages(request: APIRequestContext, run: Snapshot) {
  const pending = run.panels.filter(panel => panel.status === "pending"); expect(pending).toHaveLength(2);
  const responses = await Promise.all(pending.map(panel => request.post(`/api/runs/${run.run.id}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id, retry: false } })));
  expect(responses.every(response => response.ok())).toBe(true);
  const saved = await readRun(request, run.run.id);
  expect(saved.panels.every(panel => panel.status === "complete")).toBe(true);
  return saved;
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
}
async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function captureEnding(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1100 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.decode()));
  });
  await twoFrames(page);
  await page.locator(".book-ending").evaluate(ending => window.scrollTo({ top: ending.getBoundingClientRect().top + scrollY - 32, behavior: "instant" }));
  await twoFrames(page);
  await page.screenshot({ path: `test-results-live/poc-07/screenshots/mocked-ending-${width}.png`, animations: "disabled" });
}
async function anchor(page: Page): Promise<Anchor> {
  return page.evaluate(() => {
    const memory = (window as Window & { finaleMemory?: AnchorMemory }).finaleMemory;
    if (!memory) throw new Error("Reader document was replaced.");
    const panels = Array.from(document.querySelectorAll(".book-panel .panel-canvas"));
    return { timeOrigin: performance.timeOrigin, scroll: scrollY,
      readerSame: document.querySelector(".saved-reader") === memory.reader,
      decisionSame: document.querySelector(".book-decision[data-step='1']") === memory.decision,
      panelsSame: memory.panels.every((panel, index) => panels[index] === panel),
      decisionHeight: memory.decision.getBoundingClientRect().height,
      panelBounds: memory.panels.map(panel => { const bounds = panel.getBoundingClientRect(); return { top: bounds.top, width: bounds.width, height: bounds.height }; }),
    };
  });
}
async function expectFinale(page: Page, saved: Snapshot, artwork: "complete") {
  const ending = page.locator(".book-ending");
  await expect(ending).toHaveAttribute("data-artwork", artwork);
  await expect(ending.getByRole("heading", { name: "A story only you could tell.", exact: true })).toBeVisible();
  for (const node of saved.nodes) {
    await expect(ending).toContainText(node.choice);
    if (node.instruction) await expect(ending).toContainText(node.instruction);
  }
  for (const [name, href] of [["Read another story", "/"], ["Saved stories", "/saved"], ["Begin a new run", "/story/neon-protocol"]]) {
    await expect(ending.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ request }) => {
  mkdirSync("test-results-engine/poc07", { recursive: true });
  mkdirSync("test-results-live/poc-07/screenshots", { recursive: true });
  await control(request, {});
});
test.afterEach(async ({ request }) => { await control(request, {}); });

test("completed decisions compact only when safe, keep the visible panel anchored and reach a personalized ending", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await control(request, { scriptDelay: 160, imageDelay: 500, reverseImages: true });
  const before = await stats(request); const fresh = await createRun(request);
  await page.goto(`/run/${fresh.run.id}`);
  const firstDecision = page.locator(".book-decision[data-step='1']");
  const firstTwist = "Destroy it with a hammer.";
  await firstDecision.getByRole("radio", { name: "Destroy the device" }).check();
  await firstDecision.getByLabel("Add a little of your imagination", { exact: false }).fill(firstTwist);
  await page.evaluate(() => {
    const decision = document.querySelector(".book-decision[data-step='1']")!;
    (window as Window & { finaleMemory?: AnchorMemory }).finaleMemory = { reader: document.querySelector(".saved-reader")!, decision, panels: [] };
    window.scrollTo({ top: decision.getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
  });
  const initial = await anchor(page); let navigations = 0;
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  await submit(page);
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeAttached();
  await expect(firstDecision).toHaveAttribute("data-compact", "false");
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await twoFrames(page);
  await expect(firstDecision).toHaveAttribute("data-compact", "false");
  const visible = await anchor(page);
  expect(visible.readerSame && visible.decisionSame).toBe(true);
  expect(Math.abs(visible.scroll - initial.scroll)).toBeLessThanOrEqual(2);
  expect(Math.abs(visible.decisionHeight - initial.decisionHeight)).toBeLessThanOrEqual(2);

  // An offscreen card must still wait while its saved instruction retains focus.
  await firstDecision.locator("textarea").evaluate(input => (input as HTMLTextAreaElement).focus({ preventScroll: true }));
  await page.evaluate(() => {
    const memory = (window as Window & { finaleMemory?: AnchorMemory }).finaleMemory!;
    memory.panels = Array.from(document.querySelectorAll(".book-panel .panel-canvas"));
    window.scrollTo({ top: memory.panels[1].getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
  });
  await twoFrames(page);
  await expect(firstDecision).toHaveAttribute("data-compact", "false");
  const focused = await anchor(page);
  expect(await firstDecision.evaluate(card => card.contains(document.activeElement))).toBe(true);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollBy({ top: 1, behavior: "instant" }); });
  await expect(firstDecision).toHaveAttribute("data-compact", "true");
  await twoFrames(page);
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  const compacted = await anchor(page);
  expect(compacted.timeOrigin).toBe(initial.timeOrigin);
  expect(compacted.readerSame && compacted.decisionSame && compacted.panelsSame).toBe(true);
  expect(compacted.decisionHeight).toBeLessThan(focused.decisionHeight - 100);
  expect(Math.abs(compacted.panelBounds[1].top - focused.panelBounds[1].top)).toBeLessThanOrEqual(2);
  expect(compacted.panelBounds.map(({ width, height }) => ({ width, height }))).toEqual(focused.panelBounds.map(({ width, height }) => ({ width, height })));
  // Keeping the visual anchor requires a smaller scroll offset after removal above it.
  expect(compacted.scroll).toBeLessThan(focused.scroll - 100);
  await expect(firstDecision.locator("form")).toBeAttached();
  await expect(firstDecision.locator("form")).not.toBeVisible();
  await firstDecision.locator("details > summary").click();
  await expect(firstDecision.locator("details")).toHaveAttribute("open", "");
  await expect(firstDecision.locator("details")).toContainText("What does Kael do with the device?");
  await expect(firstDecision.locator("details")).toContainText("Destroy the device");
  await expect(firstDecision.locator("details")).toContainText(firstTwist);
  await firstDecision.locator("details > summary").click();
  await page.screenshot({ path: "test-results-live/poc-07/screenshots/mocked-compact-history-1440.png", animations: "disabled" });

  const first = await readRun(request, fresh.run.id); const next = first.nodes[0].chapter!.next_decision.options[0];
  const secondTwist = "Kael quietly remembers the rain.";
  const secondDecision = page.locator(".book-decision[data-step='2']");
  await secondDecision.getByRole("radio", { name: next.label }).check();
  await secondDecision.getByLabel("Add a little of your imagination", { exact: false }).fill(secondTwist);
  await submit(page);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  const completed = await readRun(request, fresh.run.id);
  expect(completed.run.status).toBe("ended");
  expect(completed.nodes.map(node => node.instruction)).toEqual([firstTwist, secondTwist]);
  await expectFinale(page, completed, "complete");
  expect(navigations).toBe(0);
  expect((await anchor(page)).panelsSame).toBe(true);
  const generated = await stats(request);
  expect(generated.scripts - before.scripts).toBe(2); expect(generated.images - before.images).toBe(4);
  writeFileSync("test-results-engine/poc07/decision-compaction.json", JSON.stringify({ initial, visible, focused, compacted }, null, 2));
  await captureEnding(page, 1440);
  await page.reload();
  await expect(page.locator(".book-decision[data-compact='true']")).toHaveCount(2);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expectFinale(page, completed, "complete");
  expect((await readRun(request, fresh.run.id)).panels.map(panel => panel.image_path)).toEqual(completed.panels.map(panel => panel.image_path));
  expect(await stats(request)).toEqual(generated);
});

test("the ending stays hidden through unfinished art and isolated recovery with reduced motion at 1024px", async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await control(request, { scriptDelay: 50, imageDelay: 100 });
  const fresh = await createRun(request);
  const first = await finishImages(request, await writeChapter(request, fresh, "investigate", "A mysterious cyborg cat suddenly appears."));
  const written = await writeChapter(request, first, first.nodes[0].chapter!.next_decision.options[0].id, "The cat keeps Kael company.");
  expect(written.run.status).toBe("ended");
  expect(written.panels.map(panel => panel.status)).toEqual(["complete", "complete", "pending", "pending"]);
  const beforeVisit = await stats(request);
  await page.goto(`/run/${fresh.run.id}`);
  await expect(page.locator(".book-decision[data-compact='true']")).toHaveCount(2);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect(page.locator(".book-ending")).toHaveCount(0);
  await page.locator(".book-decision[data-step='2']").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results-live/poc-07/screenshots/mocked-compact-history-1024.png", animations: "disabled" });
  await expect(page.getByRole("button", { name: "Finish the illustrations", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.locator(".book-ending")).toHaveCount(0);
  expect(await stats(request)).toEqual(beforeVisit);
  await control(request, { imageDelay: 150, failSecond: true });
  await page.getByRole("button", { name: "Finish the illustrations", exact: true }).click();
  const retry = page.getByRole("button", { name: "Try this illustration again", exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(3);
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  const failed = await readRun(request, fresh.run.id);
  expect(failed.panels.map(panel => panel.status)).toEqual(["complete", "complete", "complete", "failed"]);
  await expect(page.locator(".book-ending")).toHaveCount(0);
  const afterFailure = await stats(request);
  expect(afterFailure.scripts).toBe(beforeVisit.scripts); expect(afterFailure.images - beforeVisit.images).toBe(2);
  await control(request, { imageDelay: 100 });
  await retry.click();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  const completed = await readRun(request, fresh.run.id);
  expect(completed.panels.slice(0, 3).map(panel => panel.image_path)).toEqual(failed.panels.slice(0, 3).map(panel => panel.image_path));
  await expectFinale(page, completed, "complete");
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  const afterRetry = await stats(request);
  expect(afterRetry.scripts).toBe(afterFailure.scripts); expect(afterRetry.images - afterFailure.images).toBe(1);
  expect(await page.locator(".generated-image").first().evaluate(image => parseFloat(getComputedStyle(image).animationDuration))).toBeLessThan(0.001);
  await captureEnding(page, 1024);
  await page.reload();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expectFinale(page, completed, "complete");
  expect(await stats(request)).toEqual(afterRetry);
});

test("a failed saved-illustration load retries its local GET without replacing its sibling or generating again", async ({ page, request }) => {
  await control(request, { scriptDelay: 50, imageDelay: 100 });
  const fresh = await createRun(request);
  const saved = await finishImages(request, await writeChapter(request, fresh, "destroy", "Destroy it with a hammer."));
  const generated = await stats(request);
  const assetPath = `/api/runs/${fresh.run.id}/assets/${saved.panels[0].id}`;
  let assetGets = 0;
  await page.route(url => url.pathname === assetPath, async route => {
    assetGets++;
    if (assetGets === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.goto(`/run/${fresh.run.id}`);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".book-decision[data-step='2']")).toHaveCount(0);
  const reload = page.getByRole("button", { name: "Load saved illustration again", exact: true });
  await expect(reload).toBeEnabled();
  await page.locator(".book-panel").nth(1).locator(".generated-image").evaluate(image => {
    (window as Window & { finaleSibling?: Element }).finaleSibling = image;
  });
  expect(assetGets).toBe(1);
  expect(await stats(request)).toEqual(generated);
  await reload.click();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect(page.locator(".book-decision[data-step='2']")).toBeVisible();
  await expect(reload).toHaveCount(0);
  expect(assetGets).toBe(2);
  expect(await page.locator(".book-panel").nth(1).locator(".generated-image").evaluate(image => (window as Window & { finaleSibling?: Element }).finaleSibling === image)).toBe(true);
  expect((await readRun(request, fresh.run.id)).panels.map(panel => panel.image_path)).toEqual(saved.panels.map(panel => panel.image_path));
  expect(await stats(request)).toEqual(generated);
});

test("retrying a failed illustration above the viewport preserves the later panel's native scroll anchor", async ({ page, request }) => {
  await control(request, { scriptDelay: 50, imageDelay: 100, failSecond: true });
  const fresh = await createRun(request);
  const written = await writeChapter(request, fresh, "investigate", "A mysterious cyborg cat suddenly appears.");
  await Promise.all(written.panels.map(panel => request.post(`/api/runs/${fresh.run.id}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id, retry: false } })));
  const partial = await readRun(request, fresh.run.id);
  expect(partial.panels.map(panel => panel.status)).toEqual(["complete", "failed"]);
  // Reconstruct a legacy advanced run through the API. The reader now gates new
  // choices, but must keep this existing history and earlier recovery accessible.
  await control(request, { scriptDelay: 50, imageDelay: 100 });
  const ending = await writeChapter(request, partial, partial.nodes[0].chapter!.next_decision.options[0].id, "Keep the cat close.");
  await Promise.all(ending.panels.filter(panel => panel.status === "pending").map(panel => request.post(`/api/runs/${fresh.run.id}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id, retry: false } })));
  const saved = await readRun(request, fresh.run.id);
  expect(saved.panels.map(panel => panel.status)).toEqual(["complete", "failed", "complete", "complete"]);
  const beforeCalls = await stats(request);
  await page.goto(`/run/${fresh.run.id}`);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(3);
  await expect(page.locator(".book-ending")).toHaveCount(0);
  await expect(page.locator(".book-decision[data-compact='true']")).toHaveCount(2);
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  const retry = page.getByRole("button", { name: "Try this illustration again", exact: true });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll(".book-panel .panel-canvas"));
    (window as Window & { finaleMemory?: AnchorMemory }).finaleMemory = { reader: document.querySelector(".saved-reader")!, decision: document.querySelector(".book-decision[data-step='1']")!, panels };
    window.scrollTo({ top: panels[2].getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
  });
  await twoFrames(page);
  const before = await anchor(page);
  expect(before.panelBounds[2].top).toBeCloseTo(80, 0);
  expect(await retry.evaluate(button => button.getBoundingClientRect().bottom)).toBeLessThan(0);
  // Invoke the explicit user action without Playwright scrolling back to its
  // offscreen button; this isolates removal of the recovery block above us.
  await retry.evaluate(button => (button as HTMLButtonElement).click());
  await expect(retry).toHaveCount(0);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toBeVisible();
  await twoFrames(page);
  const after = await anchor(page);
  expect(after.timeOrigin).toBe(before.timeOrigin);
  expect(after.readerSame && after.decisionSame && after.panelsSame).toBe(true);
  expect(Math.abs(after.panelBounds[2].top - before.panelBounds[2].top)).toBeLessThanOrEqual(2);
  expect(after.panelBounds[2].height).toBe(before.panelBounds[2].height);
  expect(after.scroll).toBeLessThan(before.scroll);
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  const recovered = await readRun(request, fresh.run.id);
  expect(recovered.panels[1].image_path).not.toBeNull();
  for (const index of [0, 2, 3]) expect(recovered.panels[index].image_path).toBe(saved.panels[index].image_path);
  const afterCalls = await stats(request);
  expect(afterCalls.scripts).toBe(beforeCalls.scripts);
  expect(afterCalls.images - beforeCalls.images).toBe(1);
  writeFileSync("test-results-engine/poc07/above-viewport-retry.json", JSON.stringify({ before, after }, null, 2));
});

test("a long illustration wait reports saved dialogue without invented progress or previews", async ({ page, request }) => {
  await control(request, { scriptDelay: 80, imageDelay: 2500, streamPreviews: false });
  await page.clock.install();
  const fresh = await createRun(request);
  await page.goto(`/run/${fresh.run.id}`);
  await page.getByRole("radio", { name: "Destroy the device" }).check();
  await submit(page);
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeAttached();
  await expect(page.locator(".generated-image, .preview-image")).toHaveCount(0);
  await page.clock.fastForward(21_000);
  await expect(page.locator(".book-panel").first().getByText("Taking a little longer. Your dialogue is saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator(".preview-image")).toHaveCount(0);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.locator(".book-panel .panel-canvas").first().evaluate(panel => window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY - 32, behavior: "instant" }));
    await twoFrames(page);
    await page.screenshot({ path: `test-results-live/poc-07/screenshots/mocked-long-wait-${width}.png`, animations: "disabled" });
  }
  // The browser clock does not advance the mock server's real 5,000 ms delay
  // for panel two. Allow that delay plus response transfer and local decoding.
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByText("Taking a little longer. Your dialogue is saved.", { exact: true })).toHaveCount(0);
});
