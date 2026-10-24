import { createHash } from "node:crypto";
import type { StoryFoundation } from "../story-engine/contracts";
import type { CreatorStore } from "./store";
function escape(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!); }

// Authored decorative title cards, visibly identified as placeholders. No image API,
// user SVG, external resources, foreignObject or script enters this artwork boundary.
export function placeholderArtwork(foundation: StoryFoundation, beat?: number) {
  const seed = Number.parseInt(createHash("sha256").update(foundation.title).digest("hex").slice(0, 6), 16);
  const hue = seed % 360;
  const heading = beat == null ? "YOUR ORIGINAL WORLD" : `OPENING · ${String(beat + 1).padStart(2, "0")}`;
  const y = beat == null ? 250 : 215 + beat * 20;
  const title = beat == null ? foundation.title : foundation.opening_beats[beat].caption;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><title>${escape(title)}</title><desc>Authored decorative placeholder for a written story scene; not generated illustration.</desc><rect width="1000" height="600" fill="hsl(${hue} 22% 92%)"/><circle cx="750" cy="${y}" r="125" fill="hsl(${hue} 28% 76%)"/><circle cx="795" cy="${y - 30}" r="108" fill="hsl(${hue} 22% 92%)"/><path d="M0 510 Q250 280 500 480 T1000 420 V600 H0Z" fill="hsl(${hue} 20% 70%)"/><path d="M0 560 Q300 390 600 560 T1000 490 V600 H0Z" fill="hsl(${hue} 20% 51%)"/><path d="M150 380V245M150 300L205 260M150 340L105 305" stroke="hsl(${hue} 24% 33%)" stroke-width="5" fill="none"/><text x="70" y="86" fill="#202124" font-family="sans-serif" font-size="20" letter-spacing="4">${heading}</text><text x="70" y="125" fill="#48504b" font-family="sans-serif" font-size="18">Written scene · artwork placeholder</text></svg>`, "utf8");
}

export function registerPlaceholders(store: CreatorStore, draftId: string, foundation: StoryFoundation) {
  const add = (beat?: number) => store.registerArtwork(draftId, { bytes: placeholderArtwork(foundation, beat), mime: "image/svg+xml", width: 1000, height: 600, purpose: beat == null ? "Authored creator cover placeholder" : `Authored creator opening placeholder ${beat + 1}` }).id;
  return { cover_asset_id: add(), opening_asset_ids: foundation.opening_beats.map((_, index) => add(index)) };
}
