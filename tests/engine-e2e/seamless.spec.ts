import { test, expect, type APIRequestContext, type Page, type Request, type TestInfo } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";
import type { ReaderObservation } from "../../src/lib/reader-timing";

type Stats = { scripts: number; images: number; streamedImages: number; previews: number; completedImages: number[] };
type Measurement = { phase: string; elapsedMs: number; scroll: number; timeOrigin: number; readerSame: boolean; decisionSame: boolean; earlierPanelsSame: boolean; decisionTop: number; decisionHeight: number; panels: { top: number; height: number }[] };
type BrowserMemory = { reader: Element; decision: Element; earlierPanels: Element[]; started: number };
type ImageStreamEvidence = { url: string; status: number | null; ok: boolean; eof: boolean; settledRecords: number; readErrors: string[]; fetchError: string | null };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
const control = async (request: APIRequestContext, data: Record<string, boolean | number>) => {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
};
async function snapshot(request: APIRequestContext, url: string) {
  return SnapshotSchema.parse(await (await request.get(`/api/runs/${url.split("/").at(-1)}`)).json());
}
async function remember(page: Page, decisionIndex: number) {
  await page.evaluate(index => {
    const decision = document.querySelectorAll(".book-decision")[index];
    (window as Window & { seamlessMemory?: BrowserMemory }).seamlessMemory = {
      reader: document.querySelector(".saved-reader")!, decision,
      earlierPanels: Array.from(document.querySelectorAll(".generated-panel")), started: performance.now(),
    };
    window.scrollTo({ top: decision.getBoundingClientRect().top + scrollY - 100, behavior: "instant" });
  }, decisionIndex);
}
async function measure(page: Page, phase: string): Promise<Measurement> {
  return page.evaluate(label => {
    const memory = (window as Window & { seamlessMemory?: BrowserMemory }).seamlessMemory;
    if (!memory) throw new Error("Reader observation was lost through a document navigation.");
    const panels = Array.from(document.querySelectorAll(".generated-panel"));
    const decisionBounds = memory.decision.getBoundingClientRect();
    return { phase: label, elapsedMs: performance.now() - memory.started, scroll: scrollY, timeOrigin: performance.timeOrigin,
      readerSame: document.querySelector(".saved-reader") === memory.reader,
      decisionSame: memory.decision.isConnected,
      earlierPanelsSame: memory.earlierPanels.every((panel, index) => panel === panels[index]),
      decisionTop: decisionBounds.top + scrollY, decisionHeight: decisionBounds.height,
      panels: panels.map(panel => { const bounds = panel.getBoundingClientRect(); return { top: bounds.top + scrollY, height: bounds.height }; }),
    };
  }, phase);
}
async function saveMeasurements(name: string, measurements: Measurement[], info: TestInfo) {
  mkdirSync("test-results-engine/poc05", { recursive: true });
  const filename = `test-results-engine/poc05/${name}.json`;
  writeFileSync(filename, JSON.stringify(measurements, null, 2));
  await info.attach(name, { path: filename, contentType: "application/json" });
}
function unchanged(before: Measurement, after: Measurement) {
  expect(after.timeOrigin).toBe(before.timeOrigin);
  expect(after.readerSame).toBe(true);
  expect(after.decisionSame).toBe(true);
  expect(after.earlierPanelsSame).toBe(true);
  expect(Math.abs(after.scroll - before.scroll)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.decisionTop - before.decisionTop)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.decisionHeight - before.decisionHeight)).toBeLessThanOrEqual(2);
}
async function submitWithoutScrolling(page: Page) {
  // This invokes the real form/button handler without Playwright scrolling the button into view.
  await page.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
}
async function expectCompletedPanelsAccessible(page: Page, count: number) {
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(count);
  await expect(page.locator(".preview-image")).toHaveCount(0);
  for (let index = 0; index < count; index++) {
    const panel = page.locator(".generated-panel").nth(index);
    await expect(panel.getByRole("img")).toHaveCount(1);
    const accessible = await panel.ariaSnapshot();
    expect(accessible).not.toContain("Illustrating this moment");
    expect(accessible).not.toContain("Keep reading. The scene will appear here.");
  }
}
async function observeImageStreamReads(page: Page) {
  await page.addInitScript(() => {
    const evidence: ImageStreamEvidence[] = [];
    (window as Window & { imageStreamEvidence?: ImageStreamEvidence[] }).imageStreamEvidence = evidence;
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method.toUpperCase() !== "POST" || !/\/panels\/[^/]+\/image$/.test(url.pathname)) return originalFetch.call(this, input, init);
      const observed: ImageStreamEvidence = { url: url.href, status: null, ok: false, eof: false, settledRecords: 0, readErrors: [], fetchError: null };
      evidence.push(observed);
      let response: Response;
      try { response = await originalFetch.call(this, input, init); }
      catch (error) { observed.fetchError = error instanceof Error ? error.name : "UnknownError"; throw error; }
      observed.status = response.status; observed.ok = response.ok;
      if (!response.body) return response;
      const originalGetReader = response.body.getReader;
      Object.defineProperty(response.body, "getReader", { value: function (this: ReadableStream<Uint8Array>, ...args: unknown[]) {
        const reader = Reflect.apply(originalGetReader, this, args) as ReadableStreamDefaultReader<Uint8Array>;
        const originalRead = reader.read;
        const decoder = new TextDecoder(); let prefix = "";
        const finishLine = () => {
          // The route writes type first. Retain only a bounded record prefix;
          // never clone/tee the response or retain image/snapshot payloads.
          if (/^\s*\{\s*"type"\s*:\s*"settled"\s*[,}]/.test(prefix)) observed.settledRecords++;
          prefix = "";
        };
        const inspect = (text: string) => {
          let offset = 0;
          while (offset < text.length) {
            const newline = text.indexOf("\n", offset); const end = newline < 0 ? text.length : newline;
            prefix += text.slice(offset, Math.min(end, offset + Math.max(0, 64 - prefix.length)));
            if (newline < 0) break;
            finishLine(); offset = newline + 1;
          }
        };
        Object.defineProperty(reader, "read", { value: async function (this: ReadableStreamDefaultReader<Uint8Array>, ...readArgs: unknown[]) {
          let result: ReadableStreamReadResult<Uint8Array>;
          try { result = await Reflect.apply(originalRead, this, readArgs) as ReadableStreamReadResult<Uint8Array>; }
          catch (error) { observed.readErrors.push(error instanceof Error ? error.name : "UnknownError"); throw error; }
          if (result.done) { inspect(decoder.decode()); if (prefix) finishLine(); observed.eof = true; }
          else inspect(decoder.decode(result.value, { stream: true }));
          return result;
        } });
        // Return the original reader. cancel/releaseLock/closed and all read
        // arguments/results keep their native behavior and object identity.
        return reader;
      } });
      return response;
    };
  });
}

