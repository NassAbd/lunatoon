import { CHARACTER_IDENTITY } from "../art-direction";
import { ValidatedScriptSchema } from "../contracts";
import { ChapterSchema, StateSchema, type Chapter, type StoryState } from "./contracts";
import { withFailurePhase } from "./failure-diagnostics";
import { EngineError } from "./errors";

function requireState(valid: boolean, message: string): asserts valid {
  if (!valid) throw new EngineError("invalid_story_state", message, 422);
}
export function initialState(): StoryState {
  return { facts: [{ id: "device_knows_kael", text: "The device knows Kael's name." }, { id: "city_ai_silent", text: "The city's AI is silent while cameras track Kael." }], characters: [{ id: "kael", name: "Kael", visual_anchor: CHARACTER_IDENTITY, injuries: [], clothing_condition: "Mustard-yellow trench coat wet from rain", carried_objects: ["device"] }], objects: [{ id: "device", name: "Palm-sized black square device with cyan core", condition: "intact", holder: "kael" }], relationships: ["Kael distrusts the city AI."], unresolved_threads: ["Who sent the device and why does it know Kael?"] };
}
export function applyChapter(before: StoryState, proposed: Chapter, step: number, maxSteps: number): StoryState {
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
  for (const id of used) requireState(facts.has(id), "The chapter used a fact not present in this run's saved context.");
  if (step > 1) {
    const openingFacts = new Set(initialState().facts.map(fact => fact.id));
    requireState([...used].filter(id => !openingFacts.has(id)).length >= 2, "The second continuation must use at least two facts established by the first decision.");
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
    for (const option of chapter.next_decision.options) requireState(new Set(option.uses_fact_ids).size >= 2 && option.uses_fact_ids.some(id => addedIds.has(id)) && option.uses_fact_ids.every((id) => after.facts.some((fact) => fact.id === id)), "Each next decision must use two established facts, including a new consequence.");
  }
  for (const character of updates.characters_added) {
    requireState(!after.characters.some((old) => old.id === character.id), "Character identity anchors are immutable once established.");
    after.characters.push(character);
  }
  for (const object of updates.object_updates) {
    const index = after.objects.findIndex((old) => old.id === object.id);
    const old = after.objects[index];
    requireState(old?.condition !== "destroyed" || object.condition === "destroyed", "A destroyed object cannot silently become intact again.");
    requireState(!old || old.name === object.name, "Object identity anchors cannot be renamed.");
    requireState(object.holder == null || after.characters.some((character) => character.id === object.holder), "Object holder is unknown to this run.");
    if (index < 0) after.objects.push(object); else after.objects[index] = object;
  }
  for (const change of updates.appearance_changes) {
    const character = after.characters.find((item) => item.id === change.character_id);
    requireState(Boolean(character), "An appearance update refers to an unknown character.");
    character!.injuries = [...new Set([...character!.injuries, ...change.injuries_added])];
    if (change.clothing_condition != null) character!.clothing_condition = change.clothing_condition;
    character!.carried_objects = [...new Set([...character!.carried_objects.filter((id) => !change.objects_removed.includes(id)), ...change.objects_added])];
  }
  for (const character of after.characters) requireState(character.carried_objects.every((id) => after.objects.some((object) => object.id === id && object.holder === character.id)), "A carried object must exist and its saved holder must match the character.");
  for (const object of after.objects) requireState(object.holder == null || after.characters.some(character => character.id === object.holder && character.carried_objects.includes(object.id)), "Object ownership and carried-object appearance must agree.");
  after.relationships = [...new Set([...after.relationships, ...updates.relationships_added])];
  after.unresolved_threads = updates.unresolved_threads;
  return StateSchema.parse(after);
}
