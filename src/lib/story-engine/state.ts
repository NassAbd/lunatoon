import { CHARACTER_IDENTITY } from "../art-direction";
import { ValidatedScriptSchema } from "../contracts";
import { ChapterSchema, StateSchema, StoryFoundationSchema, StoryTemplateSchema, type Chapter, type StoryState, type StoryFoundation, type StoryTemplate } from "./contracts";
import { withFailurePhase } from "./failure-diagnostics";
import { EngineError } from "./errors";
import { orderedVisualReferences } from "../visual-references";

function requireState(valid: boolean, message: string, issue?: { path: string; rule: string }): asserts valid {
  if (!valid) throw new EngineError("invalid_story_state", message, 422, issue ? { phase: "state_validation", kind: "continuity", error_type: "EngineError", issues: [issue] } : undefined);
}
function validateOwnership(state: StoryState, initial = false) {
  const prefix = initial ? "initial_state." : "";
  // These are two mirrors of the same relation. Do not repair either side: an
  // omitted inventory update cannot be distinguished from a contradictory one.
  for (const [characterIndex, character] of state.characters.entries()) for (const [objectIndex, id] of character.carried_objects.entries()) {
    requireState(state.objects.some(object => object.id === id && object.holder === character.id), initial ? "Initial carried objects and their holder must agree." : "A carried object must exist and its saved holder must match the character.", { path: `${prefix}characters.${characterIndex}.carried_objects.${objectIndex}`, rule: "carried_object_holder_mismatch" });
  }
  for (const [index, object] of state.objects.entries()) if (object.holder != null) {
    const holder = state.characters.find(character => character.id === object.holder);
    requireState(Boolean(holder), "Object holder is unknown to this run.", { path: `${prefix}objects.${index}.holder`, rule: "unknown_object_holder" });
    requireState(holder!.carried_objects.includes(object.id), initial ? "Initial object ownership and carried objects must agree." : "Object ownership and carried-object appearance must agree.", { path: `${prefix}objects.${index}.holder`, rule: "held_object_missing_from_inventory" });
  }
}
export function initialState(): StoryState {
  return { facts: [{ id: "device_knows_kael", text: "The device knows Kael's name." }, { id: "city_ai_silent", text: "The city's AI is silent while cameras track Kael." }], characters: [{ id: "kael", name: "Kael", visual_anchor: CHARACTER_IDENTITY, injuries: [], clothing_condition: "Mustard-yellow trench coat wet from rain", carried_objects: ["device"] }], objects: [{ id: "device", name: "Palm-sized black square device with cyan core", condition: "intact", holder: "kael" }], relationships: ["Kael distrusts the city AI."], unresolved_threads: ["Who sent the device and why does it know Kael?"] };
}
function validateFoundationFields(foundation: StoryFoundation) {
  const state = foundation.initial_state;
  for (const records of [state.facts, state.characters, state.objects, foundation.initial_decision.options]) requireState(new Set(records.map(item => item.id)).size === records.length, "Initial story record IDs must be unique.");
  requireState(state.characters.some(character => character.id === foundation.protagonist_id), "The story protagonist must exist in its initial characters.");
  requireState(state.facts.length <= 12, "The initial story needs room for two chapters of new facts.");
  validateOwnership(state, true);
  for (const effect of foundation.choice_effects) {
    requireState(foundation.initial_decision.options.some(choice => choice.id === effect.choice_id), "A choice effect refers to an unknown initial choice.");
    requireState(state.objects.some(object => object.id === effect.object_id), "A choice effect refers to an unknown initial object.");
    requireState(!state.objects.some(object => object.id === effect.object_id && object.condition === "destroyed") || effect.condition === "destroyed", "A choice cannot restore an initially destroyed object.");
  }
}
export function validateStoryFoundation(value: unknown): StoryFoundation {
  const foundation = StoryFoundationSchema.parse(value); validateFoundationFields(foundation); return foundation;
}
export function validateStoryTemplate(value: unknown): StoryTemplate {
  const template = StoryTemplateSchema.parse(value); validateFoundationFields(template);
  requireState(new Set(template.reference_asset_ids).size === template.reference_asset_ids.length, "Story reference IDs must be unique.");
  orderedVisualReferences(template.reference_asset_ids, template.visual_references);
  return template;
}
export function applyChapter(before: StoryState, proposed: Chapter, step: number, maxSteps: number, openingFactIds: readonly string[] = initialState().facts.map(fact => fact.id)): StoryState {
  requireState(Number.isInteger(step) && step >= 1 && step <= maxSteps && maxSteps <= 2, "Chapter chronology must stay within the configured story steps.");
  const chapter = withFailurePhase("chapter_validation", () => {
    const parsed = ChapterSchema.parse(proposed);
    ValidatedScriptSchema.parse({ story_node_id: "node_step_2", panels: parsed.panels });
    return parsed;
  });
  requireState(chapter.is_ending === (step === maxSteps), "The final decision must end the short story, and earlier decisions must offer a next choice.");
  // Origin reveals and exact wording are creative guidance, never continuity gates.
  const updates = chapter.story_state_updates;
  const facts = new Map(before.facts.map((fact) => [fact.id, fact.text]));
  requireState(new Set(updates.facts_added.map((fact) => fact.id)).size === updates.facts_added.length, "New fact IDs must be unique.");
  for (const fact of updates.facts_added) requireState(!facts.has(fact.id), "A new fact must not replace or contradict an existing fact ID.");
  const used = new Set(updates.used_fact_ids);
  for (const id of used) requireState(facts.has(id), "The chapter used a fact not present in this run's saved context.", { path: "story_state_updates.used_fact_ids", rule: "unknown_fact_reference" });
  if (step > 1) {
    const openingFacts = new Set(openingFactIds);
    requireState([...used].some(id => !openingFacts.has(id)), "The second continuation must use a consequence established by the first decision.", { path: "story_state_updates.used_fact_ids", rule: "missing_saved_consequence" });
  }
  const after = structuredClone(before);
  after.facts.push(...updates.facts_added);
  const addedIds = new Set(updates.facts_added.map((fact) => fact.id));
  if (chapter.is_ending) requireState(chapter.next_decision.options.length === 0 && updates.unresolved_threads.length === 0, "An ending cannot offer another decision or leave unresolved threads.");
  else {
    requireState(chapter.next_decision.options.length >= 2 && chapter.next_decision.question.trim().length >= 8, "Provide two or three meaningful next options.");
    requireState(new Set(chapter.next_decision.options.map((option) => option.id)).size === chapter.next_decision.options.length, "Next option IDs must be unique.");
    // A choice can connect the new consequence to an earlier motive or clue.
    // References must exist in this run and include a consequence of this chapter.
    for (const [index, option] of chapter.next_decision.options.entries()) {
      const path = `next_decision.options.${index}.uses_fact_ids`;
      requireState(option.uses_fact_ids.every(id => after.facts.some(fact => fact.id === id)), "A next decision references facts not established in this run.", { path, rule: "unknown_fact_reference" });
      requireState(option.uses_fact_ids.some(id => addedIds.has(id)), "Each next decision must reference a new consequence of this chapter.", { path, rule: "missing_new_fact_reference" });
    }
  }
  for (const character of updates.characters_added) {
    requireState(!after.characters.some((old) => old.id === character.id), "Character identity anchors are immutable once established.");
    after.characters.push(character);
  }
  for (const [updateIndex, object] of updates.object_updates.entries()) {
    const index = after.objects.findIndex((old) => old.id === object.id);
    const old = after.objects[index];
    requireState(old?.condition !== "destroyed" || object.condition === "destroyed", "A destroyed object cannot silently become intact again.");
    requireState(!old || old.name === object.name, "Object identity anchors cannot be renamed.");
    requireState(object.holder == null || after.characters.some((character) => character.id === object.holder), "Object holder is unknown to this run.", { path: `story_state_updates.object_updates.${updateIndex}.holder`, rule: "unknown_object_holder" });
    if (index < 0) after.objects.push(object); else after.objects[index] = object;
  }
  for (const change of updates.appearance_changes) {
    const character = after.characters.find((item) => item.id === change.character_id);
    requireState(Boolean(character), "An appearance update refers to an unknown character.");
    character!.injuries = [...new Set([...character!.injuries, ...change.injuries_added])];
    if (change.clothing_condition != null) character!.clothing_condition = change.clothing_condition;
    character!.carried_objects = [...new Set([...character!.carried_objects.filter((id) => !change.objects_removed.includes(id)), ...change.objects_added])];
  }
  validateOwnership(after);
  after.relationships = [...new Set([...after.relationships, ...updates.relationships_added])];
  after.unresolved_threads = updates.unresolved_threads;
  return StateSchema.parse(after);
}
