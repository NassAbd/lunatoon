import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { StoryStore } from "../src/lib/story-engine/store";
import { StoryEngine } from "../src/lib/story-engine/service";
import type { StoryProvider } from "../src/lib/story-engine/provider";
import { CreatorStore, getSavedTemplateBundle } from "../src/lib/creator/store";
import { StoryFoundationSchema } from "../src/lib/story-engine/contracts";
import { getTemplateBundle } from "../src/lib/story-templates/server";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../src/lib/story-templates/catalog";
import { ContentDeletionService } from "../src/lib/content-management/service";
import { GenerateFoundationSchema } from "../src/lib/creator/contracts";
import { OpeningService, type OpeningProvider } from "../src/lib/creator/opening-service";
import sharp from "sharp";
import { isContentDeleted, withContentWriteLock } from "../src/lib/content-management/gate";
import { readFileIntents, writeManagedAsset } from "../src/lib/content-management/files";
import { chapterFixture, measuredMetrics, imageMetrics, jpegBase64, operation } from "./engine-fixtures";
const models = { story: "gpt-4.1-mini", image: "gpt-image-2.5-flare", quality: "low" as const };
const limits = { max_steps: 2, max_script_calls: 3, max_image_calls: 6, budget_usd: .5 };
const dirs: string[] = [], stores: { close(): void }[] = [];
function directory() { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-delete-")); dirs.push(dir); return dir; }
function setup() {
  const dir = directory(); let clock = Date.now(); const store = new StoryStore(dir, { now: () => clock, leaseMs: 1000 }); stores.push(store);
  const run = store.createRun({ operation_id: operation(), approach: "reference" }, models, limits);
  let calls = 0; const provider: StoryProvider = { prepare() {}, async script(context) { calls++; return { chapter: chapterFixture(context), metrics: measuredMetrics }; }, async image(panel) { calls++; return { panel_id: panel.script.panel_id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } };
  const engine = new StoryEngine(store, provider); const deletion = new ContentDeletionService(dir, { now: () => clock });
  return { dir, store, run, provider, engine, deletion, calls: () => calls, advance: () => { clock += 2000; } };
}
function remove(service: ContentDeletionService, kind: "run" | "creator", id: string) { const preview = service.preview({ kind, id }); return service.begin({ action: "begin", operation_id: operation(), kind, id, confirmation_revision: preview.confirmation_revision }); }
function count(dir: string, table: string) { const db = new DatabaseSync(path.join(dir, "stories.sqlite"), { readOnly: true }); try { return Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n); } finally { db.close(); } }
function creator(dir: string) { const store = new CreatorStore(dir); stores.push(store); const draft = store.createDraft({ operation_id: operation() }).draft; return { store, draft }; }
function foundation() {
  const source = LAST_LIGHTKEEPER_TEMPLATE; return StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, source[key as keyof typeof source]])), opening_beats: source.opening_beats.map(({ caption, alt }) => ({ caption, alt })) });
}
function save(store: CreatorStore, id: string) {
  const value = foundation();
  const asset = store.registerArtwork(id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", width: 800, height: 600, purpose: "Authored test artwork" });
  return store.saveTemplate(id, { operation_id: operation(), foundation: value, reference_asset_ids: [], cover_asset_id: asset.id, opening_asset_ids: value.opening_beats.map(() => asset.id) }).latest_template!;
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe("explicit resumable local content deletion", () => {
  it("keeps absent read-only previews/status empty and never deletes a built-in story", () => {
    const dir = directory(), service = new ContentDeletionService(dir);
    expect(service.list()).toEqual([]); expect(() => service.preview({ kind: "creator", id: operation() })).toThrow(); expect(readdirSync(dir)).toEqual([]);
    const test = setup(); expect(() => test.deletion.preview({ kind: "creator", id: "neon-protocol" })).toThrow(); expect(count(test.dir, "story_runs")).toBe(1);
  });



  it("rejects a Creator parent symlink before creating any external asset directory", () => {
    const dir = directory(), owned = creator(dir), outside = directory();
    symlinkSync(outside, path.join(dir, "creator"), "dir");
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWe8AAAAASUVORK5CYII=", "base64");
    expect(() => owned.store.addReference(owned.draft.id, { bytes, mime: "image/png", width: 1, height: 1, purpose: "Test reference" })).toThrow(/unavailable|path|verified/);
    expect(existsSync(path.join(outside, "assets"))).toBe(false); expect(owned.store.getDraft(owned.draft.id).assets).toHaveLength(0);
  });

  it("rejects a corrupted Creator-to-template relationship before touching bundled runs", () => {
    const s = setup(), owned = creator(s.dir); const bundle = getTemplateBundle("last-lightkeeper")!;
    const builtIn = s.store.createRun({ operation_id: operation(), approach: "reference" }, models, limits, bundle); const before = s.store.snapshot(builtIn.id);
    const db = new DatabaseSync(path.join(s.dir, "creator.sqlite"));
    try { db.prepare("UPDATE creator_drafts SET document=? WHERE id=?").run(JSON.stringify({ ...owned.draft, template_id: "last-lightkeeper" }), owned.draft.id); } finally { db.close(); }
    expect(() => s.deletion.preview({ kind: "creator", id: owned.draft.id })).toThrow(/ownership/);
    expect(() => s.deletion.begin({ action: "begin", operation_id: operation(), kind: "creator", id: owned.draft.id, confirmation_revision: "0".repeat(64) })).toThrow(/ownership/);
    expect(s.store.snapshot(builtIn.id)).toEqual(before); expect(isContentDeleted(s.dir, "draft", owned.draft.id)).toBe(false); expect(s.deletion.list()).toEqual([]);
  });

  it("previews legacy Creator-only storage without creating a reader database", () => {
    const dir = directory(), owned = creator(dir); const file = path.join(dir, "stories.sqlite");
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${file}${suffix}`, { force: true });
    const service = new ContentDeletionService(dir); const preview = service.preview({ kind: "creator", id: owned.draft.id });
    expect(preview.run_count).toBe(0); expect(existsSync(file)).toBe(false);
    expect(remove(service, "creator", owned.draft.id).status).toBe("complete");
  });
  it("discards a late Creator foundation response and prevents creation-operation resurrection", () => {
    const s = setup(); const owned = creator(s.dir); const request = GenerateFoundationSchema.parse({ operation_id: operation(), prompt: "A keeper follows a fading star home." });
    const claim = owned.store.claimGeneration(owned.draft.id, request);
    expect(() => remove(s.deletion, "creator", owned.draft.id)).toThrow(/in progress/);
    const later = new ContentDeletionService(s.dir, { now: () => Date.now() + 300_000 });
    expect(remove(later, "creator", owned.draft.id).status).toBe("complete");
    expect(() => owned.store.finishGeneration(owned.draft.id, claim.attempt.id, claim.claim_token!, { foundation: foundation(), metrics: measuredMetrics })).toThrow(/removed|deleted/);
    expect(() => owned.store.createDraft({ operation_id: owned.draft.operation_id })).toThrow(/removed|deleted/);
    expect(count(s.dir, "story_runs")).toBe(1);
  });
  it("preserves shared generated opening assets across creators and their immutable run copies", async () => {
    const s = setup(), a = creator(s.dir), b = creator(s.dir);
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "lime" } }).jpeg().toBuffer();
    const mock: OpeningProvider = { prepare() {}, async image(context) { return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${bytes.toString("base64")}`, metrics: imageMetrics }; } };
    for (const owned of [a, b]) {
      const prepared = owned.store.saveIllustratedVersion(owned.draft.id, { operation_id: operation(), foundation: foundation(), reference_asset_ids: [] });
      const service = new OpeningService(owned.store, mock);
      for (const panel of prepared.opening!.panels) await service.generate(owned.draft.id, prepared.opening!.version, panel.id, { operation_id: operation(), retry: false, acknowledge_unknown: false });
    }
    const version = a.store.getDraft(a.draft.id).latest_template!; const bundle = getSavedTemplateBundle(version.id, version.version, s.dir)!;
    const run = s.store.createRun({ operation_id: operation(), approach: "text" }, models, limits, { template: bundle.template, assets: bundle.assets });
    const saved = s.store.snapshot(run.id); const file = path.join(s.dir, saved.bible.assets[0].path);
    expect(remove(s.deletion, "run", run.id).status).toBe("complete"); expect(existsSync(file)).toBe(true);
    remove(s.deletion, "creator", a.draft.id); expect(existsSync(file)).toBe(true); expect(b.store.getDraft(b.draft.id).opening?.status).toBe("ready");
    remove(s.deletion, "creator", b.draft.id); expect(existsSync(file)).toBe(false);
    const db = new DatabaseSync(path.join(s.dir, "creator.sqlite"), { readOnly: true });
    try { for (const name of ["creator_drafts", "creator_assets", "creator_templates", "creator_openings", "creator_opening_attempts"]) expect(db.prepare(`SELECT count(*) AS n FROM ${name}`).get()?.n).toBe(0); } finally { db.close(); }
  });
  it("fences an interrupted opening response before any asset or ready version can be recreated", async () => {
    const s = setup(), owned = creator(s.dir); const prepared = owned.store.saveIllustratedVersion(owned.draft.id, { operation_id: operation(), foundation: foundation(), reference_asset_ids: [] });
    const opening = prepared.opening!, panel = opening.panels[0]; const value = { operation_id: operation(), retry: false, acknowledge_unknown: false };
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    const service = new OpeningService(owned.store, { prepare() {}, async image() { await pending; return { panel_id: panel.id, image_url: `data:image/jpeg;base64,${jpegBase64}`, metrics: imageMetrics }; } });
    const generation = service.generate(owned.draft.id, opening.version, panel.id, value);
    expect(() => remove(s.deletion, "creator", owned.draft.id)).toThrow(/in progress/);
    remove(new ContentDeletionService(s.dir, { now: () => Date.now() + 300_000 }), "creator", owned.draft.id); const before = readFileIntents(s.dir).length; release();
    await expect(generation).rejects.toMatchObject({ code: "content_deleted" }); expect(readFileIntents(s.dir)).toHaveLength(before);
  });

  it("removes one run including superseded image attempts while preserving a sibling and immutable references", async () => {
    const s = setup(); const sibling = s.store.createRun({ operation_id: operation(), approach: "reference" }, models, limits); const before = s.store.snapshot(sibling.id);
    const written = await s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "investigate", instruction: "Private test instruction" });
    for (const panel of written.panels) await s.engine.image(s.run.id, panel.id, { operation_id: panel.operation_id, retry: false });
    const paths = s.store.snapshot(s.run.id).panels.map(panel => panel.image_path!);
    s.store.replay(s.run.id, written.nodes[0].id, { operation_id: operation(), approach: "text" });
    const pending = s.store.snapshot(s.run.id).panels[0]; await s.engine.image(s.run.id, pending.id, { operation_id: pending.operation_id, retry: false });
    paths.push(s.store.snapshot(s.run.id).panels[0].image_path!); const calls = s.calls();
    const receipt = remove(s.deletion, "run", s.run.id); expect(receipt.status).toBe("complete"); expect(receipt.deleted_run_count).toBe(1);
    for (const file of paths) expect(existsSync(path.join(s.dir, file))).toBe(false);
    expect(s.store.snapshot(sibling.id)).toEqual(before); expect(s.calls()).toBe(calls); expect(count(s.dir, "generation_events")).toBe(0);
    expect(() => s.engine.snapshot(s.run.id)).toThrow(/removed|deleted/); expect(() => s.store.createRun({ operation_id: s.run.operation_id, approach: "reference" }, models, limits)).toThrow(/removed|deleted/);
    expect(s.deletion.resume(receipt.operation_id)).toEqual(receipt);
  });
  it("fences late scripts and the receipt-to-image-write window without recreating files or rows", async () => {
    const s = setup(); let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); s.provider.script = async context => { await wait; return { chapter: chapterFixture(context), metrics: measuredMetrics }; };
    const pending = s.engine.decide(s.run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" });
    expect(() => remove(s.deletion, "run", s.run.id)).toThrow(/in progress/i); s.advance(); remove(s.deletion, "run", s.run.id); release();
    await expect(pending).rejects.toMatchObject({ code: "content_deleted" }); expect(count(s.dir, "story_runs")).toBe(0); expect(count(s.dir, "generation_events")).toBe(0);
    const other = setup(); const written = await other.engine.decide(other.run.id, { operation_id: operation(), choice_id: "investigate", instruction: "" }); const panel = written.panels[0];
    const claim = other.store.claimImage(other.run.id, panel.id, { operation_id: panel.operation_id, retry: false })!; const relative = other.store.recordImageReceipt(claim, imageMetrics)!;
    other.advance(); remove(other.deletion, "run", other.run.id);
    expect(other.store.writeClaimedImage(claim, Buffer.from(jpegBase64, "base64"))).toBe(false); expect(existsSync(path.join(other.dir, relative))).toBe(false);
  });
  it("counts creator versions and associated runs, rejects stale confirmation and preserves shared files", () => {
    const s = setup(), a = creator(s.dir), b = creator(s.dir); const first = save(a.store, a.draft.id); save(b.store, b.draft.id);
    const bundle = getSavedTemplateBundle(first.id, first.version, s.dir)!; const input = { template: bundle.template, assets: bundle.assets.map(asset => ({ id: asset.id, bytes: asset.bytes, mime: asset.mime, purpose: asset.purpose })) };
    s.store.createRun({ operation_id: operation(), approach: "text", template_id: first.id, template_version: 1 }, models, limits, input);
    const preview = s.deletion.preview({ kind: "creator", id: a.draft.id }); expect(preview.run_count).toBe(1); expect(preview.version_count).toBe(1);
    s.store.createRun({ operation_id: operation(), approach: "text", template_id: first.id, template_version: 1 }, models, limits, input);
    expect(() => s.deletion.begin({ action: "begin", operation_id: operation(), kind: "creator", id: a.draft.id, confirmation_revision: preview.confirmation_revision })).toThrow(/changed/i);
    const shared = a.store.getDraft(a.draft.id).assets[0]; const file = path.join(s.dir, "creator/assets", `${shared.sha256}.svg`);
    expect(remove(s.deletion, "creator", a.draft.id).deleted_run_count).toBe(2); expect(existsSync(file)).toBe(true); expect(b.store.getDraft(b.draft.id).draft.id).toBe(b.draft.id);
    expect(() => s.store.createRun({ operation_id: operation(), approach: "text" }, models, limits, input)).toThrow(/removed|deleted/); expect(s.store.snapshot(s.run.id).run.id).toBe(s.run.id);
    remove(s.deletion, "creator", b.draft.id); expect(existsSync(file)).toBe(false);
  });
  it("resumes each durable deletion phase after a simulated interruption and keeps duplicate payloads honest", () => {
    for (const phase of ["marked", "creator_removed", "records_removed", "file_removed"] as const) {
      const s = setup(); const asset = `images/${s.run.id}/${operation()}.jpg`; writeManagedAsset(s.dir, { owner_kind: "run", owner_id: s.run.id, path: asset, bytes: Buffer.from(jpegBase64, "base64") });
      const service = new ContentDeletionService(s.dir, { checkpoint: name => { if (name === phase) throw new Error("synthetic interruption"); } }); const preview = service.preview({ kind: "run", id: s.run.id }); const input = { action: "begin" as const, operation_id: operation(), kind: "run" as const, id: s.run.id, confirmation_revision: preview.confirmation_revision };
      expect(() => service.begin(input)).toThrow(/synthetic interruption/); expect(isContentDeleted(s.dir, "run", s.run.id)).toBe(true);
      const restored = new ContentDeletionService(s.dir); expect(restored.list()).toHaveLength(1); expect(restored.begin(input).status).toBe("complete"); expect(existsSync(path.join(s.dir, asset))).toBe(false); expect(restored.list()).toEqual([]);
      expect(() => restored.begin({ ...input, id: operation() })).toThrow(/operation/i);
    }
  });
  it("refuses symlink cleanup, keeps the outside file intact, and resumes after a safe manual repair", () => {
    const s = setup(); const asset = `images/${s.run.id}/${operation()}.jpg`; writeManagedAsset(s.dir, { owner_kind: "run", owner_id: s.run.id, path: asset, bytes: Buffer.from(jpegBase64, "base64") });
    const outside = path.join(directory(), "outside.jpg"); writeFileSync(outside, "preserve"); unlinkSync(path.join(s.dir, asset)); symlinkSync(outside, path.join(s.dir, asset));
    const receipt = remove(s.deletion, "run", s.run.id); expect(receipt.status).toBe("cleanup_failed"); expect(receipt.error_code).toBe("unsafe_cleanup_path"); expect(readFileSync(outside, "utf8")).toBe("preserve");
    unlinkSync(path.join(s.dir, asset)); expect(s.deletion.resume(receipt.operation_id).status).toBe("complete"); expect(readFileSync(outside, "utf8")).toBe("preserve");
  });

  it("retains another living draft's journaled asset after a rolled-back row commit, then deletes its last owner", () => {
    const s = setup(), a = creator(s.dir), b = creator(s.dir); const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const asset = a.store.registerArtwork(a.draft.id, { bytes, mime: "image/svg+xml", width: 800, height: 600, purpose: "Authored test artwork" });
    const relative = `creator/assets/${asset.sha256}.svg`;
    expect(() => withContentWriteLock(s.dir, () => { writeManagedAsset(s.dir, { owner_kind: "draft", owner_id: b.draft.id, path: relative, bytes }); throw new Error("synthetic row rollback"); })).toThrow(/rollback/);
    expect(b.store.getDraft(b.draft.id).assets).toHaveLength(0);
    remove(s.deletion, "creator", a.draft.id); expect(existsSync(path.join(s.dir, relative))).toBe(true);
    remove(s.deletion, "creator", b.draft.id); expect(existsSync(path.join(s.dir, relative))).toBe(false);
  });
  it("recovers an incomplete final intent append without sweeping unknown files", () => {
    const s = setup(); const bytes = Buffer.from(jpegBase64, "base64"), asset = `images/${s.run.id}/${operation()}.jpg`;
    writeManagedAsset(s.dir, { owner_kind: "run", owner_id: s.run.id, path: asset, bytes });
    const journal = path.join(s.dir, "content-write-intents.jsonl"); writeFileSync(journal, '{"owner_kind":', { flag: "a" });
    expect(readFileIntents(s.dir)).toHaveLength(1);
    const second = `images/${s.run.id}/${operation()}.jpg`; writeManagedAsset(s.dir, { owner_kind: "run", owner_id: s.run.id, path: second, bytes });
    expect(readFileIntents(s.dir)).toHaveLength(2); expect(readFileIntents(s.dir)[1].sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    remove(s.deletion, "run", s.run.id); expect(existsSync(path.join(s.dir, asset))).toBe(false); expect(existsSync(path.join(s.dir, second))).toBe(false);
  });

  it("removes only journaled owned temporary files and leaves unknown local artifacts alone", () => {
    const s = setup(); const asset = `images/${s.run.id}/${operation()}.jpg`; writeManagedAsset(s.dir, { owner_kind: "run", owner_id: s.run.id, path: asset, bytes: Buffer.from(jpegBase64, "base64") });
    const intent = readFileIntents(s.dir).at(-1)!; writeFileSync(path.join(s.dir, intent.temporary), "interrupted bytes"); const unknown = path.join(s.dir, "unknown-private.tmp"); writeFileSync(unknown, "preserve unknown ownership");
    expect(remove(s.deletion, "run", s.run.id).status).toBe("complete"); expect(existsSync(path.join(s.dir, intent.temporary))).toBe(false); expect(existsSync(unknown)).toBe(true);
  });
});