test.afterEach(async ({ request }) => { await control(request, {}); });

test("both decisions append in place with mocked provider previews, stable scroll, independent images and durable ending", async ({ page, request, browser }, info) => {
  await control(request, { scriptDelay: 500, imageDelay: 1800, reverseImages: true, streamPreviews: true });
  const beforeCalls = await stats(request);
  const activeImageRequests = new Set<Request>(); let finishedImageRequests = 0, failedImageRequests = 0;
  const nativeImageFailures: { url: string; error: string | null }[] = [];
  await observeImageStreamReads(page);
  const isImageRequest = (item: Request) => item.method() === "POST" && /\/panels\/[^/]+\/image$/.test(item.url());
  page.on("request", item => { if (isImageRequest(item)) activeImageRequests.add(item); });
  page.on("requestfinished", item => { if (isImageRequest(item)) { activeImageRequests.delete(item); finishedImageRequests++; } });
  page.on("requestfailed", item => { if (isImageRequest(item)) { activeImageRequests.delete(item); failedImageRequests++; nativeImageFailures.push({ url: item.url(), error: item.failure()?.errorText ?? null }); } });
  await page.goto("/"); await page.getByRole("button", { name: "Begin the story" }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/); const url = page.url();
  await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await remember(page, 0);
  const observations: Measurement[] = [await measure(page, "first-before-submit")];
  let navigations = 0; page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  await submitWithoutScrolling(page);
  observations.push(await measure(page, "first-submitted"));
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeAttached();
  await expect.poll(async () => (await stats(request)).images - beforeCalls.images).toBe(2);
  observations.push(await measure(page, "first-dialogue"));
  await saveMeasurements("continuous-reader-measurements", observations, info);
  // Baseline fails here: scrollIntoView moves the reader and the decision jumps below the new chapter.
  unchanged(observations[0], observations[1]); unchanged(observations[0], observations[2]);
  expect(navigations).toBe(0);
  expect(observations[2].panels[0].top).toBeGreaterThan(observations[2].decisionTop + observations[2].decisionHeight);
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".preview-image")).toHaveCount(2);
  const partial = await snapshot(request, url);
  expect(partial.panels.every(panel => panel.status !== "complete" && panel.image_path === null)).toBe(true);
  observations.push(await measure(page, "first-previews"));
  unchanged(observations[0], observations.at(-1)!);
  await page.screenshot({ path: "test-results-engine/poc05/first-previews-desktop.png", fullPage: true });
  await expect(page.locator(".book-panel").nth(1).locator(".generated-image")).toHaveCount(1);
  await expect(page.locator(".book-panel").nth(0).locator(".generated-image")).toHaveCount(0);
  observations.push(await measure(page, "second-panel-finished-first"));
  await expect(page.locator(".generated-image")).toHaveCount(2);
  await expect(page.locator(".preview-image")).toHaveCount(0);
  observations.push(await measure(page, "first-complete"));
  for (const observation of observations.slice(3)) {
    unchanged(observations[0], observation);
    expect(observation.panels).toEqual(observations[2].panels);
  }
  const firstSaved = await snapshot(request, url);
  const firstPaths = firstSaved.panels.map(panel => panel.image_path);
  await expect(page.locator(".book-decision")).toHaveCount(2);
  await expect(page.locator(".book-decision").nth(0).locator("textarea")).toHaveValue("Destroy it with a hammer.");
  const next = await page.locator(".book-decision").nth(1).boundingBox();
  expect(next!.y + observations.at(-1)!.scroll).toBeGreaterThan(observations[2].panels[1].top + observations[2].panels[1].height);
  await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");

  await page.getByRole("radio", { name: "Leave the broken core and escape the blind cameras" }).check();
  await remember(page, 1); const secondStart = await measure(page, "second-before-submit"); observations.push(secondStart);
  await submitWithoutScrolling(page); observations.push(await measure(page, "second-submitted"));
  await expect(page.getByText("A broken core. Blind cameras. My way out.", { exact: true })).toBeAttached();
  observations.push(await measure(page, "second-dialogue"));
  await expect(page.locator(".generated-image")).toHaveCount(2);
  await expect(page.locator(".preview-image")).toHaveCount(2);
  observations.push(await measure(page, "second-previews"));
  await expect(page.locator(".book-panel").nth(3).locator(".generated-image")).toHaveCount(1);
  await expect(page.locator(".book-panel").nth(2).locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".generated-image")).toHaveCount(4);
  await expect.poll(() => page.locator(".generated-image").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await expectCompletedPanelsAccessible(page, 4);
  await expect(page.getByText("A story only you could tell.")).toBeAttached();
  observations.push(await measure(page, "ending"));
  for (const observation of observations.slice(observations.indexOf(secondStart) + 1)) unchanged(secondStart, observation);
  expect(navigations).toBe(0);
  await expect(page.locator(".book-decision")).toHaveCount(2);
  const completed = await snapshot(request, url); expect(completed.run.status).toBe("ended");
  expect(completed.panels.slice(0, 2).map(panel => panel.image_path)).toEqual(firstPaths);
  const generated = await stats(request);
  expect(generated.scripts - beforeCalls.scripts).toBe(2); expect(generated.images - beforeCalls.images).toBe(4);
  expect(generated.streamedImages - beforeCalls.streamedImages).toBe(4); expect(generated.previews - beforeCalls.previews).toBe(4);
  expect(generated.completedImages.slice(beforeCalls.completedImages.length)).toEqual([2, 1, 2, 1]);
  await expect.poll(() => page.evaluate(() => (window as Window & { imageStreamEvidence?: ImageStreamEvidence[] }).imageStreamEvidence?.filter(item => item.eof).length)).toBe(4);
  const streams = await page.evaluate(() => (window as Window & { imageStreamEvidence?: ImageStreamEvidence[] }).imageStreamEvidence ?? []);
  expect(streams).toHaveLength(4);
  for (const stream of streams) {
    expect(stream.ok).toBe(true); expect(stream.status).toBe(200);
    expect(stream.eof).toBe(true); expect(stream.settledRecords).toBe(1);
    expect(stream.readErrors).toEqual([]); expect(stream.fetchError).toBeNull();
  }
  await expect(page.locator(".book-recovery[role='alert']")).toHaveCount(0);
  await expect(page.getByText("Last request:", { exact: false })).toHaveCount(0);
  await expect.poll(() => activeImageRequests.size).toBe(0);
  expect(finishedImageRequests + failedImageRequests).toBe(4);
  // Chrome can report ERR_ABORTED after a fetch stream was fully consumed:
  // https://github.com/microsoft/playwright/issues/42742. Tolerate only that
  // transport event, paired with this exact response's successful body EOF.
  for (const failure of nativeImageFailures) {
    expect(failure.error).toBe("net::ERR_ABORTED");
    expect(streams.find(stream => stream.url === failure.url)).toMatchObject({ ok: true, eof: true, settledRecords: 1, readErrors: [], fetchError: null });
  }
  const transportEvidence = { finishedImageRequests, failedImageRequests, activeImageRequests: activeImageRequests.size, nativeImageFailures, streams };
  writeFileSync("test-results-engine/poc05/stream-transport-evidence.json", JSON.stringify(transportEvidence, null, 2));
  await info.attach("image-stream-transport-evidence", { body: JSON.stringify(transportEvidence, null, 2), contentType: "application/json" });
  await saveMeasurements("continuous-reader-measurements", observations, info);
  await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");
  await page.screenshot({ path: "test-results-engine/poc05/complete-story-desktop.png", fullPage: true });
  await page.locator(".book-developer > summary").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download run diagnostics" }).click()]);
  const diagnostics = JSON.parse(readFileSync((await download.path())!, "utf8")) as { browser_observations_this_visit: ReaderObservation[] };
  const timings = diagnostics.browser_observations_this_visit;
  expect(timings).toHaveLength(2);
  for (const chapter of timings) {
    expect(chapter.browser_text_ready_ms).toBeGreaterThanOrEqual(chapter.narrative_response_ms);
    expect(chapter.browser_visual_complete_ms).toBeGreaterThan(chapter.browser_text_ready_ms);
    expect(Object.values(chapter.images)).toHaveLength(2);
    for (const [id, image] of Object.entries(chapter.images)) {
      expect(image.operation_id).toBe(completed.panels.find(panel => panel.id === id)?.operation_id);
      expect(image.request_start_ms).toBeGreaterThanOrEqual(chapter.browser_text_ready_ms);
      expect(image.first_preview_received_ms).toBeGreaterThan(image.request_start_ms);
      expect(image.first_preview_visible_ms).toBeGreaterThanOrEqual(image.first_preview_received_ms!);
      expect(image.decoded_ms).toBeGreaterThan(image.first_preview_received_ms!);
      expect(image.visual_complete_ms).toBeGreaterThanOrEqual(image.decoded_ms!);
      expect(image.decode_after_load_ms).toBeGreaterThanOrEqual(0);
      expect(image.request_ms).toBeGreaterThan(0);
    }
  }
  writeFileSync("test-results-engine/poc05/mocked-browser-timings.json", JSON.stringify(timings, null, 2));
  await page.locator(".book-developer > summary").click();
  await page.reload(); await expect(page.locator(".generated-image")).toHaveCount(4);
  expect(await stats(request)).toEqual(generated);
  // All paid-operation streams finished above. Close the now-idle browser visit
  // so speculative zero-byte Chrome sockets cannot hold Next's graceful shutdown.
  // Restart and restore in a fresh browser context, without killing active work.
  await page.waitForLoadState("networkidle");
  await page.context().close();
  const restartStarted = Date.now();
  expect((await request.post(`${runtime().mockURL}/__restart`, { timeout: 15_000 })).ok()).toBe(true);
  writeFileSync("test-results-engine/poc05/restart-evidence.json", JSON.stringify({ finishedImageRequests, failedImageRequests, activeImageRequests: activeImageRequests.size, restartMs: Date.now() - restartStarted }, null, 2));
  const restored = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  try {
    await restored.goto(url); await expect(restored.locator(".generated-image")).toHaveCount(4);
    expect(await stats(request)).toEqual(generated);
    expect((await snapshot(request, url)).panels.map(panel => panel.image_path)).toEqual(completed.panels.map(panel => panel.image_path));
    await expectCompletedPanelsAccessible(restored, 4);
    await expect(restored.locator(".book-developer")).not.toHaveAttribute("open", "");
    expect(await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await restored.screenshot({ path: "test-results-engine/poc05/complete-story-1024.png", fullPage: true });
    expect(await stats(request)).toEqual(generated);
  } finally { await restored.close(); }
});

