import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";

const screenshots = "test-results-live/poc-08-5/screenshots";
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<{ scripts: number; images: number }> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function createRun(request: APIRequestContext) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  expect(response.ok()).toBe(true); return SnapshotSchema.parse(await response.json());
}
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function sameDocument(page: Page) {
  expect(await page.evaluate(() => (window as Window & { navigationDocument?: Element }).navigationDocument === document.documentElement)).toBe(true);
}
async function assertHeader(page: Page) {
  const header = page.locator(".book-header");
  await expect(header).toBeVisible(); await expect(header).toHaveCSS("position", "sticky");
  const bounds = await header.boundingBox(); expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.y)).toBeLessThanOrEqual(1);
  expect(bounds!.height).toBeLessThanOrEqual(112);
  for (const [name, href] of [["Library", "/"], ["Saved stories", "/saved"], ["Create a story", "/studio"], ["About", "/about"]]) {
    const link = header.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible(); await expect(link).toHaveAttribute("href", href);
    expect(await link.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function capture(page: Page, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; }); await frames(page);
  await page.screenshot({ path: `${screenshots}/${name}.png`, animations: "disabled" });
}

test.beforeEach(async ({ request }) => {
  mkdirSync(screenshots, { recursive: true });
  expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => { expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true); });

