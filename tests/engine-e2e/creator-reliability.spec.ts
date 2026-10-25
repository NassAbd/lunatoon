import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { CreatorSnapshotSchema } from "../../src/lib/creator/contracts";
import { SnapshotSchema, type NarrativeContext } from "../../src/lib/story-engine/contracts";

type Stats = { foundations: number; scripts: number; images: number; contexts: NarrativeContext[]; imageReferences: { hashes: string[] }[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function readRun(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/runs/${id}`); expect(response.ok()).toBe(true);
  return SnapshotSchema.parse(await response.json());
}
test.afterEach(async ({ request }) => { expect((await request.post(`${runtime().mockURL}/__control`, { data: {} })).ok()).toBe(true); });

test("reconstructed Kai story keeps worn SpeedCore ownership, explicitly drops it, and completes two decisions", async ({ page, request }) => {
  // Public reported anchors and choice; all provider prose is a synthetic regression
  // fixture, not the unavailable response from the historical Running Hell failure.
  expect((await request.post(`${runtime().mockURL}/__control`, { data: { kaiFoundation: true, scriptDelay: 200, imageDelay: 650, reverseImages: true, streamPreviews: true } })).ok()).toBe(true);
  const before = await stats(request);
  await page.goto("/studio");
  await page.getByLabel("Describe your story", { exact: true }).fill("Kai Fox wears a red jacket and a ponytail, carrying the SpeedCore Device. He wants to stop NEXUS and save the city.");
  await page.getByRole("button", { name: "Create story foundation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it your own", exact: true })).toBeVisible();
  const draftId = new URL(page.url()).searchParams.get("draft")!;
  const reference = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#b8473b" } }).png().toBuffer();
  await page.getByLabel("Add reference images", { exact: true }).setInputFiles({ name: "original-red-reference.png", mimeType: "image/png", buffer: reference });
  await expect(page.locator("[data-reference-id]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save & Illustrate", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save & Illustrate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play your story", exact: true })).toBeEnabled();
  const saved = CreatorSnapshotSchema.parse(await (await request.get(`/api/creator/drafts/${draftId}`)).json());
  expect(saved.opening?.panels).toHaveLength(3);
  expect(saved.opening?.status).toBe("ready");
  await page.getByRole("button", { name: "Play your story", exact: true }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  const url = page.url(), id = url.split("/").at(-1)!;
  const initial = await readRun(request, id);
  expect(initial.run.state.characters[0]).toMatchObject({ id: "kai_fox", name: "Kai Fox", visual_anchor: "red_jacket_ponytail", carried_objects: ["speedcore_device"] });
  expect(initial.run.state.objects).toEqual([{ id: "speedcore_device", name: "SpeedCore Device", condition: "intact", holder: "kai_fox" }]);
  const first = page.locator(".book-decision[data-step='1']");
  await first.getByRole("radio", { name: /Use the speed to stop NEXUS and save the city\./ }).check();
  const instruction = "He'll use his speed to introduce into Nexus's HQ.";
  await first.getByLabel("Add a little of your imagination").fill(instruction);
  await page.evaluate(() => Object.assign(window, { kaiDocument: document.documentElement, kaiReader: document.querySelector(".saved-reader") }));
  await first.getByRole("button", { name: "Continue the story", exact: true }).evaluate(element => (element as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(2);
  await expect(page.locator(".book-panel .generated-image")).toHaveCount(0);
  await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(2);
  const chapterOne = await readRun(request, id);
  expect(chapterOne.nodes[0].error).toBeNull();
  expect(chapterOne.nodes[0].instruction).toBe(instruction);
  expect(chapterOne.run.state.objects[0]).toMatchObject({ holder: "kai_fox", condition: "active" });
  expect(chapterOne.run.state.characters[0].carried_objects).toEqual(["speedcore_device"]);
  expect(chapterOne.run.state.characters[0].clothing_condition).toContain("SpeedCore");
  const second = page.locator(".book-decision[data-step='2']");
  await second.locator("input[value='disable_relay']").check();
  await second.getByRole("button", { name: "Continue the story", exact: true }).evaluate(element => (element as HTMLButtonElement).click());
  await expect(page.locator(".book-panel .speech-bubble")).toHaveCount(4);
  await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(4);
  await expect(page.locator(".book-ending")).toHaveAttribute("data-artwork", "complete");
  await expect(page.locator(".book-ending")).toContainText(instruction);
  const finished = await readRun(request, id);
  expect(finished.run.status).toBe("ended");
  expect(finished.run.state.objects[0]).toMatchObject({ id: "speedcore_device", holder: null, condition: "intact" });
  expect(finished.run.state.characters[0].carried_objects).toEqual([]);
  expect(finished.run.state.facts.some(fact => fact.id === "city_saved")).toBe(true);
  expect(finished.run.state.unresolved_threads).toEqual([]);
  expect(finished.nodes.every(node => node.error === null)).toBe(true);
  expect(finished.summary).toMatchObject({ script_calls: 2, image_calls: 4, unknown_cost_attempts: 0 });
  expect(finished.summary.estimated_micro_usd).toBeGreaterThan(0);
  expect(await page.evaluate(() => { const memory = window as typeof window & { kaiDocument?: Element; kaiReader?: Element }; return memory.kaiDocument === document.documentElement && memory.kaiReader === document.querySelector(".saved-reader"); })).toBe(true);
  const generated = await stats(request), contexts = generated.contexts.slice(before.contexts.length);
  expect(generated.foundations - before.foundations).toBe(1);
  expect(generated.scripts - before.scripts).toBe(2);
  expect(generated.images - before.images).toBe(7); // Three saved opening scenes plus four continuation panels.
  expect(contexts[0].instruction).toBe(instruction);
  expect(contexts[1].state).toEqual(chapterOne.run.state);
  expect(contexts[1].recent_panels).toEqual(chapterOne.nodes[0].chapter!.panels);
  expect(JSON.stringify(contexts)).not.toMatch(/Kael|Mara|Ivo|Ada|star_chart|tide_lantern/);
  const referenceHash = saved.assets.find(asset => asset.id === saved.draft.reference_asset_ids[0])!.sha256;
  for (const record of generated.imageReferences.slice(before.imageReferences.length)) expect(record.hashes).toEqual([referenceHash]);
  await page.reload();
  await expect(page.locator(".book-panel .generated-image.is-ready")).toHaveCount(4);
  expect(await stats(request)).toEqual(generated);
  expect((await readRun(request, id)).run.state).toEqual(finished.run.state);
});
