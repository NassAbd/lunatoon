import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { SnapshotSchema } from "../../src/lib/story-engine/contracts";

test("four authored opening beats lead to three choices without generation or desktop overflow", async ({ page, request }) => {
  const { mockURL } = JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
  const before: unknown = await (await request.get(`${mockURL}/__stats`)).json();
  const created = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach: "reference" } });
  const saved = SnapshotSchema.parse(await created.json());
  await page.goto(`/run/${saved.run.id}`);
  await expect(page.getByRole("region", { name: "Story opening" })).toBeVisible();
  await expect(page.locator(".opening-beat")).toHaveCount(4);
  await expect(page.locator(".opening-beat").nth(0)).toContainText("New Kyoto, 2089");
  await expect(page.locator(".opening-beat").nth(1)).toContainText("Detective Kael");
  await expect(page.locator(".opening-beat").nth(2)).toContainText("It knows his name");
  await expect(page.locator(".opening-beat").nth(3)).toContainText("Every camera turns");
  await expect(page.getByRole("radio")).toHaveCount(3);
  await expect.poll(() => page.locator(".opening-beat img").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.querySelector(".book-decision")!.getBoundingClientRect().top > document.querySelector(".opening-beat:last-child")!.getBoundingClientRect().bottom)).toBe(true);
    await page.screenshot({ path: `test-results-engine/poc06/opening-${width}.png`, fullPage: true });
  }
  await page.reload();
  await expect(page.locator(".opening-beat")).toHaveCount(4);
  expect(await (await request.get(`${mockURL}/__stats`)).json()).toEqual(before);
});