for (const width of [1440, 1024, 390]) {
  test(`navigation stays accessible on every main route at ${width}px without generation`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    const run = await createRun(request), before = await stats(request);
    const routes = ["/", "/saved", "/studio", "/about", "/story/neon-protocol", "/story/last-lightkeeper", `/run/${run.run.id}`, "/experiment"];
    for (const route of routes) {
      await page.goto(route); await page.evaluate(async () => { await document.fonts.ready; });
      await page.evaluate(() => window.scrollTo({ top: Math.min(700, document.documentElement.scrollHeight - innerHeight), behavior: "instant" }));
      await frames(page); await assertHeader(page);
      if (route === "/") await capture(page, `sticky-library-${width}`);
      if (route === "/studio") await capture(page, `sticky-studio-${width}`);
      if (route === "/experiment") {
        await expect(page.getByRole("button", { name: "Generate Continuation", exact: true })).toBeAttached();
        await capture(page, `sticky-experiment-${width}`);
      }
    }
    await page.evaluate(() => Object.assign(window, { navigationDocument: document.documentElement }));
    for (const [name, path] of [["Library", "/"], ["Saved stories", "/saved"], ["Create a story", "/studio"], ["About", "/about"]]) {
      await page.locator(".book-header").getByRole("link", { name, exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      await assertHeader(page); await sameDocument(page);
      const heading = await page.locator("main h1").first().boundingBox();
      const header = await page.locator(".book-header").boundingBox();
      expect(heading!.y).toBeGreaterThanOrEqual(header!.height);
    }
    expect(await stats(request)).toEqual(before);
  });
}

test("About actions have consistent spacing and hash navigation clears the sticky header", async ({ page, request }) => {
  const before = await stats(request);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    await page.goto("/about");
    const gaps = await page.locator(".about-main section > a").evaluateAll(links => links.map(link => {
      const paragraph = link.previousElementSibling;
      if (!paragraph || paragraph.tagName !== "P") throw new Error("About action lost its descriptive paragraph.");
      return link.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom;
    }));
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) { expect(gap).toBeGreaterThanOrEqual(16); expect(gap).toBeLessThanOrEqual(24); }
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThanOrEqual(1);
    await page.locator(".about-main section").first().evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
    await capture(page, `about-spacing-${width}`);
    await page.evaluate(() => Object.assign(window, { navigationDocument: document.documentElement }));
    await page.getByRole("link", { name: "Find your next story", exact: true }).click();
    await expect(page).toHaveURL(/\/#stories$/); await frames(page); await sameDocument(page);
    const heading = await page.locator("#stories").boundingBox(), header = await page.locator(".book-header").boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(header!.height);
    await assertHeader(page);
    await page.locator(".book-header").getByRole("link", { name: "About", exact: true }).click();
    await page.getByRole("link", { name: "Visit your saved stories", exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/); await sameDocument(page);
  }
  expect(await stats(request)).toEqual(before);
});

test("sticky navigation preserves reader image, compaction and history-restoration anchors", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await request.post(`${runtime().mockURL}/__control`, { data: { scriptDelay: 80, imageDelay: 1400, reverseImages: true } });
  const run = await createRun(request), before = await stats(request), url = `/run/${run.run.id}`;
  await page.goto(url);
  const decision = page.locator(".book-decision[data-step='1']");
  await decision.getByRole("radio", { name: "Destroy the device" }).check();
  await decision.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await decision.evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await frames(page); await assertHeader(page);
  expect((await decision.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator(".book-header").boundingBox())!.height);
  await page.evaluate(() => Object.assign(window, { navigationDocument: document.documentElement, anchoredReader: document.querySelector(".saved-reader") }));
  await decision.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeAttached();
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await decision.locator("textarea").evaluate(input => (input as HTMLTextAreaElement).focus({ preventScroll: true }));
  const panel = page.locator(".book-panel").nth(1).locator(".panel-canvas");
  await panel.evaluate(element => { Object.assign(window, { anchoredPanel: element }); element.scrollIntoView({ block: "start", behavior: "instant" }); });
  await frames(page);
  const pending = await panel.boundingBox(); expect(pending).not.toBeNull();
  const headerHeight = (await page.locator(".book-header").boundingBox())!.height;
  expect(pending!.y).toBeGreaterThanOrEqual(headerHeight);
  await expect(panel.locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect(page.locator(".book-decision[data-step='2']")).toBeAttached();
  await frames(page);
  const illustrated = await panel.boundingBox();
  expect(Math.abs(illustrated!.y - pending!.y)).toBeLessThanOrEqual(2);
  expect([illustrated!.width, illustrated!.height]).toEqual([pending!.width, pending!.height]);
  await expect(decision).toHaveAttribute("data-compact", "false");
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollBy({ top: 1, behavior: "instant" }); });
  await expect(decision).toHaveAttribute("data-compact", "true"); await frames(page);
  expect(Math.abs((await panel.boundingBox())!.y - illustrated!.y)).toBeLessThanOrEqual(2);
  await expect(page.locator(".saved-reader")).not.toHaveCSS("overflow-anchor", "none");
  expect(await page.evaluate(() => {
    const memory = window as Window & { anchoredReader?: Element; anchoredPanel?: Element };
    return memory.anchoredReader === document.querySelector(".saved-reader") && memory.anchoredPanel === document.querySelectorAll(".book-panel .panel-canvas")[1];
  })).toBe(true);
  await sameDocument(page); await assertHeader(page); await capture(page, "sticky-reader-1440");
  const restoredY = (await panel.boundingBox())!.y;
  const generated = await stats(request);
  expect(generated.scripts - before.scripts).toBe(1); expect(generated.images - before.images).toBe(2);
  const about = page.locator(".book-header").getByRole("link", { name: "About", exact: true });
  const hitbox = await about.boundingBox(); expect(hitbox).not.toBeNull();
  expect(await about.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  // Locator.click's preparatory scrollIntoView moves this already-visible
  // sticky link's document by 508px in Chrome. A real pointer click avoids
  // changing the reading position that Back is supposed to restore.
  await page.mouse.click(hitbox!.x + hitbox!.width / 2, hitbox!.y + hitbox!.height / 2);
  await expect(page).toHaveURL(/\/about$/); await sameDocument(page);
  await page.goBack(); await expect(page).toHaveURL(new RegExp(`${url}$`));
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect.poll(async () => Math.abs((await panel.boundingBox())!.y - restoredY)).toBeLessThanOrEqual(2);
  await sameDocument(page); await assertHeader(page);
  expect(await stats(request)).toEqual(generated);
});
