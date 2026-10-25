import { describe, expect, it } from "vitest";
import { chapterIllustrationsReady, storyIllustrationsReady, recordFinalVisibility } from "../src/lib/reader-completion";
import { chapterFixture } from "./engine-fixtures";

const chapter = { id: "chapter_1", chapter: chapterFixture() };
const panels = () => [1, 2].map(sequence => ({ id: `panel_${sequence}`, node_id: chapter.id, sequence, status: "complete" as const, image_path: `images/panel_${sequence}.jpg`, operation_id: `operation_${sequence}` }));
const visible = () => new Set(["panel_1:operation_1", "panel_2:operation_2"]);

describe("reader progression requires displayed final illustrations", () => {
  it("waits for both final visibility receipts, never a preview or decode alone", () => {
    let receipts: ReadonlySet<string> = new Set();
    expect(chapterIllustrationsReady(chapter, panels(), receipts)).toBe(false);
    expect(recordFinalVisibility(receipts, "panel_1", "operation_1", "preview", "visible")).toBe(receipts);
    expect(recordFinalVisibility(receipts, "panel_1", "operation_1", "final", "decoded")).toBe(receipts);
    receipts = recordFinalVisibility(receipts, "panel_2", "operation_2", "final", "visible");
    expect(chapterIllustrationsReady(chapter, panels(), receipts)).toBe(false);
    receipts = recordFinalVisibility(receipts, "panel_1", "operation_1", "final", "visible");
    expect(chapterIllustrationsReady(chapter, panels(), receipts)).toBe(true);
    expect(recordFinalVisibility(receipts, "panel_1", "operation_1", "final", "visible")).toBe(receipts);
  });

  it.each(["pending", "running", "failed"] as const)("a %s image blocks progression even with an earlier visibility receipt", status => {
    expect(chapterIllustrationsReady(chapter, [{ ...panels()[0], status }, panels()[1]], visible())).toBe(false);
  });

  it("requires exactly two saved chapter images and their own paths/operation IDs", () => {
    expect(chapterIllustrationsReady(undefined, panels(), visible())).toBe(false);
    expect(chapterIllustrationsReady({ ...chapter, chapter: null }, panels(), visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, panels().slice(0, 1), visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, [...panels(), { ...panels()[0], id: "extra" }], visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, [{ ...panels()[0], image_path: null }, panels()[1]], visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, [{ ...panels()[0], sequence: 2 }, panels()[1]], visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, [{ ...panels()[0], operation_id: "new_replay" }, panels()[1]], visible())).toBe(false);
    expect(chapterIllustrationsReady(chapter, [{ ...panels()[0], node_id: "another_chapter" }, panels()[1]], visible())).toBe(false);
    // Reload has no current-document receipts; saved database completion alone is insufficient.
    expect(chapterIllustrationsReady(chapter, panels(), new Set())).toBe(false);
    const replayed = [{ ...panels()[0], operation_id: "new_replay" }, panels()[1]];
    let receipts = recordFinalVisibility(visible(), "panel_1", "new_replay", "final", "visible");
    receipts = recordFinalVisibility(receipts, "panel_1", "operation_1", "final", "visible");
    expect(chapterIllustrationsReady(chapter, replayed, receipts)).toBe(true);
  });

  it("requires all chapters for the ending, including earlier unfinished legacy artwork", () => {
    const second = { id: "chapter_2", chapter: chapterFixture() };
    const later = panels().map(panel => ({ ...panel, id: `${panel.id}_later`, node_id: second.id }));
    const receipts = new Set([...visible(), "panel_1_later:operation_1", "panel_2_later:operation_2"]);
    expect(storyIllustrationsReady([chapter, second], [...panels(), ...later], receipts, 2)).toBe(true);
    expect(storyIllustrationsReady([chapter, second], [{ ...panels()[0], status: "failed" }, panels()[1], ...later], receipts, 2)).toBe(false);
    expect(storyIllustrationsReady([chapter], panels(), visible(), 2)).toBe(false);
  });
});
