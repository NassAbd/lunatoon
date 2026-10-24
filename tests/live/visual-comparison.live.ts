import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test("one paid comparison: one shared script, two text images, two reference edits", async ({ page }) => {
  test.skip(process.env.LUNATOON_RUN_PAID_COMPARISON !== "1", "Opt in explicitly: at most 1 narrative + 4 image calls, no retries.");
  const directory = path.resolve("test-results-live/poc-02-live");
  await mkdir(directory, { recursive: true });
  const counts = { story: 0, text: 0, reference: 0 };
  const requests: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/story")) counts.story += 1;
    if (request.url().endsWith("/api/image")) {
      const data = request.postDataJSON() as { approach: "text" | "reference"; panel: Record<string, unknown> };
      counts[data.approach] += 1;
      requests.push(data);
    }
  });
  await page.goto("/");
  await page.getByRole("radio", { name: /Investigate its origin/ }).check();
  await page.getByLabel("MAKE IT YOURS").fill("A mysterious cyborg cat suddenly appears.");
  await page.getByLabel("VISUAL CONTINUITY EXPERIMENT").selectOption("text");
  await page.getByRole("button", { name: "Generate Continuation", exact: true }).click();
  await expect(page.locator(".continuation .speech-bubble").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Generate Continuation", exact: true })).toBeEnabled({ timeout: 180_000 });

  async function capture(approach: string) {
    for (const image of await page.locator(".continuation img.generated-image").all()) await expect(image).toHaveCSS("opacity", "1");
    await page.screenshot({ path: path.join(directory, `${approach}-reader.png`), fullPage: true });
    const sources = await page.locator(".continuation img.generated-image").evaluateAll((images) => images.map((image) => image.getAttribute("src") || ""));
    for (const [index, source] of sources.entries()) await writeFile(path.join(directory, `${approach}-panel-${index + 1}.jpg`), Buffer.from(source.split(",")[1], "base64"));
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download diagnostics JSON/ }).click();
    await (await downloadPromise).saveAs(path.join(directory, `${approach}-diagnostics.json`));
  }
  await capture("A");
  // A failed run stops here; never silently retry it or spend on B.
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.", { exact: true })).toBeVisible();
  expect(counts).toEqual({ story: 1, text: 2, reference: 0 });
  await page.getByLabel("VISUAL CONTINUITY EXPERIMENT").selectOption("reference");
  await page.getByRole("button", { name: "Render same script with B / reference · 2 image calls" }).click();
  await expect(page.getByRole("button", { name: "Generate Continuation", exact: true })).toBeEnabled({ timeout: 180_000 });
  await capture("B");
  await writeFile(path.join(directory, "request-summary.json"), JSON.stringify({ counts, requests }, null, 2));
  expect(counts).toEqual({ story: 1, text: 2, reference: 2 });
  expect(requests.slice(0, 2).map((request) => request.panel)).toEqual(requests.slice(2).map((request) => request.panel));
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.", { exact: true })).toBeVisible();
});