test("a truncated preview stream stays incomplete and only explicit retry replaces the failed illustration", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await control(request, { scriptDelay: 200, imageDelay: 700, streamPreviews: true, truncateSecondStream: true });
  const before = await stats(request);
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  const fresh = SnapshotSchema.parse(await response.json()); const url = `/run/${fresh.run.id}`;
  await page.goto(url); await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await remember(page, 0); const initial = await measure(page, "before-submit");
  await submitWithoutScrolling(page);
  await expect(page.locator(".preview-image")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Try this illustration again" })).toBeEnabled();
  const failed = await snapshot(request, url); expect(failed.panels.map(panel => panel.status)).toEqual(["complete", "failed"]);
  expect(failed.panels[1].image_path).toBeNull(); expect(failed.summary.unknown_cost_attempts).toBe(1);
  await expect(page.locator(".generated-image")).toHaveCount(1);
  const failedCounts = await stats(request); expect(failedCounts.images - before.images).toBe(2);
  const failurePosition = await measure(page, "stream-interrupted"); unchanged(initial, failurePosition);
  await saveMeasurements("stream-failure-measurements", [initial, failurePosition], info);
  await page.screenshot({ path: "test-results-engine/poc05/interrupted-preview-desktop.png", fullPage: true });
  await page.reload(); await expect(page.locator(".generated-image")).toHaveCount(1);
  await expect(page.locator(".preview-image")).toHaveCount(0); expect(await stats(request)).toEqual(failedCounts);
  await control(request, { imageDelay: 700, streamPreviews: true });
  await page.getByRole("button", { name: "Try this illustration again" }).click();
  await expect(page.locator(".generated-image")).toHaveCount(2);
  await expectCompletedPanelsAccessible(page, 2);
  const recovered = await snapshot(request, url);
  expect(recovered.panels[0].image_path).toBe(failed.panels[0].image_path);
  expect(recovered.nodes[0].chapter).toEqual(failed.nodes[0].chapter);
  const after = await stats(request); expect(after.images - before.images).toBe(3); expect(after.scripts - before.scripts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a failed narrative keeps its selected decision in place through explicit recovery", async ({ page, request }, info) => {
  await control(request, { scriptDelay: 300, imageDelay: 400, invalidScript: true });
  const before = await stats(request);
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  const fresh = SnapshotSchema.parse(await response.json()); const url = `/run/${fresh.run.id}`;
  await page.goto(url); await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await remember(page, 0); const initial = await measure(page, "before-submit");
  await submitWithoutScrolling(page);
  await expect(page.getByRole("button", { name: "Try this part again" })).toBeEnabled();
  const failed = await measure(page, "narrative-failed"); unchanged(initial, failed);
  await expect(page.locator(".book-decision[data-submitted='true']")).toHaveCount(1);
  await expect(page.locator(".book-decision").locator("textarea")).toHaveValue("Destroy it with a hammer.");
  const counters = await stats(request); expect(counters.scripts - before.scripts).toBe(1); expect(counters.images).toBe(before.images);
  await control(request, { imageDelay: 400 });
  await page.getByRole("button", { name: "Try this part again" }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".generated-image")).toHaveCount(2);
  const recovered = await measure(page, "narrative-recovered"); unchanged(initial, recovered);
  expect(recovered.panels[0].top).toBeGreaterThan(recovered.decisionTop + recovered.decisionHeight);
  await saveMeasurements("narrative-recovery-measurements", [initial, failed, recovered], info);
  const after = await stats(request); expect(after.scripts - before.scripts).toBe(2); expect(after.images - before.images).toBe(2);
  await page.reload(); await expect(page.locator(".generated-image")).toHaveCount(2); expect(await stats(request)).toEqual(after);
});
