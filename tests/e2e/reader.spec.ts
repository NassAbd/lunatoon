import { expect, test } from "@playwright/test";
import { scriptFixture, storyFixture, metricsFixture } from "../fixtures";

// A tiny real JPEG, used only to exercise browser decoding in mocked HTTP tests.
const jpeg = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCMABmX/9k=";

test("shows script before images; the second panel can arrive first", async ({ page }) => {
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
  const started: string[] = [];
  await page.route("**/api/story", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ choice: "Investigate its origin", instruction: "A cyborg cat appears." });
    await route.fulfill({ json: storyFixture });
  });
  await page.route("**/api/image", async (route) => {
    const panel = route.request().postDataJSON().panel as { panel_id: string };
    started.push(panel.panel_id);
    await (panel.panel_id === "panel_1" ? firstGate : secondGate);
    await route.fulfill({ json: { panel_id: panel.panel_id, image_url: `data:image/jpeg;base64,${jpeg}`, metrics: metricsFixture } });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: /Investigate its origin/ }).check();
  await page.getByLabel("MAKE IT YOURS").fill("A cyborg cat appears.");
  await page.getByRole("button", { name: "Generate Continuation" }).click();
  const first = page.getByRole("article", { name: "Continuation panel 1" });
  const second = page.getByRole("article", { name: "Continuation panel 2" });
  await expect(first.getByText(scriptFixture.panels[0].dialogues[0].text)).toBeVisible();
  await expect(second.getByText(scriptFixture.panels[1].dialogues[0].text)).toBeVisible();
  await expect.poll(() => started.length).toBe(2);
  await expect(first.locator("img")).toHaveCount(0);
  await expect(second.locator("img")).toHaveCount(0);
  releaseSecond();
  await expect(second.locator("img")).toBeVisible();
  await expect(first.locator("img")).toHaveCount(0);
  releaseFirst();
  await expect(first.locator("img")).toBeVisible();
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Continuation" })).toBeEnabled();
});

test("keeps a successful illustration and reports a sibling failure", async ({ page }) => {
  await page.route("**/api/story", (route) => route.fulfill({ json: storyFixture }));
  await page.route("**/api/image", (route) => {
    const panel = route.request().postDataJSON().panel as { panel_id: string };
    return panel.panel_id === "panel_1"
      ? route.fulfill({ status: 429, json: { error: { code: "rate_limit_or_quota", message: "OpenAI rate limit reached.", request_id: "req_error" }, duration_ms: 120 } })
      : route.fulfill({ json: { panel_id: panel.panel_id, image_url: `data:image/jpeg;base64,${jpeg}`, metrics: metricsFixture } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate Continuation" }).click();
  await expect(page.getByRole("article", { name: "Continuation panel 2" }).locator("img")).toBeVisible();
  await expect(page.getByText("panel_1 · rate_limit_or_quota", { exact: false })).toBeVisible();
  await expect(page.getByText(/Both panels did not complete/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Continuation" })).toBeEnabled();
});

test("surfaces a missing key without inventing a continuation", async ({ page }) => {
  await page.route("**/api/story", (route) => route.fulfill({ status: 503, json: { error: { code: "missing_api_key", message: "Add OPENAI_API_KEY to .env.local and restart the server.", request_id: null }, duration_ms: 1 } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate Continuation" }).click();
  await expect(page.getByText("Narrative · missing_api_key", { exact: false })).toBeVisible();
  await expect(page.getByRole("article", { name: /Continuation panel/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Continuation" })).toBeEnabled();
});

test("desktop and narrow screens have no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No horizontal overflow at ${width}px`).toBe(true);
  }
});

test("real route handlers accept the browser origin and reject invalid payloads before generation", async ({ request, baseURL }) => {
  for (const endpoint of ["/api/story", "/api/image"]) {
    const response = await request.post(endpoint, { headers: { origin: new URL(baseURL!).origin }, data: { invalid: true } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  }
});
