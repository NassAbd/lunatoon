import { describe, expect, it } from "vitest";
import { INITIAL_CONTEXT } from "../src/lib/contracts";
import { NEON_PROTOCOL_TEMPLATE } from "../src/lib/story-templates/catalog";
import type { Bible, Snapshot } from "../src/lib/story-engine/contracts";
import { waitingArtworkForRun } from "../src/lib/reader-waiting-artwork";

const run = { id: "11111111-1111-4111-8111-111111111111" } as Snapshot["run"];
const asset = (id: string, mime = "image/jpeg") => ({ id, mime, path: `references/${id}.jpg`, sha256: "unused", purpose: "Untrusted description: establishing environment portrait" });
const bible: Bible = { id: "local-bible", title: "Test story", opening: "An original scene", character_bible: "identity", art_direction: "style", device_anchor: "object", setting_anchor: "place", assets: [], template: { ...NEON_PROTOCOL_TEMPLATE, id: "creator_test", reference_asset_ids: [] } };

describe("saved waiting artwork selection", () => {
  it("uses only explicitly designated environment references owned by the pinned run", () => {
    const template = { ...bible.template!, reference_asset_ids: ["portrait", "place", "style", "other_place"], visual_references: [
      { asset_id: "portrait", role: "protagonist" as const }, { asset_id: "place", role: "environment" as const },
      { asset_id: "style", role: "style" as const }, { asset_id: "other_place", role: "environment" as const },
      { asset_id: "foreign", role: "environment" as const },
    ] };
    const result = waitingArtworkForRun({ run, bible: { ...bible, template, assets: [asset("portrait"), asset("place"), asset("style"), asset("other_place"), asset("unselected")] } });
    expect(result.map(item => item.asset_id)).toEqual(["place", "other_place"]);
    expect(result.map(item => item.src)).toEqual([`/api/runs/${run.id}/assets/place`, `/api/runs/${run.id}/assets/other_place`]);
    expect(JSON.stringify(result)).not.toContain("references/");
  });
  it("does not infer environment suitability from a caption, first upload, or another story's asset ID", () => {
    expect(waitingArtworkForRun({ run, bible: { ...bible, template: { ...bible.template!, reference_asset_ids: ["place", "city"] }, assets: [asset("place"), asset("city")] } })).toEqual([]);
    expect(waitingArtworkForRun({ run, bible: { ...bible, template: { ...bible.template!, reference_asset_ids: ["missing"], visual_references: [{ asset_id: "missing", role: "environment" }] }, assets: [asset("other_story_asset")] } })).toEqual([]);
  });
  it("keeps the placeholder for missing, nonimage, or unassigned assets", () => {
    const template = { ...bible.template!, reference_asset_ids: ["notes"], visual_references: [{ asset_id: "notes", role: "environment" as const }] };
    expect(waitingArtworkForRun({ run, bible: { ...bible, template, assets: [asset("notes", "text/markdown")] } })).toEqual([]);
    expect(waitingArtworkForRun({ run, bible })).toEqual([]);
  });
  it("uses only allowlisted saved establishing assets for a bundled story", () => {
    const result = waitingArtworkForRun({ run, bible: { ...bible, template: NEON_PROTOCOL_TEMPLATE, assets: [asset("city", "image/svg+xml"), asset("opening"), asset("watchers", "image/svg+xml"), asset("device")] } });
    expect(result.map(item => item.asset_id)).toEqual(["city", "watchers"]);
  });
  it("uses existing authored Neon scenery only for its exact canonical legacy opening", () => {
    const legacy = { ...bible, template: undefined, title: "Neon Protocol", opening: INITIAL_CONTEXT };
    expect(waitingArtworkForRun({ run, bible: legacy }).map(item => item.src)).toEqual(["/neon-city.svg", "/neon-watchers.svg"]);
    expect(waitingArtworkForRun({ run, bible: { ...legacy, opening: "A different private opening" } })).toEqual([]);
  });
});
