"use client";
import { useState } from "react";
import type { StoryNode } from "@/lib/story-engine/contracts";
import { Icon } from "./icon";

export type ReaderChoice = { id: string; label: string };
export type ReaderSubmission = { step: number; choice_id: string; instruction: string };
export function ReaderDecision({ step, question, options, node, enabled, busy, onSubmit }: {
  step: number; question: string; options: ReaderChoice[]; node?: StoryNode;
  enabled: boolean; busy: boolean; onSubmit: (input: ReaderSubmission) => void;
}) {
  const [choice, setChoice] = useState(""); const [instruction, setInstruction] = useState("");
  const saved = Boolean(node); const chosen = node?.choice_id ?? choice; const twist = node?.instruction ?? instruction;
  // Keep this decision in the same position and at the same dimensions after it
  // becomes history. Removing/replacing the form used to move the reading strip.
  return <section className="book-decision" data-step={step} data-submitted={saved} aria-label={saved ? `Your choice ${step}` : "Your next choice"}>
    <p className="book-eyebrow">YOUR STORY, YOUR NEXT MOVE</p><h2>{question}</h2>
    <form onSubmit={event => { event.preventDefault(); if (enabled && !saved && chosen) onSubmit({ step, choice_id: chosen, instruction: twist }); }}>
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
