import { describe, expect, it } from "vitest";
import { recordImageDisplay, type ImageObservation, type ReaderObservation } from "../src/lib/reader-timing";

const image = (operation_id: string): ImageObservation => ({ operation_id, request_start_ms: 50, request_ms: 200, first_preview_received_ms: null, first_preview_visible_ms: null, asset_transfer_ms: null, decode_after_load_ms: null, decoded_ms: null, visual_complete_ms: null });
function observation(): ReaderObservation {
  return { node_id: "chapter", started_at: 1000, narrative_response_ms: 40, browser_text_ready_ms: 50, image_request_ms: {}, images: { first: image("first-original"), second: image("second-original") }, browser_total_ms: 300, browser_visual_complete_ms: null };
}
const timing = (phase: "decoded" | "visible", at: number) => ({ phase, at, transfer_ms: 20, decode_ms: 2 });

describe("browser observations belong to one image operation", () => {
  it("does not attribute retry or replay display to the original narrative clock", () => {
    const original = observation(); const unchanged = structuredClone(original);
    expect(recordImageDisplay(original, "first", "retry-operation", "preview", timing("visible", 5000))).toBe(false);
    expect(recordImageDisplay(original, "first", "replay-operation", "final", timing("decoded", 6000))).toBe(false);
    expect(recordImageDisplay(original, "first", "replay-operation", "final", timing("visible", 7000))).toBe(false);
    expect(original).toEqual(unchanged);
  });

  it("records each final once and waits for both independently visible panels", () => {
    const observed = observation();
    recordImageDisplay(observed, "second", "second-original", "final", timing("decoded", 1200));
    recordImageDisplay(observed, "second", "second-original", "final", timing("visible", 1250));
    expect(observed.browser_visual_complete_ms).toBeNull();
    recordImageDisplay(observed, "first", "first-original", "preview", timing("visible", 1150));
    recordImageDisplay(observed, "first", "first-original", "final", timing("decoded", 1300));
    recordImageDisplay(observed, "first", "first-original", "final", timing("visible", 1350));
    const complete = structuredClone(observed);
    recordImageDisplay(observed, "first", "first-original", "final", timing("decoded", 5000));
    recordImageDisplay(observed, "first", "first-original", "final", timing("visible", 6000));
    expect(observed).toEqual(complete);
    expect(observed.images.first.first_preview_visible_ms).toBe(150);
    expect(observed.images.first.decode_after_load_ms).toBe(2);
    expect(observed.browser_visual_complete_ms).toBe(350);
  });
});
