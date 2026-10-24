import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number; previews: number };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function control(request: APIRequestContext, data: Record<string, boolean | number>) {
  expect((await request.post(`${runtime().mockURL}/__control`, { data })).ok()).toBe(true);
}
async function openRun(page: Page, request: APIRequestContext) {
  const response = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  expect(response.ok()).toBe(true);
  const saved = SnapshotSchema.parse(await response.json());
  await page.goto(`/run/${saved.run.id}`);
  await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  return saved.run.id;
}
async function submit(page: Page) {
  // Avoid Playwright scrolling the control when checking the reader's own stability.
  await page.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
}
async function geometry(page: Page) {
  return page.locator(".book-panel .panel-canvas").evaluateAll(panels => ({ scroll: scrollY, panels: panels.map(panel => {
    const bounds = panel.getBoundingClientRect();
    return { top: bounds.top + scrollY, width: bounds.width, height: bounds.height };
  }) }));
}

test.afterEach(async ({ request }) => { await control(request, {}); });

test("honest no-preview fallback keeps dialogue readable and panel geometry stable until independent final images", async ({ page, request }) => {
  await control(request, { scriptDelay: 900, imageDelay: 2000, reverseImages: true, streamPreviews: false });
  const before = await stats(request);
  await openRun(page, request);
  await submit(page);
  await expect(page.getByRole("status")).toContainText("Writing the next part of your story…");
  await expect(page.locator(".book-panel")).toHaveCount(0);
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeAttached();
  await expect(page.locator(".generated-image, .preview-image")).toHaveCount(0);
  const panels = page.locator(".book-panel");
  await expect(panels).toHaveCount(2);
  await expect(panels.first().getByText("Illustrating this moment…", { exact: true })).toBeVisible();
  // The composition is original decoration, never a fabricated image preview or a progress meter.
  await expect(panels.first().locator(".generation-composition")).toHaveAttribute("aria-hidden", "true");
  await expect(panels.first().getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  expect(await panels.first().ariaSnapshot()).toContain("You don't get to follow me.");
  const waiting = await geometry(page);
  await expect(panels.nth(1).locator(".generated-image.is-ready")).toHaveCount(1);
  await expect(panels.first().locator(".generated-image")).toHaveCount(0);
  expect(await geometry(page)).toEqual(waiting);
  await expect(panels.first().locator(".generated-image.is-ready")).toHaveCount(1);
  expect(await geometry(page)).toEqual(waiting);
  await expect(page.locator(".preview-image")).toHaveCount(0);
  await expect(panels.first().locator(".generated-image")).toHaveCSS("animation-duration", "0.22s");
  for (const panel of await panels.all()) {
    expect(await panel.ariaSnapshot()).not.toContain("Illustrating this moment");
    await expect(panel.getByRole("img")).toHaveCount(1);
  }
  await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");
  const after = await stats(request);
  expect(after.scripts - before.scripts).toBe(1);
  expect(after.images - before.images).toBe(2);
  expect(after.previews - before.previews).toBe(0);
});

test("a failed illustration stays understandable and only its explicit retry generates again", async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await control(request, { imageDelay: 400, failSecond: true, streamPreviews: false });
  const before = await stats(request);
  const runId = await openRun(page, request);
  await submit(page);
  const panels = page.locator(".book-panel");
  await expect(panels.first().locator(".generated-image.is-ready")).toHaveCount(1);
  const retry = page.getByRole("button", { name: "Try this illustration again" });
  await expect(retry).toBeEnabled();
  await expect(panels.nth(1).getByText("This illustration couldn’t be finished", { exact: true })).toBeVisible();
  await expect(panels.nth(1).getByText("Your dialogue is still here.", { exact: true })).toBeVisible();
  await expect(panels.nth(1).getByText("The cameras stopped. Now I choose.", { exact: true })).toBeVisible();
  await expect(page.locator(".preview-image")).toHaveCount(0);
  await expect(panels.nth(1).locator(".generation-composition")).toHaveCSS("animation-name", "none");
  const failed = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(failed.panels.map(panel => panel.status)).toEqual(["complete", "failed"]);
  const afterFailure = await stats(request);
  expect(afterFailure.scripts - before.scripts).toBe(1);
  expect(afterFailure.images - before.images).toBe(2);
  await control(request, { imageDelay: 200 });
  await retry.evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
  await expect(retry).toHaveCount(0);
  const final = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(final.panels[0].image_path).toBe(failed.panels[0].image_path);
  expect(final.panels[1].image_path).not.toBeNull();
  const afterRetry = await stats(request);
  expect(afterRetry.scripts).toBe(afterFailure.scripts);
  expect(afterRetry.images - afterFailure.images).toBe(1);
  expect(await panels.first().locator(".generated-image").evaluate(image => parseFloat(getComputedStyle(image).animationDuration))).toBeLessThan(0.001);
});
