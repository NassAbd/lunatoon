import { mkdtempSync, readdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { exportCompletedStory } from "../src/lib/story-engine/export";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import type { StoryProvider } from "../src/lib/story-engine/provider";
import type { NarrativeContext, Snapshot } from "../src/lib/story-engine/contracts";
import { getTemplateBundle } from "../src/lib/story-templates/server";
import { chapterFixture, measuredMetrics, imageMetrics, operation } from "./engine-fixtures";

const stores: StoryStore[] = [], dirs: string[] = [];
const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_script_calls: 3, max_image_calls: 6, budget_usd: .5 };
function temporary() { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-export-")); dirs.push(dir); return dir; }
function documents(directory: string) {
  const db = new DatabaseSync(path.join(directory, "stories.sqlite"), { readOnly: true });
  try { return ["stories", "story_runs", "story_nodes", "comic_panels", "generation_events"].map(table => db.prepare(`SELECT document FROM ${table} ORDER BY id`).all()); }
  finally { db.close(); }
}
function changePanel(store: StoryStore, snapshot: Snapshot, index: number, update: (value: Snapshot["panels"][number]) => void) {
  const db = new DatabaseSync(path.join(store.directory, "stories.sqlite")); const panel = structuredClone(snapshot.panels[index]); update(panel);
  try { db.prepare("UPDATE comic_panels SET document=? WHERE id=?").run(JSON.stringify(panel), panel.id); } finally { db.close(); }
}
async function setup(templateId?: string) {
  const store = new StoryStore(temporary(), { now: () => Date.parse("2026-10-24T12:00:00Z") }); stores.push(store);
  const bundle = templateId ? getTemplateBundle(templateId)! : undefined;
  const run = store.createRun({ operation_id: operation(), approach: "reference", ...(bundle ? { template_id: bundle.template.id, template_version: bundle.template.version } : {}) }, models, limits, bundle);
  const image = await sharp({ create: { width: 12, height: 16, channels: 3, background: "#7a9682" } }).jpeg().withExif({ IFD0: { Artist: "private-test-metadata" } }).toBuffer();
  let calls = 0;
  const provider: StoryProvider = {
    prepare() {}, async script(context: NarrativeContext) {
      calls++; const chapter = chapterFixture(context);
      if (bundle) {
        chapter.story_state_updates.appearance_changes = [];
        chapter.event = { action: "Mara follows the revealed path.", consequence: "The light leads her home.", source_clue: null };
        chapter.panels.forEach(panel => { panel.visual_description = "Mara carries her lantern beside the lighthouse."; panel.dialogues.forEach(bubble => { bubble.character = "Mara"; bubble.text = "The lantern has shown the way."; }); });
      }
      chapter.panels[0].dialogues[0].text = context.step === 1 ? 'First: <script>alert("story")</script>' : "Third: the way home is clear.";
      chapter.panels[1].dialogues[0].text = context.step === 1 ? "Second: now choose the next step." : "Fourth: home, at last.";
      return { chapter, metrics: measuredMetrics };
    },
    async image(panel) { calls++; return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${image.toString("base64")}`, metrics: imageMetrics }; },
  };
  const engine = new StoryEngine(store, provider);
  async function finish() {
    for (let step = 1; step <= 2; step++) {
      const saved = engine.snapshot(run.id); const choice = step === 1 ? bundle?.template.initial_decision.options[0].id ?? "investigate" : saved.nodes[0].chapter!.next_decision.options[0].id;
      const written = await engine.decide(run.id, { operation_id: operation(), choice_id: choice, instruction: step === 1 ? 'Keep <the lantern> "safe".' : "" });
      await Promise.all(written.panels.filter(panel => panel.status === "pending").map(panel => engine.image(run.id, panel.id, { operation_id: panel.operation_id, retry: false })));
    }
    return engine.snapshot(run.id);
  }
  return { store, run, finish, calls: () => calls };
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe("completed local story export", () => {
  it("does not create storage for a missing run and rejects incomplete stories without writing", async () => {
    const missing = temporary(); await expect(exportCompletedStory(operation(), { directory: missing })).rejects.toMatchObject({ code: "not_found" }); expect(readdirSync(missing)).toEqual([]);
    const test = await setup(); const before = documents(test.store.directory);
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_not_complete" });
    expect(documents(test.store.directory)).toEqual(before); expect(test.calls()).toBe(0);
  });

  it("exports only escaped reader content and metadata-free owned rasters in narrative order", async () => {
    const test = await setup(); const snapshot = await test.finish(); const before = documents(test.store.directory);
    const exported = await exportCompletedStory(test.run.id, { directory: test.store.directory });
    expect(exported.filename).toBe("neon-protocol-lunatoon.html"); expect(exported.html).toContain("First: &lt;script&gt;alert(&quot;story&quot;)&lt;/script&gt;");
    expect(exported.html).toContain("Keep &lt;the lantern&gt; &quot;safe&quot;.");
    expect(exported.html).not.toMatch(/<script|<iframe|<svg|href=|src=["']https?:|req_mock|gpt-4|private-test-metadata|image_prompt|visual_brief|generation_events|OPENAI_API_KEY/);
    expect(exported.html).not.toContain(test.store.directory); expect(exported.html).not.toContain(test.run.id);
    expect(exported.html.indexOf("First:")).toBeLessThan(exported.html.indexOf("Second:")); expect(exported.html.indexOf("Second:")).toBeLessThan(exported.html.indexOf("Third:")); expect(exported.html.indexOf("Third:")).toBeLessThan(exported.html.indexOf("Fourth:"));
    expect(exported.html).toContain("THE END"); expect(exported.html).toContain("Content-Security-Policy");
    const images = [...exported.html.matchAll(/src="data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)"/g)]; expect(images).toHaveLength(5);
    for (const [, format, data] of images) { const metadata = await sharp(Buffer.from(data, "base64")).metadata(); expect(metadata.format).toBe(format); expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); }
    for (const node of snapshot.nodes) expect(exported.html).toContain(node.choice);
    expect(documents(test.store.directory)).toEqual(before); expect(test.calls()).toBe(6);
  });

  it("preserves every immutable template opening beat without exporting references or private state", async () => {
    const test = await setup("last-lightkeeper"); const saved = await test.finish(); const exported = await exportCompletedStory(test.run.id, { directory: test.store.directory });
    expect(exported.filename).toBe("the-last-lightkeeper-lunatoon.html"); expect([...exported.html.matchAll(/<img /g)]).toHaveLength(8);
    for (const beat of saved.bible.template!.opening_beats) expect(exported.html).toContain(beat.caption);
    expect(exported.html).not.toContain(saved.bible.character_bible); expect(exported.html).not.toContain("mara_reference"); expect(test.calls()).toBe(6);
  });

  it("rejects missing assets and cross-run or symlinked files without changing saved status", async () => {
    const test = await setup(); const saved = await test.finish(); const original = saved.panels[0].image_path!;
    changePanel(test.store, saved, 0, panel => { panel.image_path = `images/${operation()}/${operation()}.jpg`; });
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_asset_unavailable" });
    changePanel(test.store, saved, 0, panel => { panel.image_path = original; });
    const target = path.join(test.store.directory, original); rmSync(target);
    const before = documents(test.store.directory);
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_asset_unavailable" }); expect(documents(test.store.directory)).toEqual(before);
    const outside = path.join(temporary(), "outside.jpg"); writeFileSync(outside, await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).jpeg().toBuffer()); symlinkSync(outside, target);
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_asset_unavailable" });
  });

  it("rejects invalid ownership/order, corrupt bytes and unfinished final panels", async () => {
    const test = await setup(); const saved = await test.finish();
    changePanel(test.store, saved, 1, panel => { panel.sequence = 1; });
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_invalid_saved_story" });
    changePanel(test.store, saved, 1, panel => { panel.status = "failed"; });
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_not_complete" });
    changePanel(test.store, saved, 1, () => {}); writeFileSync(path.join(test.store.directory, saved.panels[1].image_path!), Buffer.from("not an image"));
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_asset_unavailable" });
  });

  it("does not rasterize SVGs with external resource declarations", async () => {
    const test = await setup(); const saved = await test.finish(); const bible = structuredClone(saved.bible);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><image href="https://example.invalid/private" width="50" height="50"/></svg>');
    const hash = createHash("sha256").update(svg).digest("hex"); const asset = bible.assets.find(asset => asset.id === "opening")!;
    asset.path = `references/${hash}.svg`; asset.sha256 = hash; writeFileSync(path.join(test.store.directory, asset.path), svg);
    const db = new DatabaseSync(path.join(test.store.directory, "stories.sqlite")); db.prepare("UPDATE stories SET document=? WHERE id=?").run(JSON.stringify(bible), bible.id); db.close();
    await expect(exportCompletedStory(test.run.id, { directory: test.store.directory })).rejects.toMatchObject({ code: "export_asset_unavailable" });
  });
});
