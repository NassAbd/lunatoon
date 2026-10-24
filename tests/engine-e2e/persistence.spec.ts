import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SnapshotSchema, type Snapshot } from "../../src/lib/story-engine/contracts";

type Stats = { scripts: number; images: number; contexts: { instruction: string; state: { facts: { id: string }[]; characters: { injuries: string[]; clothing_condition: string }[] }; recent_panels: unknown[] }[]; imagePrompts: string[]; endpoints: string[] };
const runtime = () => JSON.parse(readFileSync("test-results-engine/runtime.json", "utf8")) as { mockURL: string; dataDirectory: string };
const stats = async (request: APIRequestContext): Promise<Stats> => (await request.get(`${runtime().mockURL}/__stats`)).json();
async function start(request: APIRequestContext, approach = "reference") { const res = await request.post("/api/runs", { data: { operation_id: randomUUID(), approach } }); expect(res.ok()).toBe(true); return SnapshotSchema.parse(await res.json()); }
async function illustrate(request: APIRequestContext, saved: Snapshot) { await Promise.all(saved.panels.filter(p => p.status === "pending").map(p => request.post(`/api/runs/${saved.run.id}/panels/${p.id}/image`, { data: { operation_id: p.operation_id, retry: false } }))); return SnapshotSchema.parse(await (await request.get(`/api/runs/${saved.run.id}`)).json()); }

test("saved two-decision story paints dialogue first, completes images independently, survives refresh and real process restart", async ({ page, request }) => {
  const before = await stats(request); await page.goto("/"); await page.locator("[data-story='neon-protocol']").getByRole("button", { name: "Begin the story" }).click(); await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  const url = page.url(); const runId = url.split("/").at(-1)!;
  await page.getByRole("radio", { name: "Investigate its origin" }).check(); await page.getByLabel("Add a little of your imagination").fill("A mysterious cyborg cat suddenly appears.");
  await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.getByText("Aster Transit Lab. You're opening their TL-9 hatch?", { exact: true })).toBeVisible();
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await expect(page.locator(".generated-image")).toHaveCount(1); await expect(page.locator(".generated-image")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "Follow the cat into the Aster Lab maintenance route" })).toBeEnabled();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1440);
  await page.screenshot({ path: "test-results-engine/saved-story-desktop.png", fullPage: true });
  const first = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(first.panels.every(p => p.image_path && existsSync(path.join(runtime().dataDirectory, p.image_path)))).toBe(true);
  const generated = await stats(request); expect(generated.scripts - before.scripts).toBe(1); expect(generated.images - before.images).toBe(2);
  await page.reload(); await expect(page.locator(".generated-image")).toHaveCount(2); expect((await stats(request)).images).toBe(generated.images);
  const restart = await request.post(`${runtime().mockURL}/__restart`); expect(restart.ok()).toBe(true);
  await page.goto(url); await expect(page.locator(".generated-image")).toHaveCount(2); expect(await stats(request)).toEqual(generated);
  const restored = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json()); expect(restored.panels.map(p => p.image_path)).toEqual(first.panels.map(p => p.image_path));
  await page.getByRole("radio", { name: "Follow the cat into the Aster Lab maintenance route" }).check(); await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.getByText("A story only you could tell.")).toBeVisible(); await expect(page.locator(".generated-image")).toHaveCount(4);
  const final = await stats(request); expect(final.scripts - before.scripts).toBe(2); expect(final.images - before.images).toBe(4);
  expect(final.contexts.at(-1)!.state.facts.map(f => f.id)).toEqual(expect.arrayContaining(["device_source", "cat_access"])); expect(final.contexts.at(-1)!.state.characters[0].injuries).toContain("A shallow cut on his right hand"); expect(final.contexts.at(-1)!.recent_panels).toHaveLength(2);
  expect(final.imagePrompts.at(-1)).toContain("torn at the right cuff");
  expect((await request.post(`${runtime().mockURL}/__restart`)).ok()).toBe(true);
  await page.goto(url); await expect(page.locator(".generated-image")).toHaveCount(4);
  await expect(page.getByText("A story only you could tell.")).toBeVisible(); expect(await stats(request)).toEqual(final);
});

