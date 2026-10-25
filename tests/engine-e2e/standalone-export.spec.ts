import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; scripts: number; images: number };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
}
async function readRun(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/runs/${id}`);
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function writeChapter(request: APIRequestContext, run: Snapshot, choiceId: string, instruction: string) {
  const response = await request.post(`/api/runs/${run.run.id}/nodes`, {
    data: { operation_id: randomUUID(), choice_id: choiceId, instruction },
  });
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function illustrateChapter(request: APIRequestContext, run: Snapshot) {
  const pending = run.panels.filter(panel => panel.status === "pending");
  expect(pending).toHaveLength(2);
  const responses = await Promise.all(pending.map(panel => request.post(`/api/runs/${run.run.id}/panels/${panel.id}/image`, {
    data: { operation_id: panel.operation_id, retry: false },
  })));
  expect(responses.every(response => response.ok())).toBe(true);
  return readRun(request, run.run.id);
}
async function expectIncompleteExport(request: APIRequestContext, runId: string) {
  const response = await request.get(`/api/runs/${runId}/export`);
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "export_not_complete" } });
}

test.afterEach(async ({ request }) => { await control(request, {}); });

test("a completed story downloads with its saved artwork and choices and reads entirely offline without generation", async ({ page, browser, request }) => {
  await control(request, { imageDelay: 100, scriptDelay: 50 });
  const before = await stats(request);
  const created = await request.post("/api/runs", {
    data: { operation_id: randomUUID(), approach: "reference", template_id: "last-lightkeeper", template_version: 1 },
  });
  expect(created.ok()).toBe(true);
  const initial = SnapshotSchema.parse(await created.json());
  const runId = initial.run.id;
  const exportUrl = `/api/runs/${runId}/export`;
  await expectIncompleteExport(request, runId);
  await page.goto(`/run/${runId}`);
  await expect(page.getByRole("link", { name: "Download story", exact: true })).toHaveCount(0);
  expect(await stats(request)).toEqual(before);

  const firstTwist = 'The sea answers "Mara" & the lantern glows beside <three> reflections.';
  const first = await illustrateChapter(request, await writeChapter(request, initial, "inspect_lens", firstTwist));
  const secondTwist = "Keep the causeway safe for the people returning home.";
  const finalScript = await writeChapter(request, first, first.nodes[0].chapter!.next_decision.options[0].id, secondTwist);
  expect(finalScript.run.status).toBe("ended");
  expect(finalScript.panels.filter(panel => panel.status === "complete")).toHaveLength(2);
  // An ending script alone is not a downloadable illustrated story.
  await expectIncompleteExport(request, runId);
  const completed = await illustrateChapter(request, finalScript);
  expect(completed.panels).toHaveLength(4);
  expect(completed.panels.every(panel => panel.status === "complete")).toBe(true);
  const generated = await stats(request);
  expect(generated.scripts - before.scripts).toBe(2);
  expect(generated.images - before.images).toBe(4);
  expect(generated.foundations).toBe(before.foundations);

  const crossSiteHeaders: Record<string, string>[] = [{ Origin: "https://unrelated.example" }, { "Sec-Fetch-Site": "cross-site" }];
  for (const headers of crossSiteHeaders) {
    expect((await request.get(exportUrl, { headers })).status()).toBe(403);
  }
  expect((await request.get(`/api/runs/${randomUUID()}/export`)).status()).toBe(404);
  const exported = await request.get(exportUrl);
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-type"]).toMatch(/^text\/html.*charset=utf-8/i);
  expect(exported.headers()["content-disposition"]).toBe('attachment; filename="the-last-lightkeeper-lunatoon.html"');
  expect(exported.headers()["cache-control"]).toContain("no-store");
  expect(exported.headers()["x-content-type-options"]).toBe("nosniff");
  expect(exported.headers()["content-security-policy"]).toContain("script-src 'none'");

  await page.reload();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toHaveAttribute("data-artwork", "complete");
  const downloadLink = page.getByRole("link", { name: "Download story", exact: true });
  await expect(downloadLink).toHaveAttribute("href", exportUrl);
  const downloaded = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("the-last-lightkeeper-lunatoon.html");
  expect(await download.failure()).toBeNull();
  const directory = resolve("test-results-live/poc-08/export");
  mkdirSync(directory, { recursive: true });
  const filePath = resolve(directory, download.suggestedFilename());
  await download.saveAs(filePath);
  const html = readFileSync(filePath, "utf8");
  expect(html).toBe(await exported.text());
  expect(html).not.toMatch(/<\s*(?:script|iframe|object|embed|form|link)\b/i);
  expect(html).not.toMatch(/\b(?:OPENAI_API_KEY|request_id|operation_id|image_prompt|estimated_micro_usd|Developer details)\b/);
  expect(html).not.toContain("/api/");
  const privateValues = [
    completed.run.id, completed.run.operation_id,
    ...completed.nodes.flatMap(node => [node.id, node.operation_id]),
    ...completed.panels.flatMap(panel => [panel.id, panel.operation_id, panel.image_path]),
    ...completed.bible.assets.map(asset => asset.path),
    ...completed.events.flatMap(event => [event.id, event.operation_id, event.metrics?.request_id, event.claim_token]),
  ].filter((value): value is string => Boolean(value));
  for (const value of privateValues) expect(html).not.toContain(value);

  const offline = await browser.newContext({ offline: true, serviceWorkers: "block", viewport: { width: 1440, height: 1100 } });
  const networkRequests: string[] = [];
  offline.on("request", item => { if (/^https?:/.test(item.url())) networkRequests.push(item.url()); });
  await offline.route(/^https?:\/\//, route => route.abort("blockedbyclient"));
  try {
    const reader = await offline.newPage();
    await reader.goto(pathToFileURL(filePath).href);
    await expect(reader.getByRole("heading", { level: 1, name: completed.bible.title, exact: true })).toBeVisible();
    await expect(reader.locator("script, iframe, object, embed, form, a, link")).toHaveCount(0);
    expect(await reader.evaluate(() => Array.from(document.querySelectorAll("*"))
      .flatMap(element => Array.from(element.attributes).filter(attribute => /^on/i.test(attribute.name)).map(attribute => attribute.name)))).toEqual([]);
    const expectedBeats = completed.bible.template!.opening_beats;
    const opening = reader.getByRole("region", { name: "Story opening", exact: true });
    await expect(opening.locator("figure")).toHaveCount(expectedBeats.length);
    for (const [index, beat] of expectedBeats.entries()) await expect(opening.locator("figure").nth(index)).toContainText(beat.caption);
    for (const node of completed.nodes.toSorted((left, right) => left.step - right.step)) {
      const chapter = reader.getByRole("region", { name: `Decision ${node.step}`, exact: true });
      await expect(chapter.getByRole("heading", { level: 2 })).toContainText(node.choice);
      await expect(chapter).toContainText(node.instruction);
      const panels = chapter.locator("figure.panel");
      await expect(panels).toHaveCount(2);
      for (const [index, panel] of node.chapter!.panels.entries()) {
        const dialogue = panels.nth(index).locator("figcaption.dialogues");
        for (const bubble of panel.dialogues) {
          await expect(dialogue).toContainText(bubble.character);
          await expect(dialogue).toContainText(bubble.text);
        }
      }
    }
    // DOM ordering, rather than matching text alone, preserves the saved reading sequence.
    expect(await reader.locator("section[aria-label]").evaluateAll(sections => sections.map(section => section.getAttribute("aria-label"))))
      .toEqual(expect.arrayContaining(["Story opening", "Decision 1", "Decision 2"]));
    const ordered = await reader.locator("section[aria-label]").evaluateAll(sections => sections.map(section => section.getAttribute("aria-label")));
    expect(ordered.indexOf("Story opening")).toBeLessThan(ordered.indexOf("Decision 1"));
    expect(ordered.indexOf("Decision 1")).toBeLessThan(ordered.indexOf("Decision 2"));
    await expect(reader.getByText("THE END", { exact: true })).toBeVisible();
    await expect(reader.locator("img")).toHaveCount(expectedBeats.length + 4);
    expect(await reader.locator("img").evaluateAll(images => images.every(image => /^data:image\/(?:png|jpeg);base64,/.test((image as HTMLImageElement).src)))).toBe(true);
    const decoded = await reader.locator("img").evaluateAll(async images => Promise.all(images.map(async element => {
      const image = element as HTMLImageElement; await image.decode();
      return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    })));
    expect(decoded).toEqual(Array(expectedBeats.length + 4).fill(true));
    expect(networkRequests).toEqual([]);
    for (const width of [1440, 1024]) {
      await reader.setViewportSize({ width, height: 1100 });
      expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await offline.close(); }
  expect(await readRun(request, runId)).toEqual(completed);
  expect(await stats(request)).toEqual(generated);
});
