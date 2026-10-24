import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, symlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { DatabaseSync } from "node:sqlite";
import * as ai from "../src/lib/server/ai";
import { CreatorStore, getSavedTemplate, getSavedTemplateBundle, listSavedTemplates, readSavedTemplateAsset } from "../src/lib/creator/store";
import { CreatorService } from "../src/lib/creator/service";
import { openAICreatorProvider, type CreatorProvider } from "../src/lib/creator/provider";
import { CreatorSnapshotSchema, GenerateFoundationSchema } from "../src/lib/creator/contracts";
import { StoryFoundationSchema, type StoryFoundation } from "../src/lib/story-engine/contracts";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../src/lib/story-templates/catalog";
import { measuredMetrics, operation } from "./engine-fixtures";

const now = Date.parse("2026-10-24T12:00:00Z");
const directories: string[] = [], stores: CreatorStore[] = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWe8AAAAASUVORK5CYII=", "base64");
function directory() { const dir = mkdtempSync(path.join(os.tmpdir(), "lunatoon-creator-")); directories.push(dir); return dir; }
function setup(options: ConstructorParameters<typeof CreatorStore>[1] = {}) { const store = new CreatorStore(directory(), { now: () => now, ...options }); stores.push(store); return store; }
function foundation(): StoryFoundation {
  const source = LAST_LIGHTKEEPER_TEMPLATE;
  return StoryFoundationSchema.parse({ ...Object.fromEntries(Object.keys(StoryFoundationSchema.shape).map(key => [key, source[key as keyof typeof source]])), opening_beats: source.opening_beats.map(({ caption, alt }) => ({ caption, alt })) });
}
function request() { return GenerateFoundationSchema.parse({ operation_id: operation(), prompt: "An original keeper follows a fading star home." }); }
function provider(): CreatorProvider { return { prepare() {}, async foundation() { return { foundation: foundation(), metrics: measuredMetrics }; } }; }
function artwork(store: CreatorStore, id: string) { return store.registerArtwork(id, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: "image/svg+xml", width: 800, height: 600, purpose: "Original local placeholder" }); }
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe("local Creator ledger and immutable templates", () => {
  it("keeps read-only library lookups empty without creating a database", () => {
    const dir = directory(); expect(getSavedTemplate("missing", undefined, dir)).toBeNull();
    expect(getSavedTemplateBundle("missing", undefined, dir)).toBeNull(); expect(listSavedTemplates({ directory: dir })).toEqual([]);
    expect(() => readSavedTemplateAsset("missing", 1, "missing", dir)).toThrow(); expect(readdirSync(dir)).toEqual([]);
    expect(() => GenerateFoundationSchema.parse({ operation_id: operation(), prompt: "short" })).toThrow();
  });

  it("claims one paid call under concurrent duplicates and rejects operation payload changes", async () => {
    const store = setup(); const created = store.createDraft({ operation_id: operation() }); const id = created.draft.id;
    expect(statSync(path.join(store.directory, "creator.sqlite")).mode & 0o777).toBe(0o600);
    expect(store.createDraft({ operation_id: created.draft.operation_id })).toEqual(created);
    let resolve!: () => void; const pending = new Promise<void>(done => { resolve = done; }); let calls = 0;
    const mock = provider(); mock.foundation = async () => { calls++; await pending; return { foundation: foundation(), metrics: measuredMetrics }; };
    const service = new CreatorService(store, mock); const input = request(); const first = service.generate(id, input);
    const duplicate = await service.generate(id, input); expect(duplicate.attempts[0].status).toBe("running"); expect(calls).toBe(1);
    await expect(service.generate(id, { ...input, prompt: "A different valid prompt changes this operation." })).rejects.toMatchObject({ code: "operation_conflict" });
    resolve(); const saved = await first; expect(saved.draft.foundation?.title).toBe(foundation().title); expect(saved.summary.calls).toBe(1);
    mock.prepare = () => { throw new ai.GenerationError("missing_api_key", "Missing local credentials", 503); };
    expect((await service.generate(id, input)).attempts).toEqual(saved.attempts); expect(calls).toBe(1);
    const restored = new CreatorStore(store.directory); stores.push(restored); expect(restored.getDraft(id)).toEqual(saved);
    expect(JSON.stringify(CreatorSnapshotSchema.parse(saved))).not.toMatch(/claim_token|fingerprint|creator\.sqlite|\/Users\//);
  });

  it("retains usage on invalid foundation and last success, requiring explicit paid retries", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const mock = provider(); const service = new CreatorService(store, mock);
    const first = await service.generate(id, request());
    mock.foundation = async () => { const invalid = foundation(); invalid.initial_state.objects[0].holder = null; return { foundation: invalid, metrics: measuredMetrics }; };
    const failure = await service.generate(id, request()); expect(failure.draft.foundation).toEqual(first.draft.foundation);
    expect(failure.attempts[1]).toMatchObject({ status: "failed", metrics: measuredMetrics, error: { code: "invalid_foundation" } });
    expect(failure.attempts[1].estimated_micro_usd).toBeGreaterThan(0); expect(failure.summary.unknown_cost_attempts).toBe(0);
    await expect(service.generate(id, request())).rejects.toMatchObject({ code: "explicit_retry_required" });
    mock.foundation = provider().foundation;
    const fixed = await service.generate(id, { ...request(), retry_of: failure.attempts[1].id }); expect(fixed.attempts[2].status).toBe("succeeded");
    await expect(service.generate(id, request())).rejects.toMatchObject({ code: "creator_call_limit" });
  });

  it("preserves uncertain attempts after restart and holds their budget without automatic calls", async () => {
    let clock = now; const store = setup({ now: () => clock, leaseMs: 1000 }); const id = store.createDraft({ operation_id: operation() }).draft.id;
    const input = request(); store.claimGeneration(id, input); clock += 1001;
    const reopened = new CreatorStore(store.directory, { now: () => clock }); stores.push(reopened);
    const saved = reopened.getDraft(id); expect(saved.attempts[0].status).toBe("interrupted"); expect(saved.summary.unknown_cost_attempts).toBe(1);
    expect(saved.summary.held_micro_usd).toBe(9600); let calls = 0; const mock = provider(); mock.foundation = async () => { calls++; return { foundation: foundation(), metrics: measuredMetrics }; };
    const service = new CreatorService(reopened, mock); expect((await service.generate(id, input)).attempts[0].status).toBe("interrupted"); expect(calls).toBe(0);
    await expect(service.generate(id, { ...request(), retry_of: saved.attempts[0].id })).rejects.toMatchObject({ code: "unknown_cost_confirmation" });
    const fixed = await service.generate(id, { ...request(), retry_of: saved.attempts[0].id, acknowledge_unknown: true }); expect(calls).toBe(1); expect(fixed.summary.held_micro_usd).toBe(9600);
  });

  it("blocks before calls on reserved budget and keeps unknown pricing honest", async () => {
    const store = setup({ limits: { max_calls: 3, budget_usd: .005 } }); const id = store.createDraft({ operation_id: operation() }).draft.id;
    await expect(new CreatorService(store, provider()).generate(id, request())).rejects.toMatchObject({ code: "creator_budget_limit" }); expect(store.getDraft(id).attempts).toHaveLength(0);
    const unknown = setup({ model: "unknown-model" }); const other = unknown.createDraft({ operation_id: operation() }).draft.id;
    const result = await new CreatorService(unknown, provider()).generate(other, request()); expect(result.attempts[0].estimated_micro_usd).toBeNull(); expect(result.summary.unpriced_attempts).toBe(1);
  });

  it("does not mislabel a storage commit failure as invalid model output or retry the commit", async () => {
    let clock = now; const store = setup({ now: () => clock, leaseMs: 1000 }); const id = store.createDraft({ operation_id: operation() }).draft.id;
    const failure = new Error("synthetic storage failure"); const commit = vi.spyOn(store, "finishGeneration").mockImplementationOnce(() => { throw failure; });
    let calls = 0; const mock = provider(); mock.foundation = async () => { calls++; return { foundation: foundation(), metrics: measuredMetrics }; };
    await expect(new CreatorService(store, mock).generate(id, request())).rejects.toBe(failure);
    expect(commit).toHaveBeenCalledTimes(1); expect(calls).toBe(1); expect(store.getDraft(id).attempts[0].status).toBe("running");
    clock += 1001; expect(store.getDraft(id).attempts[0].status).toBe("interrupted"); expect(store.getDraft(id).summary.unknown_cost_attempts).toBe(1);
  });

  it("scopes references, caps three, retains removed version assets, and pins template versions", async () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id;
    const other = store.createDraft({ operation_id: operation() }).draft.id;
    const ref = { bytes: png, mime: "image/png" as const, width: 1, height: 1, purpose: "Character reference" };
    const refs = [store.addReference(id, ref), store.addReference(id, { ...ref, purpose: "World reference" }), store.addReference(id, { ...ref, purpose: "Style reference" })];
    expect(store.addReference(id, ref)).toEqual(refs[0]); expect(() => store.addReference(id, { ...ref, purpose: "Fourth reference" })).toThrow(/three/i); expect(() => store.readReference(other, refs[0].id)).toThrow();
    const cover = artwork(store, id); const f = foundation();
    const save = { operation_id: operation(), foundation: f, reference_asset_ids: refs.map(r => r.id), cover_asset_id: cover.id, opening_asset_ids: f.opening_beats.map(() => cover.id) };
    const first = store.saveTemplate(id, save); expect(first.latest_template?.version).toBe(1); expect(first.draft.status).toBe("ready");
    expect(first.latest_template?.opening_beats.every(beat => /placeholder/i.test(beat.alt))).toBe(true);
    expect(first.latest_template?.opening_beats.map(beat => beat.caption)).toEqual(f.opening_beats.map(beat => beat.caption));
    expect(first.draft.foundation?.opening_beats).toEqual(f.opening_beats);
    expect(store.saveTemplate(id, save).latest_template).toEqual(first.latest_template);
    expect(() => store.saveTemplate(id, { ...save, foundation: { ...f, title: "Changed" } })).toThrow(/operation/i);
    store.removeReference(id, refs[0].id); expect(store.getDraft(id).draft.reference_asset_ids).toHaveLength(2);
    const second = store.saveTemplate(id, { ...save, operation_id: operation(), foundation: { ...f, title: "Revised story" }, reference_asset_ids: refs.slice(1).map(r => r.id) });
    const templateId = first.latest_template!.id; expect(second.latest_template?.version).toBe(2);
    expect(getSavedTemplate(templateId, 1, store.directory)?.title).toBe(f.title); expect(getSavedTemplate(templateId, undefined, store.directory)?.title).toBe("Revised story");
    expect(readSavedTemplateAsset(templateId, 1, refs[0].id, store.directory).bytes).toEqual(png);
    expect(() => readSavedTemplateAsset(templateId, 2, refs[0].id, store.directory)).toThrow();
    expect(getSavedTemplateBundle(templateId, 1, store.directory)?.assets).toHaveLength(4); expect(listSavedTemplates({ directory: store.directory })).toHaveLength(1);
    const noRefs = store.saveTemplate(id, { ...save, operation_id: operation(), reference_asset_ids: [] }); expect(noRefs.latest_template?.reference_asset_ids).toEqual([]);
    const ownOther = artwork(store, other); expect(() => store.saveTemplate(id, { ...save, operation_id: operation(), cover_asset_id: ownOther.id })).toThrow();
    expect(() => store.addReference(id, { ...ref, bytes: Buffer.from("not a PNG") })).toThrow();
    expect(() => store.addReference(id, { ...ref, bytes: Buffer.alloc(11 * 1024 * 1024) })).toThrow();
  });

  it("rejects database versions and asset symlink escapes without exposing paths", () => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; const asset = store.addReference(id, { bytes: png, mime: "image/png", width: 1, height: 1, purpose: "Reference" });
    const file = path.join(store.directory, "creator", "assets", `${asset.sha256}.png`); expect(existsSync(file)).toBe(true);
    rmSync(file); symlinkSync(path.join(directory(), "outside.png"), file);
    expect(() => store.readReference(id, asset.id)).toThrow();
    const different = directory(); const db = new DatabaseSync(path.join(different, "creator.sqlite")); db.exec("PRAGMA user_version=99;"); db.close();
    expect(() => getSavedTemplate("missing", undefined, different)).toThrow(/version/i); expect(() => new CreatorStore(different)).toThrow(/version/i);
  });

  it("fences concurrent process claims and reconciles late usage without overwriting a newer foundation", async () => {
    let clock = now; const store = setup({ now: () => clock, leaseMs: 1000 }); const id = store.createDraft({ operation_id: operation() }).draft.id;
    const other = new CreatorStore(store.directory, { now: () => clock }); stores.push(other); const input = request(); const claim = store.claimGeneration(id, input);
    expect(other.claimGeneration(id, input).claim_token).toBeNull(); expect(() => other.claimGeneration(id, request())).toThrow(/progress/);
    clock += 1001; const saved = other.getDraft(id);
    const changed = foundation(); changed.title = "Later foundation"; const mock = provider(); mock.foundation = async () => ({ foundation: changed, metrics: measuredMetrics });
    await new CreatorService(other, mock).generate(id, { ...request(), retry_of: saved.attempts[0].id, acknowledge_unknown: true });
    const after = store.finishGeneration(id, claim.attempt.id, claim.claim_token!, { foundation: foundation(), metrics: measuredMetrics });
    expect(after.draft.foundation?.title).toBe("Later foundation"); expect(after.attempts[0].status).toBe("interrupted"); expect(after.attempts[0].estimated_micro_usd).toBeGreaterThan(0); expect(after.summary.unknown_cost_attempts).toBe(0);
  });
});

