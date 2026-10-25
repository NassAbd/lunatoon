import type { SpeechBubble } from "./contracts";

export function layoutDialogue(dialogues: SpeechBubble[]): SpeechBubble[] {
  const first = dialogues[0];
  if (!first || dialogues.length < 2) return dialogues;
  return dialogues.map((bubble, index) => {
    if (!index) return bubble;
    const firstBand = first.position.split("-")[0];
    const currentBand = bubble.position.split("-")[0];
    // Prevent two 65%-width balloons colliding in the same horizontal band.
    if (firstBand !== currentBand) return bubble;
    return { ...bubble, position: firstBand === "bottom" ? "top-right" : "bottom-right" };
  });
}
