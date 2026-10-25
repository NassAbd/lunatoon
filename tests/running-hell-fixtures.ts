import type { Chapter, StoryFoundation, StoryState, StoryTemplate } from "../src/lib/story-engine/contracts";
import { chapterFixture } from "./engine-fixtures";

// Reconstructed only from the user's supplied anchors. All surrounding prose,
// facts and chapters are synthetic fixtures, not recovered provider responses.
export const runningHellInstruction = "He'll use his speed to introduce into Nexus's HQ.";
export function runningHellState(): StoryState {
  return { facts: [{ id: "nexus_threatens_city", text: "NEXUS threatens the city." }], characters: [{ id: "kai_fox", name: "Kai Fox", visual_anchor: "red_jacket_ponytail", injuries: [], clothing_condition: "Red jacket", carried_objects: ["speedcore_device"] }], objects: [{ id: "speedcore_device", name: "SpeedCore Device", condition: "intact", holder: "kai_fox" }], relationships: [], unresolved_threads: ["Can Kai stop NEXUS?"] };
}
export function runningHellFoundation(): StoryFoundation {
  return { title: "Running Hell", genre: "Synthetic action fixture", description: "A runner uses his speed to save the city.", premise: "Kai must reach NEXUS headquarters before its relay activates.", world: "An original fictional city used only in tests.", protagonist_id: "kai_fox", character_bible: "Kai Fox wears a red jacket and has a ponytail. He wants to save the city.", art_direction: "Original red and charcoal comic ink.", object_anchor: "SpeedCore Device stays with Kai unless an explicit transfer or drop occurs.", setting_anchor: "NEXUS headquarters in the fictional city.", continuity_rules: ["Kai retains the same identity.", "Using or wearing the SpeedCore does not transfer it."], initial_state: runningHellState(), initial_decision: { question: "How will Kai respond?", options: [{ id: "stop_nexus", label: "Use the speed to stop NEXUS and save the city." }, { id: "evacuate", label: "Use the speed to evacuate the square." }, { id: "inspect_core", label: "Inspect the SpeedCore before acting." }] }, opening_beats: [{ caption: "Kai faces the headquarters with his SpeedCore.", alt: "Kai wears his red jacket and carries the SpeedCore." }], choice_effects: [] };
}
export function runningHellTemplate(): StoryTemplate {
  const foundation = runningHellFoundation();
  return { ...foundation, id: "creator_00000000000040008000000000000001", version: 1, status: "ready", cover_asset_id: "opening", reference_asset_ids: [], opening_beats: foundation.opening_beats.map(beat => ({ ...beat, asset_id: "opening", width: 800, height: 600 })) };
}
export function runningHellChapter(ending = false): Chapter {
  const chapter = chapterFixture();
  chapter.event = { action: ending ? "Kai leaves the SpeedCore in the headquarters relay slot." : "Kai wears and uses his SpeedCore to enter NEXUS headquarters.", consequence: ending ? "The relay shuts down and the city is safe." : "Kai reaches the relay before it activates.", source_clue: null };
  chapter.story_state_updates = { facts_added: [{ id: ending ? "city_saved" : "nexus_hq_entered", text: ending ? "The relay is disabled and the city is safe." : "Kai reached the NEXUS relay using his speed." }], used_fact_ids: ending ? ["nexus_hq_entered"] : [], characters_added: [], appearance_changes: [{ character_id: "kai_fox", injuries_added: [], clothing_condition: ending ? "Red jacket; wrist strap empty after leaving SpeedCore in the relay" : "Red jacket with the SpeedCore attached at the wrist", objects_added: [], objects_removed: ending ? ["speedcore_device"] : [] }], object_updates: [{ ...runningHellState().objects[0], condition: ending ? "intact" : "active", holder: ending ? null : "kai_fox" }], relationships_added: [], unresolved_threads: ending ? [] : ["How will Kai disable the relay?"] };
  chapter.next_decision = ending ? { question: "", options: [] } : { question: "Kai has reached the relay. What does he do?", options: [{ id: "disable_relay", label: "Leave the SpeedCore in the relay to stop it", uses_fact_ids: ["nexus_hq_entered"] }, { id: "isolate_relay", label: "Isolate the relay while keeping the SpeedCore", uses_fact_ids: ["nexus_hq_entered"] }] };
  chapter.is_ending = ending;
  chapter.panels.forEach((panel, index) => {
    panel.visual_description = ending ? index === 0 ? "Wide shot: Kai places the inert SpeedCore in the relay slot." : "Close-up: Kai steps away with empty hands as the relay goes dark." : index === 0 ? "Wide shot: Kai races into headquarters with the SpeedCore strapped to his wrist." : "Close-up: Kai steadies his wrist-mounted SpeedCore beside the relay.";
    panel.image_prompt = panel.visual_description;
    panel.dialogues.forEach(dialogue => { dialogue.character = "Kai Fox"; dialogue.text = ending ? "The city is safe." : "I reached the relay in time."; });
  });
  return chapter;
}
