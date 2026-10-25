"use client";

import type { StoryFoundation } from "@/lib/story-engine/contracts";
import { useId } from "react";
import { updateFoundationChoice } from "@/lib/creator/editing";

type FoundationEditorProps = {
  foundation: StoryFoundation;
  onChange: (next: StoryFoundation) => void;
  disabled?: boolean;
};

type FieldProps = {
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
};

function Field({ label, value, maxLength, onChange, rows, disabled }: FieldProps) {
  const labelId = useId();
  const attributes = { value, maxLength, minLength: 1, required: true, disabled, "aria-labelledby": labelId };
  return <label className="studio-field">
    <span id={labelId}>{label}</span>
    {rows
      ? <textarea {...attributes} rows={rows} onChange={event => onChange(event.target.value)} />
      : <input {...attributes} type="text" onChange={event => onChange(event.target.value)} />}
  </label>;
}

export function FoundationEditor({ foundation, onChange, disabled = false }: FoundationEditorProps) {
  const protagonist = foundation.initial_state.characters.find(character => character.id === foundation.protagonist_id);
  const field = (key: "title" | "genre" | "description" | "world" | "premise" | "character_bible" | "art_direction" | "object_anchor" | "setting_anchor", label: string, maxLength: number, rows?: number) =>
    <Field key={key} label={label} value={foundation[key]} maxLength={maxLength} rows={rows} disabled={disabled} onChange={value => onChange({ ...foundation, [key]: value })} />;

  return <div className="studio-editor">
    <div className="studio-fields">
      <div className="studio-grid">
        {field("title", "Story title", 100)}
        {field("genre", "Genre", 80)}
      </div>
      {field("description", "Synopsis", 400, 3)}
      {field("world", "World", 1200, 4)}
      {field("premise", "Premise", 1200, 4)}
      {field("character_bible", "Character & motivation", 6000, 5)}
      {protagonist && <section className="studio-fields" aria-label="Main character appearance">
        <p><strong>{protagonist.name}</strong></p>
        <p className="studio-muted">Keep their defining features consistent throughout the story.</p>
        <Field label="Character appearance" value={protagonist.visual_anchor} maxLength={900} rows={4} disabled={disabled} onChange={visualAnchor => onChange({
          ...foundation,
          initial_state: {
            ...foundation.initial_state,
            characters: foundation.initial_state.characters.map(character => character.id === protagonist.id ? { ...character, visual_anchor: visualAnchor } : character),
          },
        })} />
      </section>}
      {field("art_direction", "Visual direction", 3000, 4)}
      <p className="studio-muted">Save draft keeps these scenes without generating artwork. Save &amp; Illustrate creates the opening illustrations; later panels follow your reading choices.</p>
      {foundation.opening_beats.map((beat, index) => <Field key={index} label={`Opening beat ${index + 1}`} value={beat.caption} maxLength={500} rows={3} disabled={disabled} onChange={caption => onChange({
        ...foundation,
        opening_beats: foundation.opening_beats.map((current, currentIndex) => currentIndex === index ? { ...current, caption } : current),
      })} />)}
      <Field label="First decision question" value={foundation.initial_decision.question} maxLength={200} disabled={disabled} onChange={question => onChange({ ...foundation, initial_decision: { ...foundation.initial_decision, question } })} />
      {foundation.initial_decision.options.map((option, index) => <Field key={option.id} label={`Choice ${index + 1}`} value={option.label} maxLength={100} disabled={disabled} onChange={label => onChange(updateFoundationChoice(foundation, option.id, label))} />)}
      <details>
        <summary>Continuity notes</summary>
        <div className="studio-fields">
          <p className="studio-muted">Details the story should remember about its objects, places and rules.</p>
          {field("object_anchor", "Important objects", 1200, 3)}
          {field("setting_anchor", "Setting details", 1200, 3)}
          {foundation.continuity_rules.map((rule, index) => <div className="studio-fields" key={index}>
            <Field label={`Continuity note ${index + 1}`} value={rule} maxLength={300} rows={2} disabled={disabled} onChange={value => onChange({ ...foundation, continuity_rules: foundation.continuity_rules.map((current, currentIndex) => currentIndex === index ? value : current) })} />
            <button type="button" disabled={disabled} aria-label={`Remove continuity note ${index + 1}`} onClick={() => onChange({ ...foundation, continuity_rules: foundation.continuity_rules.filter((_, currentIndex) => currentIndex !== index) })}>Remove note</button>
          </div>)}
          <button type="button" disabled={disabled || foundation.continuity_rules.length >= 10} onClick={() => onChange({ ...foundation, continuity_rules: [...foundation.continuity_rules, ""] })}>Add a note</button>
        </div>
      </details>
    </div>
  </div>;
}
