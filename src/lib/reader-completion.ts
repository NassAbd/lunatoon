import type { Panel, StoryNode } from "./story-engine/contracts";
import type { ImageDisplayTiming } from "./reader-timing";

type Chapter = Pick<StoryNode, "id" | "chapter">;
type Illustration = Pick<Panel, "id" | "node_id" | "sequence" | "status" | "image_path" | "operation_id">;
export type FinalVisibility = ReadonlySet<string>;
const key = (panelId: string, operationId: string) => `${panelId}:${operationId}`;

// Presentation-only receipts are deliberately not persisted. A reload must
// decode its saved images again; previews and atmosphere never unlock a choice.
export function recordFinalVisibility(current: FinalVisibility, panelId: string, operationId: string, kind: "preview" | "final", phase: ImageDisplayTiming["phase"]): FinalVisibility {
  const identity = key(panelId, operationId);
  if (kind !== "final" || phase !== "visible" || current.has(identity)) return current;
  // Retain separate operation keys so a late event from an old replay cannot
  // overwrite a newer receipt or unlock a different image operation.
  return new Set(current).add(identity);
}

export function chapterIllustrationsReady(chapter: Chapter | undefined, panels: readonly Illustration[], visible: FinalVisibility): boolean {
  if (!chapter?.chapter) return false;
  const own = panels.filter(panel => panel.node_id === chapter.id);
  return own.length === 2 && new Set(own.map(panel => panel.sequence)).size === 2
    && own.every(panel => [1, 2].includes(panel.sequence) && panel.status === "complete" && Boolean(panel.image_path) && visible.has(key(panel.id, panel.operation_id)));
}

export function storyIllustrationsReady(chapters: readonly Chapter[], panels: readonly Illustration[], visible: FinalVisibility, requiredSteps: number): boolean {
  return chapters.length === requiredSteps && panels.length === requiredSteps * 2 && chapters.every(chapter => chapterIllustrationsReady(chapter, panels, visible));
}
