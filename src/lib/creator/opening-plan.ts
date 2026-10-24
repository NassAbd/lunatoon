import { createHash } from "node:crypto";
import type { IllustrationScene } from "../art-direction";
import { buildIllustrationPrompt } from "../art-direction";
import type { StoryFoundation } from "../story-engine/contracts";
import type { CreatorAsset } from "./contracts";
import type { OpeningPanel } from "./opening-contracts";

export const OPENING_PROMPT_VERSION = "creator-opening-08-1";
export const openingShots = [
  "Wide establishing composition. Make the setting and the character's situation legible; one immediate story beat.",
  "Medium character-focused composition. Show the protagonist's recognizable identity and current action, with a clear silhouette.",
  "Close detail or expressive close-up. Show the story's important object or immediate emotional reaction without inventing a new event.",
  "Wide or over-the-shoulder composition leading into the first choice. Reveal the existing dilemma without resolving the reader's decision.",
];
export function openingMemory(foundation: StoryFoundation) {
  return { identity: foundation.character_bible, style: foundation.art_direction, protagonist: foundation.protagonist_id, current: JSON.stringify({ world: foundation.world, object_anchor: foundation.object_anchor, setting_anchor: foundation.setting_anchor, continuity_rules: foundation.continuity_rules, initial_state: foundation.initial_state }) };
}
export function openingScene(panel: Pick<OpeningPanel, "id" | "sequence" | "scene_description" | "shot_direction" | "layout_aspect">, foundation: StoryFoundation): IllustrationScene {
  return { panel_id: panel.id, sequence_index: panel.sequence, layout_aspect: panel.layout_aspect, visual_description: `Opening scene ${panel.sequence} of ${foundation.opening_beats.length}: ${panel.scene_description}`, image_prompt: `Illustrate this exact authored opening beat, before any reader choice. The opening sequence in order is: ${foundation.opening_beats.map((beat, index) => `${index + 1}. ${beat.caption} (${beat.alt})`).join(" ")} This image depicts only scene ${panel.sequence}; preserve the chronology and do not combine multiple scenes.`, shot_direction: panel.shot_direction };
}
export function openingFingerprint(panel: OpeningPanel, foundation: StoryFoundation, references: CreatorAsset[], model: string, quality: string) {
  // Fingerprint the effective visual prompt, frozen ordered input bytes and all
  // output settings. Display title/genre/choices are intentionally not prompts.
  // Bump this version if the shared story-reference instruction in ai.ts changes.
  return createHash("sha256").update(JSON.stringify({ version: OPENING_PROMPT_VERSION, prompt: buildIllustrationPrompt(openingScene(panel, foundation), openingMemory(foundation)), references: references.map(asset => ({ sha256: asset.sha256, mime: asset.mime, purpose: asset.purpose })), model, quality, size: "1024x1536", format: "jpeg", compression: 85, n: 1, reference_direction: references.length ? "story-visual-08" : null })).digest("hex");
}