describe("Creator Structured Outputs SDK boundary", () => {
  it.each(["valid", "json", "schema", "incomplete", "refusal"])("accounts returned usage before %s parsing or validation", async mode => {
    const store = setup(); const id = store.createDraft({ operation_id: operation() }).draft.id; let calls = 0;
    const client = new OpenAI({ apiKey: "test-only", maxRetries: 0, fetch: async (_url, init) => {
      calls++; const sent = JSON.parse(String(init?.body)) as { text: unknown; max_output_tokens: number; store: boolean };
      expect(sent.text).toMatchObject({ format: { type: "json_schema", name: "lunatoon_story_foundation", strict: true, schema: { additionalProperties: false } } });
      expect(sent.max_output_tokens).toBe(5000); expect(sent.store).toBe(false);
      return Response.json({ id: "resp_creator", model: "gpt-4.1-mini", status: mode === "incomplete" ? "incomplete" : "completed", output: [{ type: "message", id: "msg_creator", role: "assistant", status: "completed", content: mode === "refusal" ? [{ type: "refusal", refusal: "private provider text" }] : [{ type: "output_text", text: mode === "json" ? "private invalid JSON" : JSON.stringify(mode === "schema" ? { private_unknown_key: "private value" } : foundation()), annotations: [] }] }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, total_tokens: 300 } }, { headers: { "x-request-id": "req_creator" } });
    } });
    vi.spyOn(ai, "getClient").mockReturnValue(client);
    const result = await new CreatorService(store, openAICreatorProvider()).generate(id, request());
    expect(calls).toBe(1); expect(result.attempts[0].metrics?.request_id).toBe("req_creator"); expect(result.attempts[0].estimated_micro_usd).toBe(360);
    expect(result.attempts[0].status).toBe(mode === "valid" ? "succeeded" : "failed"); expect(JSON.stringify(result)).not.toMatch(/private invalid|private value|private_unknown_key|private provider/);
  });
});
