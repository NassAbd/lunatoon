import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number; previews: number };
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
  const response = await request.get(`/api/runs/${id}`);
  expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
async function finishChapter(request: APIRequestContext, run: Snapshot, choiceId: string, instruction: string) {
  const response = await request.post(`/api/runs/${run.run.id}/nodes`, { data: { operation_id: randomUUID(), choice_id: choiceId, instruction } });
  expect(response.ok()).toBe(true);
  const written = SnapshotSchema.parse(await response.json());
  const pending = written.panels.filter(panel => panel.status === "pending");
  expect(pending).toHaveLength(2);
  const images = await Promise.all(pending.map(panel => request.post(`/api/runs/${run.run.id}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id, retry: false } })));
  expect(images.every(image => image.ok())).toBe(true);
  const saved = await readRun(request, run.run.id);
  expect(saved.panels.every(panel => panel.status === "complete")).toBe(true);
  return saved;
}
async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ request }) => {
  mkdirSync("test-results-engine/poc06", { recursive: true });
  await control(request, {});
});
test.afterEach(async ({ request }) => { await control(request, {}); });

test("the light library offers one playable story, an honest preview and working navigation without generation", async ({ page, request }) => {
  const before = await stats(request);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Every story starts with a choice." })).toBeVisible();
  await expect(page.locator(".story-reader")).toHaveCSS("background-color", "rgb(250, 250, 247)");
  const neon = page.locator("article[data-story='neon-protocol']");
  const preview = page.locator("article[data-story='last-lightkeeper']");
  await expect(neon.getByRole("heading", { name: "Neon Protocol", exact: true })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "The Last Lightkeeper", exact: true })).toBeVisible();
  await expect(neon.getByRole("button", { name: "Begin the story", exact: true })).toBeEnabled();
  await expect(preview.getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: /begin|play|start|read/i })).toHaveCount(0);
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Library", exact: true })).toHaveAttribute("href", "/");
  await expect(header.getByRole("link", { name: "Saved stories", exact: true })).toHaveAttribute("href", "/saved");
  await expect(header.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "/about");
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results-engine/poc06/library-${width}.png`, animations: "disabled" });
    await page.locator(".library-saved").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results-engine/poc06/library-saved-${width}.png`, animations: "disabled" });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await neon.getByRole("button", { name: "Begin the story", exact: true }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  const firstUrl = page.url();
  const newlySaved = await readRun(request, firstUrl.split("/").at(-1)!);
  expect(newlySaved.nodes).toHaveLength(0);
  expect(newlySaved.panels).toHaveLength(0);
  await expect(page.getByRole("radio")).toHaveCount(3);
  expect(await stats(request)).toEqual(before);

  await page.goto("/story/neon-protocol");
  await expect(page.getByRole("heading", { level: 1, name: "Neon Protocol", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Story opening" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin the story", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Begin the story", exact: true }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  expect(page.url()).not.toBe(firstUrl);
  await page.locator("header").getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const experiment = await page.goto("/experiment");
  expect(experiment?.ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Generate Continuation", exact: true })).toBeVisible();
  expect(await stats(request)).toEqual(before);
});

test("saved stories resume stable local URLs and reread a complete mocked story without regeneration", async ({ page, request }) => {
  await control(request, { imageDelay: 120, scriptDelay: 50 });
  const before = await stats(request);
  const fresh = await createRun(request);
  const first = await finishChapter(request, fresh, "investigate", "A mysterious cyborg cat suddenly appears.");
  const nextChoice = first.nodes[0].chapter!.next_decision.options[0].id;
  const completed = await finishChapter(request, first, nextChoice, "");
  expect(completed.run.status).toBe("ended");
  expect(completed.panels).toHaveLength(4);
  const incomplete = await createRun(request);
  const generated = await stats(request);
  expect(generated.scripts - before.scripts).toBe(2);
  expect(generated.images - before.images).toBe(4);

  // Visiting or hovering saved links must not prefetch a reader or claim work.
  const prefetchedReaders: string[] = [];
  let inspectingSaved = true;
  page.on("request", item => {
    if (inspectingSaved && item.method() === "GET" && /^\/run\/[^/]+$/.test(new URL(item.url()).pathname)) prefetchedReaders.push(item.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/saved");
  await expect(page.locator("main")).toContainText(/this computer|this device|local/i);
  const finishedCard = page.locator(`[data-run-id='${completed.run.id}']`);
  const activeCard = page.locator(`[data-run-id='${incomplete.run.id}']`);
  await expect(finishedCard).toContainText("Neon Protocol");
  await expect(activeCard).toContainText("Neon Protocol");
  await expect(finishedCard).toContainText(/complete|finished|the end/i);
  await expect(activeCard).toContainText(/ready|start|begin|progress|continue|saved/i);
  const readAgain = finishedCard.getByRole("link", { name: /^Read again/ });
  const resume = activeCard.getByRole("link", { name: /^Resume story/ });
  await expect(readAgain).toHaveAttribute("href", `/run/${completed.run.id}`);
  await expect(resume).toHaveAttribute("href", `/run/${incomplete.run.id}`);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "test-results-engine/poc06/saved-1440.png", fullPage: true });
  await readAgain.hover();
  await page.waitForLoadState("networkidle");
  expect(prefetchedReaders).toEqual([]);
  expect(await stats(request)).toEqual(generated);
  inspectingSaved = false;
  await readAgain.click();
  await expect(page).toHaveURL(new RegExp(`/run/${completed.run.id}$`));
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  await expect(page.getByText("A story only you could tell.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
  const reloaded = await readRun(request, completed.run.id);
  expect(reloaded.panels.map(panel => panel.image_path)).toEqual(completed.panels.map(panel => panel.image_path));
  expect(reloaded.nodes.map(node => node.chapter)).toEqual(completed.nodes.map(node => node.chapter));
  expect(await stats(request)).toEqual(generated);

  await page.locator("header").getByRole("link", { name: "Saved stories", exact: true }).click();
  await expect(page).toHaveURL(/\/saved$/);
  await page.locator(`[data-run-id='${incomplete.run.id}']`).getByRole("link", { name: /^Resume story/ }).click();
  await expect(page).toHaveURL(new RegExp(`/run/${incomplete.run.id}$`));
  await expect(page.getByRole("radio")).toHaveCount(3);
  await expect(page.locator(".generated-panel")).toHaveCount(0);
  expect((await readRun(request, incomplete.run.id)).nodes).toHaveLength(0);
  expect(await stats(request)).toEqual(generated);
});
