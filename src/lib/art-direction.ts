import type { ScriptPanel } from "./contracts";
import { layoutDialogue } from "./dialogue-layout";

export const ART_VERSION = "neon-noir-02";
export const CHARACTER_IDENTITY = "Detective Kael: 32-year-old man, warm brown skin, lean adult proportions, angular jaw, straight nose, short swept-back black hair, clean-shaven. Thin scar through his anatomical left eyebrow and a small amber anatomical left cybernetic eye (viewer-right in a frontal view); his other eye is dark brown. Mustard-yellow high-collared trench coat with angular lapels over a charcoal shirt, dark trousers and boots. Keep the same face, skin tone, hair, eye side, coat, and proportions in every panel.";
export const ART_DIRECTION = "Original Neon Protocol cyberpunk noir comic. Simplified angular silhouettes, clean dark ink contours, broad flat color shapes and two-tone cel shading; restrained detail, not a painted illustration. Palette: midnight ink #0a1721, blue slate #173744, warm brown skin #a67450, mustard coat #d2a751, cyan device #75fff3, amber eye #e5c665. Yellow belongs to Kael's coat; cyan belongs to device light. Hard-edged shadows, sparse geometric city detail, fine rain strokes, only a small glow around the device. No photorealism, 3D render, skin pores, glossy surfaces, painterly gradients or elaborate microtexture. No letters, signage text, captions, speech balloons, logos or watermarks.";

export function isReferenceModelSupported(model: string): boolean {
  return ["gpt-image-2.5-flare", "gpt-image-2.5-flare-2026-09-08", "gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst-2026-09-08"].includes(model);
}

export function shotDirection(sequence: number, protagonist?: string): string {
  if (protagonist) return sequence === 1
    ? "An establishing wide shot: show the main character's clear silhouette, this story's location and the immediate consequence of the chosen action. One readable story beat."
    : "An expressive close-up or tight action shot: preserve the main character's identity; reveal the reaction or consequence caused by panel 1. Change camera distance, not character design. One new story beat.";
  return sequence === 1
    ? "An establishing wide shot: show Kael's clear full or three-quarter silhouette, the abandoned station geography and the immediate consequence of his chosen action. One readable story beat."
    : "An expressive close-up or tight action shot: Kael's face, amber eye and yellow collar are recognizable; reveal a reaction or clue caused by panel 1. Change camera distance, not character design. One new story beat.";
}

export function buildIllustrationPrompt(panel: ScriptPanel, memory?: { identity: string; style: string; current: string; protagonist?: string }): string {
  const bubblePositions = [...new Set(layoutDialogue(panel.dialogues).map((bubble) => bubble.position))].join(", ");
  return `Scene beat: ${panel.visual_description}\nAction and setting: ${panel.image_prompt}\nComposition: ${shotDirection(panel.sequence_index, memory?.protagonist)}\nKeep faces, hands, ${memory?.protagonist ? "important objects" : "the device"} and essential clues away from ${bubblePositions}; reserve a quiet 20% margin in those regions for dialogue added later by the app. No baked-in text.\nThe following canonical visual constraints override conflicting style or identity in the scene:\n${memory?.identity ?? CHARACTER_IDENTITY}\n${memory?.style ?? ART_DIRECTION}${memory ? `\nCurrent saved continuity (injuries, clothing condition and object states override their original condition in the reference): ${memory.current}` : ""}`;
}
