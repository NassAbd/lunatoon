export type ImageDisplayTiming = {
  phase: "decoded" | "visible";
  at: number;
  transfer_ms: number | null;
  decode_ms: number;
};
export type ImageObservation = {
  operation_id: string;
  request_start_ms: number;
  request_ms: number | null;
  first_preview_received_ms: number | null;
  first_preview_visible_ms: number | null;
  asset_transfer_ms: number | null;
  decode_after_load_ms: number | null;
  decoded_ms: number | null;
  visual_complete_ms: number | null;
};
export type ReaderObservation = {
  node_id: string;
  started_at: number;
  narrative_response_ms: number;
  browser_text_ready_ms: number;
  image_request_ms: Record<string, number>;
  images: Record<string, ImageObservation>;
  browser_total_ms: number | null;
  browser_visual_complete_ms: number | null;
};

// A retry/replay keeps the panel UUID but has a different paid operation. Never
// attribute its display events to an earlier continuation's narrative clock.
export function recordImageDisplay(observed: ReaderObservation, panelId: string, operationId: string, kind: "preview" | "final", timing: ImageDisplayTiming): boolean {
  const image = observed.images[panelId];
  if (!image || image.operation_id !== operationId) return false;
  const elapsed = timing.at - observed.started_at;
  if (kind === "preview" && timing.phase === "visible") image.first_preview_visible_ms ??= elapsed;
  if (kind === "final" && timing.phase === "decoded" && image.decoded_ms === null) {
    image.asset_transfer_ms = timing.transfer_ms; image.decode_after_load_ms = timing.decode_ms; image.decoded_ms = elapsed;
  }
  if (kind === "final" && timing.phase === "visible") {
    image.visual_complete_ms ??= elapsed;
    const all = Object.values(observed.images);
    if (all.length === 2 && all.every(item => item.visual_complete_ms !== null)) observed.browser_visual_complete_ms = Math.max(...all.map(item => item.visual_complete_ms!));
  }
  return true;
}
