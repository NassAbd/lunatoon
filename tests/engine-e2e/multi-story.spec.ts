import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { SnapshotSchema, type NarrativeContext } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number; contexts: NarrativeContext[]; imageReferences: { hashes: string[] }[] };
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
test.afterEach(async ({ request }) => { await control(request, {}); });

for (const world of [
  { id: "neon-protocol", title: "Neon Protocol", character: "kael", firstChoice: "investigate", twist: "A mysterious cyborg cat suddenly appears.", legacy: true },
  { id: "last-lightkeeper", title: "The Last Lightkeeper", character: "mara", firstChoice: "inspect_lens", twist: "The reflections answer Mara in three quiet pulses.", legacy: false },
  { id: "glass-orchard", title: "The Glass Orchard", character: "ivo", firstChoice: "open_hatch", twist: "A single leaf trembles as water knocks beneath the hatch.", legacy: false },
]) {
  test(`${world.title} completes through the shared reader with isolated memory and owned reference bytes`, async ({ page, request, browser }) => {
    await control(request, { scriptDelay: 400, imageDelay: 1000, reverseImages: true });
    const before = await stats(request);
    await page.goto(`/story/${world.id}`);
    await expect(page.getByRole("heading", { level: 1, name: world.title, exact: true })).toBeVisible();
    await expect(page.locator(".opening-beat")).not.toHaveCount(0);
    mkdirSync("test-results-live/poc-08/screenshots", { recursive: true });
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results-live/poc-08/screenshots/${world.id}-opening-${width}.png`, fullPage: true, animations: "disabled" });
    }
    await page.getByRole("button", { name: "Begin the story", exact: true }).click();
    await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
    const url = page.url(); const runId = url.split("/").at(-1)!;
    const initial = await readRun(request, runId);
    expect(initial.nodes).toHaveLength(0);
    expect(initial.run.state.characters[0].id).toBe(world.character);
    if (world.legacy) expect(initial.bible.template).toBeUndefined();
    else expect(initial.bible.template?.id).toBe(world.id);
    expect(await stats(request)).toEqual(before);
    const decision = page.locator(".book-decision[data-step='1']");
    await expect(decision.getByRole("radio")).toHaveCount(3);
    await decision.locator(`input[value='${world.firstChoice}']`).check();
    await decision.getByLabel("Add a little of your imagination").fill(world.twist);
    await page.evaluate(() => {
      Object.assign(window, { gateAReader: document.querySelector(".saved-reader"), gateADocument: document.documentElement });
    });
    await decision.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
    await expect(page.locator(".generated-image")).toHaveCount(0);
    await expect(page.locator(".book-panel").nth(1).locator(".generated-image.is-ready")).toHaveCount(1);
    await expect(page.locator(".book-panel").first().locator(".generated-image")).toHaveCount(0);
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(2);
    const first = await readRun(request, runId);
    expect(first.nodes[0].chapter).not.toBeNull();
    const secondDecision = page.locator(".book-decision[data-step='2']");
    const secondChoice = first.nodes[0].chapter!.next_decision.options[0];
    await secondDecision.locator(`input[value='${secondChoice.id}']`).check();
    await secondDecision.getByLabel("Add a little of your imagination").fill("Keep the promise made in the first chapter.");
    await secondDecision.getByRole("button", { name: "Continue the story", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(4);
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
    await expect(page.locator(".book-ending")).toHaveAttribute("data-artwork", "complete");
    await expect(page.locator(".book-ending")).toContainText(world.title.toUpperCase());
    await expect(page.locator(".book-ending")).toContainText(world.twist);
    await expect(page.locator(".book-ending").getByRole("link", { name: "Begin a new run" })).toHaveAttribute("href", `/story/${world.id}`);
    expect(await page.evaluate(() => {
      const memory = window as typeof window & { gateAReader?: Element; gateADocument?: Element };
      return memory.gateAReader === document.querySelector(".saved-reader") && memory.gateADocument === document.documentElement;
    })).toBe(true);
    expect(page.url()).toBe(url);
    const completed = await readRun(request, runId);
    expect(completed.run.status).toBe("ended");
    expect(completed.panels.every(panel => panel.status === "complete")).toBe(true);
    expect(completed.run.state.unresolved_threads).toEqual([]);
    const generated = await stats(request);
    expect(generated.scripts - before.scripts).toBe(2);
    expect(generated.images - before.images).toBe(4);
    const contexts = generated.contexts.slice(before.contexts.length);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].state).toEqual(initial.run.state);
    expect(contexts[1].state).toEqual(first.run.state);
    expect(contexts[1].recent_panels).toEqual(first.nodes[0].chapter!.panels);
    const referenceIds = initial.bible.template?.reference_asset_ids ?? ["kael_reference"];
    const hashes = referenceIds.map(id => initial.bible.assets.find(asset => asset.id === id)!.sha256).sort();
    expect(hashes.length).toBeGreaterThan(0);
    for (const record of generated.imageReferences.slice(before.imageReferences.length)) expect(record.hashes.toSorted()).toEqual(hashes);
    if (!world.legacy) {
      expect(JSON.stringify(contexts)).not.toMatch(/Kael|New Kyoto|Aster Transit|device_knows_kael/);
      expect(completed.run.state.characters.map(character => character.id)).toEqual([world.character]);
      if (world.id === "last-lightkeeper") {
        expect(JSON.stringify(contexts)).not.toMatch(/Ivo|seed_compass|orchard_dry/);
        expect(completed.run.state.objects.map(object => object.id)).toEqual(["tide_lantern"]);
        expect(initial.run.state.facts.map(fact => fact.id)).toEqual(["tide_stalled", "lantern_answers", "causeway_exposed"]);
      } else {
        expect(JSON.stringify(contexts)).not.toMatch(/Mara|tide_lantern|tide_stalled/);
        expect(completed.run.state.objects.map(object => object.id)).toEqual(["seed_compass"]);
        expect(initial.run.state.facts.map(fact => fact.id)).toEqual(["orchard_dry", "compass_points", "last_sapling"]);
      }
    }
    await page.reload();
    await expect(page.locator(".generated-image.is-ready")).toHaveCount(4);
    expect(await stats(request)).toEqual(generated);
    if (!world.legacy) {
      // Release the finished visit's speculative browser sockets before graceful
      // shutdown, then verify durable content in a fresh browser context.
      await page.waitForLoadState("networkidle");
      await page.context().close();
      expect((await request.post(`${runtime().mockURL}/__restart`, { timeout: 20000 })).ok()).toBe(true);
      const restored = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
      try {
        await restored.goto(url);
        await expect(restored.locator(".generated-image.is-ready")).toHaveCount(4);
        expect(await stats(request)).toEqual(generated);
      } finally { await restored.close(); }
    }
    const reloaded = await readRun(request, runId);
    expect(reloaded.bible).toEqual(initial.bible);
    expect(reloaded.panels.map(panel => panel.image_path)).toEqual(completed.panels.map(panel => panel.image_path));
    expect(reloaded.nodes.map(node => node.chapter)).toEqual(completed.nodes.map(node => node.chapter));
  });
}
