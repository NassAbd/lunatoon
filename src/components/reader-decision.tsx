"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { StoryNode } from "@/lib/story-engine/contracts";
import { Icon } from "./icon";

export type ReaderChoice = { id: string; label: string };
export type ReaderSubmission = { step: number; choice_id: string; instruction: string };
const anchoringRestores = new WeakMap<HTMLElement, { frame: number; value: string }>();
export function ReaderDecision({ step, question, options, node, enabled, busy, onSubmit }: {
  step: number; question: string; options: ReaderChoice[]; node?: StoryNode;
  enabled: boolean; busy: boolean; onSubmit: (input: ReaderSubmission) => void;
}) {
  const [choice, setChoice] = useState(""); const [instruction, setInstruction] = useState("");
  const saved = Boolean(node); const chosen = node?.choice_id ?? choice; const twist = node?.instruction ?? instruction;
  const element = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(Boolean(node?.chapter));
  const hasChapter = Boolean(node?.chapter);
  useEffect(() => {
    if (!hasChapter || compact) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const card = element.current;
      if (!card || card.contains(document.activeElement)) return;
      const bounds = card.getBoundingClientRect();
      // Never change the decision the reader is looking at or using. Keep a
      // small margin so compaction cannot flash at the edge of the viewport.
      if (bounds.bottom >= -64 && bounds.top <= window.innerHeight + 64) return;
      const anchor = card.nextElementSibling;
      const before = anchor?.getBoundingClientRect().top;
      const reader = card.closest<HTMLElement>(".saved-reader");
      const pendingRestore = reader && anchoringRestores.get(reader);
      const anchoring = pendingRestore?.value ?? reader?.style.overflowAnchor ?? "";
      if (pendingRestore) cancelAnimationFrame(pendingRestore.frame);
      if (reader) reader.style.overflowAnchor = "none";
      flushSync(() => setCompact(true));
      if (bounds.bottom < -64 && anchor && before !== undefined) {
        // This adjusts document coordinates only; the visible chapter stays in
        // exactly the same place. Temporarily suppress native anchoring so it
        // cannot apply a second correction after this one.
        window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: "instant" });
      }
      if (reader) {
        // Restore on the next frame: later error/retry content still needs
        // normal browser anchoring. Coalesce two decisions in the same frame.
        const frame = requestAnimationFrame(() => { reader.style.overflowAnchor = anchoring; anchoringRestores.delete(reader); });
        anchoringRestores.set(reader, { frame, value: anchoring });
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [hasChapter, compact]);
  return <section ref={element} className="book-decision" data-step={step} data-submitted={saved} data-compact={compact} aria-label={saved ? `Your choice ${step}` : "Your next choice"}>
    <div hidden={compact}><p className="book-eyebrow">YOUR STORY, YOUR NEXT MOVE</p><h2>{question}</h2></div>
    <div className="book-choice-memory" hidden={!compact}>
      <p className="book-eyebrow">YOUR CHOICE · 0{step}</p>
      <h2>{node?.choice}</h2>
      <details><summary>Your saved choice &amp; twist</summary><p>{question}</p><p><strong>You chose:</strong> {node?.choice}</p><p className="book-saved-twist">{twist || "No extra twist. Your choice set the course."}</p></details>
    </div>
    <form hidden={compact} onSubmit={event => { event.preventDefault(); if (enabled && !saved && chosen) onSubmit({ step, choice_id: chosen, instruction: twist }); }}>
      <fieldset disabled={!enabled || saved} className="book-choices"><legend className="sr-only">Next decision</legend>{options.map((option, index) => <label className={`book-choice ${chosen === option.id ? "is-selected" : ""}`} key={option.id}>
        <input type="radio" name={`saved-choice-${step}`} value={option.id} checked={chosen === option.id} onChange={() => setChoice(option.id)} /><span className="book-choice-number">0{index + 1}</span><span>{option.label}</span><span className="book-radio" aria-hidden="true" />
      </label>)}</fieldset>
      <label className="book-twist-label" htmlFor={`saved-twist-${step}`}>{saved ? "Your saved instruction" : "Add a little of your imagination"} <span>{saved ? "Saved" : "Optional"}</span></label>
      <textarea id={`saved-twist-${step}`} value={twist} onChange={event => setInstruction(event.target.value)} maxLength={500} readOnly={saved} disabled={!enabled && !saved} placeholder={saved ? "No extra twist. Your choice set the course." : "Maybe a cyborg cat appears. Or Kael reaches for a hammer…"} rows={3} />
      <button className="book-primary" disabled={!enabled || saved || !chosen} type="submit">{saved ? "Choice saved" : busy ? "Continuing your story…" : "Continue the story"}<Icon name={saved ? "moon" : "arrow"} size={18} /></button>
      <div className="book-step-status" role="status"><p>{busy || node?.status === "script_running" ? "Writing the next part of your story…" : node?.chapter ? "Your words are saved. Read on whenever you’re ready." : saved ? "Your choice is saved. Pick up the story below." : "Your progress is saved here. Come back whenever you like."}</p></div>
    </form>
  </section>;
}
