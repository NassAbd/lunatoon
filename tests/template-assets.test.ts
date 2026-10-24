import { describe, expect, it } from "vitest";
import { getStoryTemplate, getTemplateBundle, readTemplateAsset } from "../src/lib/story-templates/server";

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
});
