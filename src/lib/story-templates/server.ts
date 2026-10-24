import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { BUNDLED_STORIES, type BundledStorySource } from "./catalog";
import { validateStoryTemplate } from "../story-engine/state";
import { EngineError } from "../story-engine/errors";
import type { StoryTemplate } from "../story-engine/contracts";
import { getSavedTemplate, getSavedTemplateBundle, readSavedTemplateAsset } from "../creator/store";

export type TemplateBundle = { template: StoryTemplate; assets: { id: string; bytes: Buffer; mime: string; purpose: string }[] };

function readBundledAsset(asset: BundledStorySource["assets"][number]) {
  const root = realpathSync(process.cwd());
  // Sources are authored descriptors, never request fields. Still reject escapes/symlinks outside the checkout.
  if (!/^(public|references)\/[a-zA-Z0-9_./-]+$/.test(asset.source) || asset.source.split("/").includes("..")) throw new EngineError("invalid_template_asset", "The story artwork is unavailable.", 500);
  const absolute = realpathSync(path.resolve(root, asset.source));
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new EngineError("invalid_template_asset", "The story artwork is unavailable.", 500);
  return { id: asset.id, bytes: readFileSync(absolute), mime: asset.mime, purpose: asset.purpose };
}

export function getStoryTemplate(id: string, version?: number): StoryTemplate | null {
  const entry = BUNDLED_STORIES.find(entry => entry.template.id === id && (version === undefined || entry.template.version === version));
  if (entry) return validateStoryTemplate(entry.template);
  const saved = getSavedTemplate(id, version);
  return saved?.status === "ready" ? saved : null;
}

export function getTemplateBundle(id: string, version?: number): TemplateBundle | null {
  const entry = BUNDLED_STORIES.find(entry => entry.template.id === id && (version === undefined || entry.template.version === version));
  if (!entry) {
    const saved = getSavedTemplateBundle(id, version);
    return saved?.template.status === "ready" ? saved : null;
  }
  const template = validateStoryTemplate(entry.template);
  const assets = entry.assets.map(readBundledAsset);
  return { template, assets };
}

export function readTemplateAsset(id: string, version: number, assetId: string) {
  const entry = BUNDLED_STORIES.find(entry => entry.template.id === id && entry.template.version === version);
  if (!entry) {
    if (getStoryTemplate(id, version)?.status !== "ready") throw new EngineError("asset_not_found", "This story artwork is not ready to read.", 404);
    return readSavedTemplateAsset(id, version, assetId);
  }
  const asset = entry?.assets.find(asset => asset.id === assetId);
  if (!asset) throw new EngineError("asset_not_found", "This story artwork was not found.", 404);
  return readBundledAsset(asset);
}
