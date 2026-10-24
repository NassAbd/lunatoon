import { mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorStore, getSavedTemplate, getSavedTemplateBundle } from "../src/lib/creator/store";
import { OpeningService, openAIOpeningProvider, type OpeningProvider } from "../src/lib/creator/opening-service";
import { StoryFoundationSchema } from "../src/lib/story-engine/contracts";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../src/lib/story-templates/catalog";
import { operation } from "./engine-fixtures";
import type { Metrics } from "../src/lib/contracts";
import sharp from "sharp";
import OpenAI from "openai";
import * as ai from "../src/lib/server/ai";
import { DatabaseSync } from "node:sqlite";

const now = Date.parse("2026-10-24T12:00:00Z");
const directories: string[] = [], stores: CreatorStore[] = [];
const jpeg = await sharp({ create: { width: 12, height: 18, channels: 3, background: "#D9F77C" } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 12, height: 18, channels: 3, background: "#D9F77C" } }).png().toBuffer();
const metrics: Metrics = { model: "gpt-image-2.5-flare", quality: "low", duration_ms: 10, request_id: "req_opening", usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300, input_text_tokens: 100, input_image_tokens: 100 } };
function setup(options: ConstructorParameters<typeof CreatorStore>[1] = {}) { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-opening-")); directories.push(dir); const store = new CreatorStore(dir, { now: () => now, ...options }); stores.push(store); return store; }
function foundation() { const source = LAST_LIGHTKEEPER_TEMPLATE; return StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, source[key as keyof typeof source]])), opening_beats: source.opening_beats.slice(0, 3).map(({ caption, alt }) => ({ caption, alt })) }); }
function save() { return { operation_id: operation(), foundation: foundation(), reference_asset_ids: [] as string[] }; }
function provider(): OpeningProvider { return { prepare() {}, async image(context) { return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, metrics }; } }; }
function input() { return { operation_id: operation(), retry: false, acknowledge_unknown: false }; }
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe("durable Creator opening illustrations", () => {
  it("does not claim or contact a provider for an already-aborted image request", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const opening = store.saveIllustratedVersion(id, save()).opening!;
    const mock = provider(); const prepare = vi.spyOn(mock, "prepare"); const image = vi.spyOn(mock, "image"); const controller = new AbortController(); controller.abort();
    await expect(new OpeningService(store, mock).generate(id, 1, opening.panels[0].id, input(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(prepare).not.toHaveBeenCalled(); expect(image).not.toHaveBeenCalled(); expect(store.getDraft(id).opening?.summary).toMatchObject({ calls: 0, held_micro_usd: 0 });
  });

  it("saves draft without publishing or paid work; prepares a nonplayable frozen version idempotently", () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const value = save();
    const draft = store.saveDraft(id, value); expect(draft.draft.foundation).toEqual(value.foundation); expect(draft.latest_template).toBeNull(); expect(draft.opening).toBeNull();
    expect(store.saveDraft(id, value)).toEqual(draft);
    const illustrated = { ...value, operation_id: operation() }; const prepared = store.saveIllustratedVersion(id, illustrated);
    expect(prepared.latest_template?.status).toBe("draft"); expect(prepared.opening?.panels).toHaveLength(3); expect(prepared.opening?.summary.calls).toBe(0);
    expect(getSavedTemplate(prepared.draft.template_id, undefined, store.directory)).toBeNull(); expect(store.saveIllustratedVersion(id, illustrated)).toEqual(prepared);
    expect(() => store.saveIllustratedVersion(id, { ...illustrated, foundation: { ...value.foundation, title: "Changed" } })).toThrow(/operation/i);
  });

  it("completes independent scenes, publishes only all finals, reuses exact visuals and survives reopening", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const prepared = store.saveIllustratedVersion(id, save()); const version = prepared.opening!.version;
    let calls = 0; const mock = provider(); const original = mock.image; mock.image = async (...args) => { calls++; return original(...args); }; const service = new OpeningService(store, mock);
    const panels = prepared.opening!.panels;
    await service.generate(id, version, panels[1].id, input()); expect(store.getDraft(id).latest_template?.status).toBe("draft");
    const asset = store.readOpeningAsset(id, version, panels[1].id); expect(asset.bytes).toEqual(jpeg);
    await service.generate(id, version, panels[0].id, input()); const completed = await service.generate(id, version, panels[2].id, input());
    expect(completed.opening?.status).toBe("ready"); expect(completed.latest_template?.status).toBe("ready"); expect(completed.latest_template?.cover_asset_id).toBe(completed.opening?.panels[0].asset_id);
    expect(getSavedTemplateBundle(completed.draft.template_id, version, store.directory)?.assets.every(asset => asset.mime === "image/jpeg")).toBe(true);
    const first = completed.assets.find(asset => asset.id === completed.latest_template?.cover_asset_id)!; expect(existsSync(path.join(store.directory, "references", `${first.sha256}.jpg`))).toBe(true);
    const reopened = new CreatorStore(store.directory, { now: () => now }); stores.push(reopened); expect(reopened.getDraft(id)).toEqual(completed);
    const revised = store.saveIllustratedVersion(id, { ...save(), foundation: { ...foundation(), title: "New display title" } }); expect(revised.opening?.status).toBe("ready"); expect(revised.opening?.summary.calls).toBe(0); expect(calls).toBe(3);
    expect(getSavedTemplate(completed.draft.template_id, version, store.directory)).toEqual(completed.latest_template);
    const changed = store.saveIllustratedVersion(id, { ...save(), foundation: { ...foundation(), art_direction: "A distinct original ink and wash palette." } }); expect(changed.opening?.panels.every(panel => panel.status === "pending")).toBe(true);
    expect(getSavedTemplate(completed.draft.template_id, undefined, store.directory)?.version).toBe(revised.opening?.version);
  });

  it("does not duplicate active claims, retains unknown failures, and retries only one scene explicitly", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const initial = store.saveIllustratedVersion(id, save()); const opening = initial.opening!;
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
    const mock = provider(); mock.image = async context => { calls++; await waiting; if (calls === 1) throw new Error("private provider text"); return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, metrics }; };
    const service = new OpeningService(store, mock); const value = input(); const first = service.generate(id, opening.version, opening.panels[0].id, value);
    expect((await service.generate(id, opening.version, opening.panels[0].id, value)).opening?.summary.calls).toBe(1); expect(calls).toBe(1); release(); const failed = await first;
    expect(failed.opening?.summary.unknown_cost_attempts).toBe(1); expect(JSON.stringify(failed)).not.toContain("private provider text");
    await expect(service.generate(id, opening.version, opening.panels[0].id, input())).rejects.toMatchObject({ code: "explicit_retry_required" });
    await expect(service.generate(id, opening.version, opening.panels[0].id, { ...input(), retry: true })).rejects.toMatchObject({ code: "unknown_cost_confirmation" });
    const final = await service.generate(id, opening.version, opening.panels[0].id, { ...input(), retry: true, acknowledge_unknown: true }); expect(calls).toBe(2); expect(final.opening?.panels[0].status).toBe("complete"); expect(final.opening?.panels[1].status).toBe("pending");
  });

  it("pins old operation replays to their version without starting or displaying a newer version", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const original = save(); const first = store.saveIllustratedVersion(id, original); const image = input();
    const service = new OpeningService(store, provider()); await service.generate(id, first.opening!.version, first.opening!.panels[0].id, image);
    const second = store.saveIllustratedVersion(id, { ...save(), foundation: { ...foundation(), world: "A new coastal setting changes the visual context." } });
    const replay = store.saveIllustratedVersion(id, original); expect(replay.opening?.version).toBe(1); expect(replay.latest_template?.version).toBe(1); expect(replay.draft.latest_saved_version).toBe(2);
    const imageReplay = await service.generate(id, first.opening!.version, first.opening!.panels[0].id, image); expect(imageReplay.opening?.version).toBe(1); expect(imageReplay.opening?.summary.calls).toBe(1);
    expect(store.getDraft(id).opening).toEqual(second.opening);
  });

  it("only reuses verified artwork; missing final files leave the explicitly prepared version pending", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const initial = store.saveIllustratedVersion(id, save()); const opening = initial.opening!;
    const finished = await new OpeningService(store, provider()).generate(id, opening.version, opening.panels[0].id, input()); const asset = finished.assets.find(item => item.id === finished.opening!.panels[0].asset_id)!;
    rmSync(path.join(store.directory, "references", `${asset.sha256}.jpg`));
    const prepared = store.saveIllustratedVersion(id, save()); expect(prepared.opening?.panels[0].status).toBe("pending"); expect(prepared.opening?.summary.calls).toBe(0);
    expect(store.getDraft(id).opening?.summary.calls).toBe(0); expect(getSavedTemplate(initial.draft.template_id, 1, store.directory)?.opening_beats[0].asset_id).toBe(asset.id);
  });

  it("holds unknown attempts across lease expiry and fences late finals while reconciling usage", async () => {
    let clock = now; const store = setup({ now: () => clock, leaseMs: 1000 }); const id = store.createDraft({ operation_id: operation() }).draft.id; const opening = store.saveIllustratedVersion(id, save()).opening!;
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
    const mock = provider(); mock.image = async context => { const number = ++calls; if (number === 1) await waiting; return { panel_id: context.panel.id, image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, metrics: { ...metrics, request_id: `req_${number}` } }; };
    const service = new OpeningService(store, mock); const firstInput = input(); const first = service.generate(id, 1, opening.panels[0].id, firstInput);
    clock += 1001; const expired = store.getDraft(id); expect(expired.opening?.panels[0].status).toBe("interrupted"); expect(expired.opening?.summary.held_micro_usd).toBe(55_000);
    expect((await service.generate(id, 1, opening.panels[0].id, firstInput)).opening?.summary.calls).toBe(1); expect(calls).toBe(1);
    const retried = await service.generate(id, 1, opening.panels[0].id, { ...input(), retry: true, acknowledge_unknown: true }); const savedId = retried.opening!.panels[0].asset_id;
    release(); const late = await first; expect(late.opening?.panels[0].asset_id).toBe(savedId); expect(late.opening?.attempts.map(item => item.status)).toEqual(["interrupted", "succeeded"]); expect(late.opening?.summary.unknown_cost_attempts).toBe(0); expect(late.opening?.attempts[0].metrics?.request_id).toBe("req_1"); expect(calls).toBe(2);
  });

  it("reserves concurrently against separate image budgets and hard call limits before provider calls", async () => {
    const limited = setup({ openingLimits: { max_calls: 8, budget_usd: .06 } }); const id = limited.createDraft({ operation_id: operation() }).draft.id; const opening = limited.saveIllustratedVersion(id, save()).opening!;
    limited.claimOpening(id, 1, opening.panels[0].id, input()); let calls = 0; const mock = provider(); mock.image = async () => { calls++; throw new Error("must not run"); };
    await expect(new OpeningService(limited, mock).generate(id, 1, opening.panels[1].id, input())).rejects.toMatchObject({ code: "opening_budget_limit" }); expect(calls).toBe(0); expect(limited.getDraft(id).opening?.summary.calls).toBe(1);
    const capped = setup({ openingLimits: { max_calls: 1, budget_usd: 1 } }); const other = capped.createDraft({ operation_id: operation() }).draft.id; const panels = capped.saveIllustratedVersion(other, save()).opening!.panels;
    await new OpeningService(capped, provider()).generate(other, 1, panels[0].id, input()); await expect(new OpeningService(capped, mock).generate(other, 1, panels[1].id, input())).rejects.toMatchObject({ code: "opening_call_limit" }); expect(calls).toBe(0);
  });

  it("retains returned usage before rejecting corrupt final images, and keeps unverified pricing unknown", async () => {
    const store = setup({ openingModel: "unpriced-image-model" }); const id = store.createDraft({ operation_id: operation() }).draft.id; const opening = store.saveIllustratedVersion(id, save()).opening!;
    const mock = provider(); mock.image = async context => ({ panel_id: context.panel.id, image_url: "data:image/jpeg;base64,/9j/2Q==", metrics });
    const failed = await new OpeningService(store, mock).generate(id, 1, opening.panels[0].id, input()); expect(failed.opening?.panels[0].status).toBe("failed"); expect(failed.opening?.attempts[0].error?.code).toBe("invalid_opening_image"); expect(failed.opening?.attempts[0].metrics).toEqual(metrics); expect(failed.opening?.summary.unpriced_attempts).toBe(1); expect(failed.opening?.attempts[0].estimated_micro_usd).toBeNull(); expect(failed.assets).toHaveLength(0);
    const known = setup(); const knownId = known.createDraft({ operation_id: operation() }).draft.id; const knownOpening = known.saveIllustratedVersion(knownId, save()).opening!; const knownFailure = await new OpeningService(known, mock).generate(knownId, 1, knownOpening.panels[0].id, input()); expect(knownFailure.opening?.attempts[0].estimated_micro_usd).toBe(4300); expect(knownFailure.opening?.summary.unknown_cost_attempts).toBe(0);
  });

  it("freezes reference ownership and settings, changes visual fingerprints and never mutates previous ready placeholder versions", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const ref = store.addReference(id, { bytes: png, mime: "image/png", width: 12, height: 18, purpose: "Character and style" });
    const art = store.registerArtwork(id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", width: 800, height: 600, purpose: "Original placeholder" });
    const f = foundation(); const legacy = store.saveTemplate(id, { operation_id: operation(), foundation: f, reference_asset_ids: [ref.id], cover_asset_id: art.id, opening_asset_ids: f.opening_beats.map(() => art.id) });
    const next = store.saveIllustratedVersion(id, { ...save(), reference_asset_ids: [ref.id] }); expect(next.opening?.panels.every(item => item.status === "pending")).toBe(true); expect(getSavedTemplate(legacy.draft.template_id, undefined, store.directory)).toEqual(legacy.latest_template);
    store.removeReference(id, ref.id); expect(store.getOpeningContext(id, 2, next.opening!.panels[0].id).references[0].bytes).toEqual(png);
    const noReference = store.saveIllustratedVersion(id, save()); expect(noReference.opening?.panels[0].context_hash).not.toBe(next.opening?.panels[0].context_hash); expect(noReference.opening?.approach).toBe("text"); expect(getSavedTemplate(legacy.draft.template_id, 1, store.directory)).toEqual(legacy.latest_template);
  });

  it("persists out-of-order concurrent finals independently while previews remain transient", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const opening = store.saveIllustratedVersion(id, save()).opening!;
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; }); const preview = { image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, elapsed_ms: 1 };
    const mock = provider(); mock.image = async (context, _signal, onPreview) => { onPreview?.(preview); if (context.panel.sequence === 1) await waiting; return { panel_id: context.panel.id, image_url: preview.image_url, metrics }; };
    const service = new OpeningService(store, mock); const onPreview = vi.fn(); const first = service.generate(id, 1, opening.panels[0].id, input(), undefined, onPreview);
    expect(onPreview).toHaveBeenCalledTimes(1); expect(store.getDraft(id).assets).toHaveLength(0);
    const second = await service.generate(id, 1, opening.panels[1].id, input(), undefined, onPreview); expect(second.opening?.panels.map(item => item.status)).toEqual(["running", "complete", "pending"]);
    release(); const final = await first; expect(final.opening?.panels.map(item => item.status)).toEqual(["complete", "complete", "pending"]); expect(onPreview).toHaveBeenCalledTimes(2);
  });

  it("migrates existing Creator records without changing their immutable ready versions", () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const f = foundation(); const art = store.registerArtwork(id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", width: 800, height: 600, purpose: "Original placeholder" });
    const saved = store.saveTemplate(id, { operation_id: operation(), foundation: f, reference_asset_ids: [], cover_asset_id: art.id, opening_asset_ids: f.opening_beats.map(() => art.id) });
    store.close(); stores.splice(stores.indexOf(store), 1); const db = new DatabaseSync(path.join(store.directory, "creator.sqlite")); db.exec("DROP TABLE creator_opening_attempts; DROP TABLE creator_openings; DROP TABLE creator_draft_saves; PRAGMA user_version=1;"); db.close();
    expect(getSavedTemplate(saved.draft.template_id, 1, store.directory)).toEqual(saved.latest_template);
    const migrated = new CreatorStore(store.directory, { now: () => now }); stores.push(migrated); expect(migrated.getDraft(id)).toEqual(saved); expect(migrated.saveIllustratedVersion(id, save()).opening?.version).toBe(2); expect(getSavedTemplate(saved.draft.template_id, 1, store.directory)).toEqual(saved.latest_template);
  });
});