test("duplicate operation IDs claim one narrative/image request and cross-run asset reads are rejected", async ({ request }) => {
  const before = await stats(request); const run = await start(request, "text"); const base = `/api/runs/${run.run.id}`;
  const decision = { operation_id: randomUUID(), choice_id: "investigate", instruction: "A cyborg cat appears." };
  const responses = await Promise.all([request.post(`${base}/nodes`, { data: decision }), request.post(`${base}/nodes`, { data: decision })]); expect(responses.every(r => r.ok())).toBe(true);
  let saved = SnapshotSchema.parse(await (await request.get(base)).json()); const panel = saved.panels[0];
  await Promise.all([request.post(`${base}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id } }), request.post(`${base}/panels/${panel.id}/image`, { data: { operation_id: panel.operation_id } })]);
  const after = await stats(request); expect(after.scripts - before.scripts).toBe(1); expect(after.images - before.images).toBe(1);
  saved = await illustrate(request, SnapshotSchema.parse(await (await request.get(base)).json())); expect(saved.panels.every(p => p.status === "complete")).toBe(true);
  const other = await start(request); expect((await request.get(`/api/runs/${other.run.id}/assets/${panel.id}`)).status()).toBe(404);
  expect((await request.post(`${base}/nodes`, { data: { ...decision, instruction: "Changed" } })).status()).toBe(409);
  expect((await request.post(`${base}/nodes`, { headers: { Origin: "https://other.invalid" }, data: decision })).status()).toBe(403);
});

test("failed image retry consumes one call only, preserves its sibling and script, and hard call limit blocks more work", async ({ page, request }) => {
  const before = await stats(request); const run = await start(request); const base = `/api/runs/${run.run.id}`;
  await request.post(`${runtime().mockURL}/__control`, { data: { failSecond: true, imageDelay: 150 } });
  let saved = SnapshotSchema.parse(await (await request.post(`${base}/nodes`, { data: { operation_id: randomUUID(), choice_id: "investigate", instruction: "A cyborg cat appears." } })).json()); saved = await illustrate(request, saved);
  expect(saved.panels.map(p => p.status)).toEqual(["complete", "failed"]); const sibling = saved.panels[0].image_path;
  await page.goto(`/run/${run.run.id}`); await page.getByText("Developer details", { exact: true }).click(); await expect(page.getByText("Unknown-cost attempts: 1.", { exact: false })).toBeVisible();
  await request.post(`${runtime().mockURL}/__control`, { data: { failSecond: false, imageDelay: 150 } });
  await page.getByRole("button", { name: "Try this illustration again" }).click(); await expect(page.locator(".generated-image")).toHaveCount(2);
  saved = SnapshotSchema.parse(await (await request.get(base)).json()); expect(saved.panels[0].image_path).toBe(sibling); expect(saved.summary.image_calls).toBe(3);
  expect((await stats(request)).scripts - before.scripts).toBe(1); expect((await stats(request)).images - before.images).toBe(3);
  // A same-script replay reserves two calls; only one slot remains afterwards, so the next two-panel chapter cannot start.
  saved = SnapshotSchema.parse(await (await request.post(`${base}/nodes/${saved.nodes[0].id}/replay`, { data: { operation_id: randomUUID(), approach: "text" } })).json()); await illustrate(request, saved);
  const denied = await request.post(`${base}/nodes`, { data: { operation_id: randomUUID(), choice_id: "follow_cat", instruction: "" } }); expect(denied.status()).toBe(402);
  expect((await stats(request)).scripts - before.scripts).toBe(1);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 900 } });
});

test("light reading flow puts choices after panels, hides diagnostics and preserves hammer destruction through the ending", async ({ page, request }) => {
  await page.goto("/story/neon-protocol");
  await expect(page.locator(".story-reader")).toHaveCSS("background-color", "rgb(250, 250, 247)");
  await expect(page.getByRole("heading", { name: "Neon Protocol" })).toBeVisible();
  await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("Image approach", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: "test-results-engine/poc-03-1-welcome-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Begin the story" }).click();
  await expect(page).toHaveURL(/\/run\/[a-f0-9-]+$/);
  await expect(page.locator("aside")).toHaveCount(0);
  const ordering = await page.evaluate(() => {
    const art = document.querySelector(".book-opening-art")!.getBoundingClientRect();
    const choices = document.querySelector(".book-decision")!.getBoundingClientRect(); return choices.top > art.bottom;
  }); expect(ordering).toBe(true);
  await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await page.screenshot({ path: "test-results-engine/poc-03-1-choice-desktop.png", fullPage: true });
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 2200 } });
  const before = await stats(request);
  await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.getByText("You don't get to follow me.", { exact: true })).toBeVisible();
  await expect(page.locator(".generated-image")).toHaveCount(0);
  await page.screenshot({ path: "test-results-engine/poc-03-1-dialogue-first-desktop.png", fullPage: true });
  await expect(page.locator(".generated-image")).toHaveCount(1);
  await expect(page.locator(".generated-image")).toHaveCount(2);
  const runId = page.url().split("/").at(-1)!;
  let saved = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(saved.run.state.objects[0].condition).toBe("destroyed"); expect(saved.nodes[0].chapter?.event.source_clue).toBeNull();
  expect((await stats(request)).scripts - before.scripts).toBe(1);
  await expect(page.getByText("Measured usage returned:", { exact: false })).not.toBeVisible();
  await page.getByRole("radio", { name: "Leave the broken core and escape the blind cameras" }).check();
  await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.locator(".generated-image")).toHaveCount(4);
  saved = SnapshotSchema.parse(await (await request.get(`/api/runs/${runId}`)).json());
  expect(saved.run.state.objects[0].condition).toBe("destroyed"); expect(saved.run.status).toBe("ended");
  await page.reload(); await expect(page.locator(".book-developer")).not.toHaveAttribute("open", "");
  const after = await stats(request); expect(after.scripts - before.scripts).toBe(2); expect(after.images - before.images).toBe(4);
  await page.getByText("Developer details", { exact: true }).click();
  await expect(page.getByText("Measured usage returned:", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 900 } });
});

test("narrative failure uses friendly copy and only an explicit retry makes another call", async ({ page, request }) => {
  const run = await start(request); const before = await stats(request);
  await request.post(`${runtime().mockURL}/__control`, { data: { invalidScript: true, imageDelay: 150 } });
  await page.goto(`/run/${run.run.id}`); await page.getByRole("radio", { name: "Destroy the device" }).check();
  await page.getByLabel("Add a little of your imagination").fill("Destroy it with a hammer.");
  await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.getByRole("heading", { name: "This part of the story couldn’t be written." })).toBeVisible();
  await expect(page.getByText("A new fact must not replace or contradict", { exact: false })).not.toBeVisible();
  let current = await stats(request); expect(current.scripts - before.scripts).toBe(1); expect(current.images).toBe(before.images);
  await page.screenshot({ path: "test-results-engine/poc-03-1-recovery-desktop.png", fullPage: true });
  await page.reload(); current = await stats(request); expect(current.scripts - before.scripts).toBe(1);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 150 } });
  await page.getByRole("button", { name: "Try this part again" }).click(); await expect(page.locator(".generated-image")).toHaveCount(2);
  current = await stats(request); expect(current.scripts - before.scripts).toBe(2); expect(current.images - before.images).toBe(2);
  await page.getByText("Developer details", { exact: true }).click();
  await expect(page.getByText("Narrative: 2 attempted", { exact: false })).toBeVisible();
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 900 } });
});

test("a controlled second-decision validation failure records safe diagnostics, keeps usage, and requires explicit isolated recovery", async ({ page, request }) => {
  const before = await stats(request); const run = await start(request); const base = `/api/runs/${run.run.id}`;
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 150, duplicateEndingDialogue: true } });
  let saved = SnapshotSchema.parse(await (await request.post(`${base}/nodes`, { data: { operation_id: randomUUID(), choice_id: "investigate", instruction: "A cyborg cat appears." } })).json());
  saved = await illustrate(request, saved); const firstImages = saved.panels.map(panel => panel.image_path);
  await page.goto(`/run/${run.run.id}`); await page.reload();
  await page.getByRole("radio", { name: "Follow the cat into the Aster Lab maintenance route" }).check();
  await page.getByLabel("Add a little of your imagination").fill("He retreats into a bar.");
  await page.getByRole("button", { name: "Continue the story" }).click();
  await expect(page.getByRole("heading", { name: "This part of the story couldn’t be written." })).toBeVisible();
  saved = SnapshotSchema.parse(await (await request.get(base)).json());
  expect(saved.nodes[1].error).toMatchObject({ code: "invalid_chapter_contract", request_id: expect.stringMatching(/^req_local_mock_/), diagnostics: { phase: "chapter_validation", issues: [{ path: "panels.1.dialogues", rule: "dialogue_ids_unique" }] } });
  expect(saved.summary.script_calls).toBe(2); expect(saved.summary.image_calls).toBe(2); expect(saved.summary.unknown_cost_attempts).toBe(0);
  expect(saved.run.step).toBe(1); expect(saved.panels.map(panel => panel.image_path)).toEqual(firstImages);
  const failedCounters = await stats(request); expect(failedCounters.scripts - before.scripts).toBe(2); expect(failedCounters.images - before.images).toBe(2);
  await page.getByText("Developer details", { exact: true }).click();
  await page.getByText("Request accounting details", { exact: true }).click();
  await expect(page.getByText("panels.1.dialogues: dialogue_ids_unique", { exact: false })).toBeVisible();
  await page.reload(); expect((await stats(request)).scripts).toBe(failedCounters.scripts);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 150 } });
  await page.getByRole("button", { name: "Try this part again" }).click();
  await expect(page.locator(".generated-image")).toHaveCount(4); await expect(page.getByText("A story only you could tell.")).toBeVisible();
  saved = SnapshotSchema.parse(await (await request.get(base)).json());
  expect(saved.panels.slice(0, 2).map(panel => panel.image_path)).toEqual(firstImages);
  expect(saved.summary.script_calls).toBe(3); expect(saved.summary.image_calls).toBe(4);
  const after = await stats(request); expect(after.contexts.at(-1)?.recent_panels).toHaveLength(2);
  expect(after.contexts.at(-1)?.instruction).toBe("He retreats into a bar.");
  expect((await request.post(`${runtime().mockURL}/__restart`)).ok()).toBe(true);
  await page.goto(`/run/${run.run.id}`); await expect(page.locator(".generated-image")).toHaveCount(4); expect(await stats(request)).toEqual(after);
  await request.post(`${runtime().mockURL}/__control`, { data: { imageDelay: 900 } });
});
