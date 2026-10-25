import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { CreatorStore, getSavedTemplate } from "../src/lib/creator/store";
import { OpeningService, type OpeningProvider } from "../src/lib/creator/opening-service";
import { SaveDraftSchema } from "../src/lib/creator/opening-contracts";
import { validateStoryTemplate } from "../src/lib/story-engine/state";
import { runningHellFoundation, runningHellTemplate } from "./running-hell-fixtures";
import { operation, imageMetrics } from "./engine-fixtures";

const stores: CreatorStore[] = [], directories: string[] = [];
const png = await sharp({ create: { width: 16, height: 24, channels: 3, background: "#af3131" } }).png().toBuffer();
const jpeg = await sharp(png).jpeg().toBuffer();
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-role-storage-")); directories.push(directory);
  const store = new CreatorStore(directory); stores.push(store);
  const id = store.createDraft({ operation_id: operation() }).draft.id;
  const refs = ["Original setting", "Original protagonist", "Original style"].map(purpose => store.addReference(id, { bytes: png, mime: "image/png", width: 16, height: 24, purpose }));
  const value = { operation_id: operation(), foundation: runningHellFoundation(), reference_asset_ids: refs.map(ref => ref.id), visual_references: [{ asset_id: refs[0].id, role: "environment" as const }, { asset_id: refs[1].id, role: "protagonist" as const }, { asset_id: refs[2].id, role: "style" as const }] };
  return { store, id, refs, value };
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });

it("saves explicit roles without paid work and freezes them into each opening version", () => {
  const { store, id, value } = setup();
  expect(SaveDraftSchema.parse(value)).toEqual(value);
  const draft = store.saveDraft(id, value); expect(draft.draft.visual_references).toEqual(value.visual_references); expect(draft.opening).toBeNull();
  const frozen = store.saveIllustratedVersion(id, { ...value, operation_id: operation() });
  expect(frozen.latest_template?.visual_references).toEqual(value.visual_references);
  expect(frozen.opening?.visual_references).toEqual(value.visual_references);
  const context = store.getOpeningContext(id, 1, frozen.opening!.panels[0].id);
  expect(context.references.map(ref => ref.id)).toEqual([value.reference_asset_ids[1], value.reference_asset_ids[0], value.reference_asset_ids[2]]);
  expect(context.visual_references).toEqual(value.visual_references);
  expect(frozen.opening?.summary.calls).toBe(0);
});

it("rejects foreign, duplicate and multiple-protagonist assignments before saving or reserving calls", () => {
  const { store, id, value } = setup();
  for (const visual_references of [
    [{ asset_id: "ref_foreign", role: "protagonist" as const }],
    [{ asset_id: value.reference_asset_ids[0], role: "protagonist" as const }, { asset_id: value.reference_asset_ids[1], role: "protagonist" as const }],
    [{ asset_id: value.reference_asset_ids[0], role: "environment" as const }, { asset_id: value.reference_asset_ids[0], role: "style" as const }],
  ]) {
    expect(() => store.saveIllustratedVersion(id, { ...value, visual_references })).toThrow();
    expect(() => store.saveDraft(id, { ...value, visual_references })).toThrow();
    expect(() => validateStoryTemplate({ ...runningHellTemplate(), reference_asset_ids: value.reference_asset_ids, visual_references })).toThrow();
  }
  expect(store.getDraft(id).latest_template).toBeNull(); expect(store.getDraft(id).opening).toBeNull();
});

it("does not reuse artwork after a role change and keeps previous versions and references immutable", async () => {
  const { store, id, value } = setup();
  const saved = store.saveIllustratedVersion(id, value);
  const provider: OpeningProvider = { prepare() {}, async image(context) { return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, metrics: imageMetrics }; } };
  const complete = await new OpeningService(store, provider).generate(id, 1, saved.opening!.panels[0].id, { operation_id: operation(), retry: false, acknowledge_unknown: false });
  const old = JSON.stringify(complete.latest_template);
  const unchanged = store.saveIllustratedVersion(id, { ...value, operation_id: operation() });
  expect(unchanged.opening?.status).toBe("ready"); expect(unchanged.opening?.summary.calls).toBe(0);
  const changed = store.saveIllustratedVersion(id, { ...value, operation_id: operation(), visual_references: [{ asset_id: value.reference_asset_ids[0], role: "protagonist" }] });
  expect(changed.opening?.panels[0].status).toBe("pending"); expect(changed.opening?.summary.calls).toBe(0);
  expect(JSON.stringify(getSavedTemplate(complete.draft.template_id, 1, store.directory))).toBe(old);
  store.removeReference(id, value.reference_asset_ids[0]);
  expect(store.getDraft(id).draft.visual_references).toEqual([]);
  expect(store.getOpeningContext(id, 1, saved.opening!.panels[0].id).references).toHaveLength(3);
});

it("keeps old records unassigned and does not infer a protagonist from upload order", () => {
  const { store, id, value } = setup(); const { visual_references: omitted, ...legacy } = value; void omitted;
  const saved = store.saveIllustratedVersion(id, legacy);
  expect(saved.latest_template?.visual_references).toBeUndefined();
  expect(saved.draft.visual_references).toBeUndefined();
  expect(store.getOpeningContext(id, 1, saved.opening!.panels[0].id).references.map(ref => ref.id)).toEqual(value.reference_asset_ids);
  expect(validateStoryTemplate(runningHellTemplate()).visual_references).toBeUndefined();
});
