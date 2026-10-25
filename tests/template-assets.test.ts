import { afterEach, describe, expect, it, vi } from "vitest";
import { getStoryTemplate, getTemplateBundle, readTemplateAsset } from "../src/lib/story-templates/server";
import * as creator from "../src/lib/creator/store";
import { LAST_LIGHTKEEPER_TEMPLATE } from "../src/lib/story-templates/catalog";

afterEach(() => vi.restoreAllMocks());

describe("owned template assets", () => {
  it("resolves a validated version and loads only its authored asset descriptors", () => {
    const template = getStoryTemplate("last-lightkeeper");
    expect(template?.title).toBe("The Last Lightkeeper");
    const bundle = getTemplateBundle("last-lightkeeper", template!.version);
    expect(bundle?.template).toEqual(template);
    expect(bundle!.assets.every(asset => asset.bytes.length > 0)).toBe(true);
    const reference = readTemplateAsset(template!.id, template!.version, template!.reference_asset_ids[0]);
    expect(reference.mime).toBe("image/png");
    expect(reference.bytes.subarray(1, 4).toString()).toBe("PNG");
  });
  it("rejects unknown versions, path traversal, and assets belonging to another story", () => {
    expect(getStoryTemplate("../../.env.local")).toBeNull();
    expect(getTemplateBundle("last-lightkeeper", 100)).toBeNull();
    expect(() => readTemplateAsset("last-lightkeeper", 1, "../../.env.local")).toThrow();
    expect(() => readTemplateAsset("last-lightkeeper", 1, "kael_reference")).toThrow();
    expect(() => readTemplateAsset("absent", 1, "reference")).toThrow();
  });
  it("does not expose an unpublished Creator opening through reader routes", () => {
    const pending = { ...LAST_LIGHTKEEPER_TEMPLATE, id: "creator_pending", status: "draft" as const };
    vi.spyOn(creator, "getSavedTemplate").mockReturnValue(pending);
    vi.spyOn(creator, "getSavedTemplateBundle").mockReturnValue({ template: pending, assets: [] });
    const asset = vi.spyOn(creator, "readSavedTemplateAsset");
    expect(getStoryTemplate(pending.id, pending.version)).toBeNull();
    expect(getTemplateBundle(pending.id, pending.version)).toBeNull();
    expect(() => readTemplateAsset(pending.id, pending.version, pending.cover_asset_id)).toThrow(/not ready/);
    expect(asset).not.toHaveBeenCalled();
  });
});
