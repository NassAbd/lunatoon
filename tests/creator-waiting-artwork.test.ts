import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorStore, getSavedTemplateBundle } from "../src/lib/creator/store";
import { OpeningService, type OpeningProvider } from "../src/lib/creator/opening-service";
import type { OpeningPanel } from "../src/lib/creator/opening-contracts";
import { CreatorAssetSchema, type CreatorAsset } from "../src/lib/creator/contracts";
import { openingShots } from "../src/lib/creator/opening-plan";
import { getSavedOpeningScenery } from "../src/lib/creator/waiting-artwork";
import { waitingArtworkForRun } from "../src/lib/reader-waiting-artwork";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryFoundationSchema, type StoryFoundation } from "../src/lib/story-engine/contracts";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../src/lib/story-templates/catalog";
import { imageMetrics, operation } from "./engine-fixtures";

const directories: string[] = [];
const stores: Array<CreatorStore | StoryStore> = [];
const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_image_calls: 6, max_script_calls: 3, budget_usd: .5 };
afterEach(() => { stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });

async function fixture(inDefaultDirectory = false) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "lunatoon-scenery-")); directories.push(temporaryRoot);
  const directory = inDefaultDirectory ? path.join(temporaryRoot, "data") : temporaryRoot;
  const creator = new CreatorStore(directory); stores.push(creator);
  const draft = creator.createDraft({ operation_id: operation() }).draft;
  const foundation = StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, LAST_LIGHTKEEPER_TEMPLATE[key as keyof typeof LAST_LIGHTKEEPER_TEMPLATE]])), opening_beats: LAST_LIGHTKEEPER_TEMPLATE.opening_beats.slice(0, 3).map(({ caption, alt }) => ({ caption, alt })) });
  const prepared = creator.saveIllustratedVersion(draft.id, { operation_id: operation(), foundation, reference_asset_ids: [] });
  const provider: OpeningProvider = { prepare() {}, async image(context) {
    const bytes = await sharp({ create: { width: 16, height: 24, channels: 3, background: { r: context.panel.sequence * 45, g: 70, b: 100 } } }).jpeg().toBuffer();
    return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${bytes.toString("base64")}`, metrics: imageMetrics };
  } };
  const opening = new OpeningService(creator, provider);
  for (const panel of prepared.opening!.panels) await opening.generate(draft.id, 1, panel.id, { operation_id: operation(), retry: false, acknowledge_unknown: false });
  const bundle = getSavedTemplateBundle(draft.template_id, 1, directory)!;
  const story = new StoryStore(directory); stores.push(story);
  const run = story.createRun({ operation_id: operation(), approach: "text" }, models, limits, bundle);
  const snapshot = story.snapshot(run.id), asset = snapshot.bible.assets.find(item => item.id === bundle.template.opening_beats[0].asset_id)!;
  return { directory, creator, story, draft, foundation, snapshot, asset };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type OpeningConfig = { template_id: string; version: number; draft_id: string; foundation: StoryFoundation; panels: OpeningPanel[] };
function changeOpening(data: Fixture, change: (config: OpeningConfig) => void) {
  const db = new DatabaseSync(path.join(data.directory, "creator.sqlite"));
  try { const row = db.prepare("SELECT document FROM creator_openings WHERE template_id=? AND version=1").get(data.draft.template_id)!; const config = JSON.parse(String(row.document)) as OpeningConfig; change(config); db.prepare("UPDATE creator_openings SET document=? WHERE template_id=? AND version=1").run(JSON.stringify(config), data.draft.template_id); }
  finally { db.close(); }
}
function changeAsset(data: Fixture, change: (asset: CreatorAsset) => void) {
  const db = new DatabaseSync(path.join(data.directory, "creator.sqlite"));
  try { const row = db.prepare("SELECT document FROM creator_assets WHERE id=?").get(data.asset.id)!; const asset = CreatorAssetSchema.parse(JSON.parse(String(row.document))); change(asset); db.prepare("UPDATE creator_assets SET document=? WHERE id=?").run(JSON.stringify(asset), data.asset.id); }
  finally { db.close(); }
}
function fileHashes(directory: string): Record<string, string> {
  return Object.fromEntries(readdirSync(directory, { recursive: true }).map(String).filter(relative => lstatSync(path.join(directory, relative)).isFile()).sort().map(relative => [relative, createHash("sha256").update(readFileSync(path.join(directory, relative))).digest("hex")]));
}

describe("read-only Creator opening scenery compatibility", () => {
  it("uses the runtime's cwd/data default when LUNATOON_DATA_DIR is empty", async () => {
    const data = await fixture(true);
    const previousDirectory = process.env.LUNATOON_DATA_DIR;
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(path.dirname(data.directory));
    try {
      process.env.LUNATOON_DATA_DIR = "";
      expect(getSavedOpeningScenery(data.snapshot)).toEqual([data.asset.id]);
    } finally {
      cwd.mockRestore();
      if (previousDirectory === undefined) delete process.env.LUNATOON_DATA_DIR;
      else process.env.LUNATOON_DATA_DIR = previousDirectory;
    }
  });

  it("derives only the owned completed establishing scene without rewriting a legacy Bible, template or database", async () => {
    const data = await fixture();
    expect(data.snapshot.bible.template?.visual_references).toBeUndefined();
    const before = structuredClone(data.snapshot), hashes = fileHashes(data.directory);
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([data.asset.id]);
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([data.asset.id]);
    expect(data.snapshot).toEqual(before); expect(fileHashes(data.directory)).toEqual(hashes);
    const artwork = waitingArtworkForRun(data.snapshot, [data.asset.id]);
    expect(artwork).toEqual([{ asset_id: data.asset.id, src: `/api/runs/${data.snapshot.run.id}/assets/${data.asset.id}` }]);
    expect(JSON.stringify(artwork)).not.toContain("references/");
  });

  it("uses the frozen version rather than a newer draft or opening", async () => {
    const data = await fixture();
    const later = data.creator.saveIllustratedVersion(data.draft.id, { operation_id: operation(), foundation: { ...data.foundation, art_direction: "A changed future style must not reinterpret the old run." }, reference_asset_ids: [] });
    expect(later.opening?.version).toBe(2); expect(later.opening?.panels[0].status).toBe("pending");
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([data.asset.id]);
    const forged = structuredClone(data.snapshot); forged.bible.template!.version = 2;
    expect(getSavedOpeningScenery(forged, data.directory)).toEqual([]);
  });

  it.each(["unknown-shot", "medium-shot", "wrong-sequence", "pending", "error", "wrong-version", "wrong-draft", "wrong-asset", "wrong-order"] as const)("keeps the placeholder for %s metadata without guessing from descriptive text", async reason => {
    const data = await fixture();
    changeOpening(data, config => {
      config.panels[0].caption = "Scenic environment establishing landscape";
      config.panels[0].scene_description = "Scenic environment establishing landscape";
      if (reason === "unknown-shot") config.panels[0].shot_direction = "A wide scene maybe showing scenery";
      if (reason === "medium-shot") config.panels[0].shot_direction = openingShots[1];
      if (reason === "wrong-sequence") config.panels[0].sequence = 2;
      if (reason === "pending") config.panels[0].status = "pending";
      if (reason === "error") config.panels[0].error = { code: "synthetic", message: "Not a clean final", request_id: null, issues: [] };
      if (reason === "wrong-version") config.version = 2;
      if (reason === "wrong-draft") config.draft_id = operation();
      if (reason === "wrong-asset") config.panels[0].asset_id = config.panels[1].asset_id;
      if (reason === "wrong-order") config.panels.reverse();
    });
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([]);
  });

  it("does not infer a legacy role when the opening ledger is absent", async () => {
    const data = await fixture(); const db = new DatabaseSync(path.join(data.directory, "creator.sqlite"));
    try { db.exec("DROP TABLE creator_openings"); } finally { db.close(); }
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([]);
  });

  it.each(["foreign-owner", "reference-kind", "wrong-hash", "wrong-dimensions"] as const)("rejects %s asset metadata even when the pinned ID looks eligible", async reason => {
    const data = await fixture();
    changeAsset(data, asset => {
      if (reason === "foreign-owner") asset.draft_id = operation();
      if (reason === "reference-kind") asset.kind = "reference";
      if (reason === "wrong-hash") asset.sha256 = "a".repeat(64);
      if (reason === "wrong-dimensions") asset.width += 1;
    });
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([]);
  });

  it.each(["missing", "corrupt", "symlink"] as const)("falls back safely for a %s saved scenery file", async reason => {
    const data = await fixture(), file = path.join(data.directory, data.asset.path);
    if (reason === "missing") rmSync(file);
    if (reason === "corrupt") writeFileSync(file, Buffer.from("Not the verified saved image"));
    if (reason === "symlink") { const outside = path.join(data.directory, "synthetic-external.jpg"); writeFileSync(outside, readFileSync(file)); rmSync(file); symlinkSync(outside, file); }
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([]);
  });

  it.each(["run", "template", "draft"] as const)("does not reuse artwork after a %s tombstone", async kind => {
    const data = await fixture(); const db = new DatabaseSync(path.join(data.directory, "stories.sqlite"));
    const id = kind === "run" ? data.snapshot.run.id : kind === "template" ? data.draft.template_id : data.draft.id;
    try { db.prepare("INSERT INTO deletion_targets(kind,id,job_id) VALUES(?,?,?)").run(kind, id, operation()); } finally { db.close(); }
    expect(getSavedOpeningScenery(data.snapshot, data.directory)).toEqual([]);
  });

  it("rejects frozen-template/hash/path mismatches and cannot add an asset from another run", async () => {
    const data = await fixture(), foreign = await fixture();
    for (const edit of [
      (copy: typeof data.snapshot) => { copy.bible.template!.title = "Changed frozen title"; },
      (copy: typeof data.snapshot) => { copy.bible.assets.find(asset => asset.id === data.asset.id)!.sha256 = "b".repeat(64); },
      (copy: typeof data.snapshot) => { copy.bible.assets.find(asset => asset.id === data.asset.id)!.path = `references/${"b".repeat(64)}.jpg`; },
      (copy: typeof data.snapshot) => { copy.bible.assets = copy.bible.assets.filter(asset => asset.id !== data.asset.id); },
    ]) { const copy = structuredClone(data.snapshot); edit(copy); expect(getSavedOpeningScenery(copy, data.directory)).toEqual([]); }
    expect(getSavedOpeningScenery(data.snapshot, foreign.directory)).toEqual([]);
    expect(waitingArtworkForRun(data.snapshot, [foreign.asset.id])).toEqual([]);
    expect(() => data.story.readAsset(data.snapshot.run.id, foreign.asset.id)).toThrow();
  });
});