describe("Creator opening SDK transport (mocked; no provider calls)", () => {
  it("retains request ID and unknown usage on truncated streams without saving previews or retrying", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const ref = store.addReference(id, { bytes: png, mime: "image/png", width: 12, height: 18, purpose: "Reference" }); const opening = store.saveIllustratedVersion(id, { ...save(), reference_asset_ids: [ref.id] }).opening!;
    let calls = 0; const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async url => { if (String(url) === "data:,") return new Response(""); calls++; return new Response(`data: ${JSON.stringify({ type: "image_edit.partial_image", partial_image_index: 0, b64_json: jpeg.toString("base64"), output_format: "jpeg" })}\n\n`, { headers: { "content-type": "text/event-stream", "x-request-id": "req_incomplete_opening" } }); } });
    vi.spyOn(ai, "getClient").mockReturnValue(client); const previews = vi.fn(); const service = new OpeningService(store, openAIOpeningProvider()); const request = input(); const failed = await service.generate(id, 1, opening.panels[0].id, request, undefined, previews);
    expect(calls).toBe(1); expect(previews).toHaveBeenCalledTimes(1); expect(failed.opening?.attempts[0]).toMatchObject({ status: "failed", estimated_micro_usd: null, metrics: { request_id: "req_incomplete_opening", usage: null, partial_images_received: 1 }, error: { code: "incomplete_image_stream" } }); expect(failed.opening?.panels[0].asset_id).toBeNull(); expect(failed.assets.every(item => item.kind === "reference")).toBe(true);
    await service.generate(id, 1, opening.panels[0].id, request); expect(calls).toBe(1);
  });

  it.each([0, 1, 3])("uses %i frozen references with scenes 3/4 and unchanged model, quality and final accounting", async referenceCount => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id;
    const refs = Array.from({ length: referenceCount }, (_, index) => store.addReference(id, { bytes: png, mime: "image/png", width: 12, height: 18, purpose: `Reference ${index + 1}` }).id);
    const f = foundation(); f.opening_beats.push({ caption: "Mara lifts the lantern toward the path before choosing her next move.", alt: "Over Mara's shoulder, the lantern and the coastal path frame her first dilemma." });
    const opening = store.saveIllustratedVersion(id, { ...save(), foundation: f, reference_asset_ids: refs }).opening!;
    let calls = 0; const requests: Array<FormData | Record<string, unknown>> = [];
    const usage = { input_tokens: 200, input_tokens_details: { text_tokens: 100, image_tokens: 100 }, output_tokens: 100, total_tokens: 300 };
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (url, init) => {
      if (String(url) === "data:,") return new Response(""); calls++;
      if (referenceCount) {
        const body = init?.body as FormData; requests.push(body); expect(String(url)).toMatch(/images\/edits$/); expect(body.get("model")).toBe("gpt-image-2.5-flare"); expect(body.get("quality")).toBe("low"); expect(body.get("size")).toBe("1024x1536"); expect(body.get("output_compression")).toBe("85"); expect(body.get("stream")).toBe("true"); expect(body.get("partial_images")).toBe("1");
        expect([...body.keys()].filter(key => key === "image" || key === "image[]")).toHaveLength(referenceCount);
        const completed = { type: "image_edit.completed", b64_json: jpeg.toString("base64"), output_format: "jpeg", usage };
        return new Response(`data: ${JSON.stringify(completed)}\n\n`, { headers: { "content-type": "text/event-stream", "x-request-id": `req_opening_${calls}` } });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>; requests.push(body); expect(String(url)).toMatch(/images\/generations$/); expect(body).toMatchObject({ model: "gpt-image-2.5-flare", quality: "low", output_format: "jpeg", output_compression: 85 }); expect(body.stream).toBeUndefined(); return Response.json({ created: 1, data: [{ b64_json: jpeg.toString("base64") }], usage }, { headers: { "x-request-id": `req_opening_${calls}` } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client); const previews = vi.fn(); const service = new OpeningService(store, openAIOpeningProvider());
    for (const panel of opening.panels.slice(2)) await service.generate(id, 1, panel.id, input(), undefined, previews);
    expect(calls).toBe(2); expect(previews).not.toHaveBeenCalled();
    requests.forEach((body, index) => { const prompt = String(body instanceof FormData ? body.get("prompt") : body.prompt); expect(prompt).toContain(`Opening scene ${index + 3} of 4`); expect(prompt).toContain(f.character_bible); expect(prompt).toContain("Captions are displayed separately"); expect(prompt).not.toContain("reserve a quiet 20% margin"); });
    const result = store.getDraft(id); expect(result.opening?.attempts.every(attempt => attempt.status === "succeeded" && attempt.estimated_micro_usd === 4300 && attempt.metrics?.prompt_version === "creator-opening-08-1")).toBe(true); expect(result.opening?.summary.reference_input_micro_usd).toBe(1600);
  });
});
