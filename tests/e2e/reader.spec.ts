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

test("A/B replay preserves the exact script, avoids a second narrative call, and labels timings honestly", async ({ page }) => {
  let stories = 0;
  const images: { approach: string; panel: unknown }[] = [];
  await page.route("**/api/story", (route) => { stories += 1; return route.fulfill({ json: storyFixture }); });
  await page.route("**/api/image", (route) => {
    const data = route.request().postDataJSON() as { approach: "text" | "reference"; panel: { panel_id: string } };
    images.push(data);
    return route.fulfill({ json: { panel_id: data.panel.panel_id, image_url: `data:image/jpeg;base64,${jpeg}`, metrics: { ...metricsFixture, approach: data.approach, quality: "low" } } });
  });
  await page.goto("/");
  await page.getByLabel("VISUAL CONTINUITY EXPERIMENT").selectOption("text");
  await page.getByRole("button", { name: "Generate Continuation", exact: true }).click();
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.", { exact: true })).toBeVisible();
  await page.getByLabel("MAKE IT YOURS").fill("A changed field must not change the replayed script.");
  await page.getByLabel("VISUAL CONTINUITY EXPERIMENT").selectOption("reference");
  await page.getByRole("button", { name: "Render same script with B / reference · 2 image calls" }).click();
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.", { exact: true })).toBeVisible();
  expect(stories).toBe(1);
  expect(images.map((image) => image.approach)).toEqual(["text", "text", "reference", "reference"]);
  expect(images.slice(0, 2).map((image) => image.panel)).toEqual(images.slice(2).map((image) => image.panel));
  await expect(page.getByText("Narrative reused · no new narrative request or tokens.")).toBeVisible();
  await expect(page.getByText(/Total measures illustration work only/)).toBeVisible();
  await expect(page.locator(".previous-run summary")).toContainText("A / text");
});

test("dialogue-first dispatch still proceeds when requestAnimationFrame is suspended", async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  let images = 0;
  await page.route("**/api/story", (route) => route.fulfill({ json: storyFixture }));
  await page.route("**/api/image", (route) => {
    images += 1;
    const panel = route.request().postDataJSON().panel as { panel_id: string };
    return route.fulfill({ json: { panel_id: panel.panel_id, image_url: `data:image/jpeg;base64,${jpeg}`, metrics: metricsFixture } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate Continuation", exact: true }).click();
  await expect(page.getByText("YOUR CHOICE BECAME A STORY.", { exact: true })).toBeVisible();
  expect(images).toBe(2);
});

test("two bubbles in the same band are separated and remain readable", async ({ page }) => {
  const response = structuredClone(storyFixture);
  response.script.panels[0].dialogues.push({ ...response.script.panels[0].dialogues[0], id: "other", position: "top-right", text: "That signal belongs to the station." });
  await page.route("**/api/story", (route) => route.fulfill({ json: response }));
  await page.route("**/api/image", (route) => route.fulfill({ status: 429, json: { error: { code: "test_limit", message: "Mocked image failure.", request_id: null }, duration_ms: 1 } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate Continuation", exact: true }).click();
  const bubbles = page.locator(".continuation .generated-panel").first().locator(".speech-bubble");
  await expect(bubbles).toHaveCount(2);
  const first = await bubbles.nth(0).boundingBox();
  const second = await bubbles.nth(1).boundingBox();
  expect(first && second && first.y + first.height < second.y).toBeTruthy();
});
