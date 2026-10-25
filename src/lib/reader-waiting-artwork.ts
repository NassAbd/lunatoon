import { INITIAL_CONTEXT } from "./contracts";
import type { Bible } from "./story-engine/contracts";

export type WaitingArtwork = { asset_id: string; src: string };
const bundledScenery: Readonly<Record<string, readonly string[]>> = {
  "neon-protocol": ["city", "watchers"],
  "last-lightkeeper": ["coast", "causeway"],
  "glass-orchard": ["orchard", "hatch"],
};

// Deliberately conservative: captions, filenames, first uploads and character
// portraits do not establish that an image is suitable environment artwork.
// Every private URL is scoped to this run's immutable saved bible.
export function waitingArtworkForRun({ run, bible }: { run: { id: string }; bible: Bible }): WaitingArtwork[] {
  const template = bible.template;
  if (!template) return bible.title === "Neon Protocol" && bible.opening === INITIAL_CONTEXT
    ? [{ asset_id: "city", src: "/neon-city.svg" }, { asset_id: "watchers", src: "/neon-watchers.svg" }] : [];
  const candidates = [
    ...(bundledScenery[template.id] ?? []),
    ...(template.visual_references ?? []).filter(reference => reference.role === "environment" && template.reference_asset_ids.includes(reference.asset_id)).map(reference => reference.asset_id),
  ];
  return [...new Set(candidates)].filter(id => bible.assets.some(asset => asset.id === id && ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(asset.mime)))
    .slice(0, 4).map(id => ({ asset_id: id, src: `/api/runs/${run.id}/assets/${encodeURIComponent(id)}` }));
}
