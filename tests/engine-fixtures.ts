import { randomUUID } from "node:crypto";
import type { Chapter, NarrativeContext } from "../src/lib/story-engine/contracts";
import type { Metrics } from "../src/lib/contracts";
import { scriptFixture } from "./fixtures";

export const measuredMetrics: Metrics = { model: "gpt-4.1-mini", duration_ms: 50, request_id: "req_mock", usage: { input_tokens: 630, output_tokens: 412, total_tokens: 1042, cached_input_tokens: 0 } };
export const imageMetrics: Metrics = { model: "gpt-image-2.5-flare", quality: "low", approach: "reference", duration_ms: 100, request_id: "req_mock_image", usage: { input_tokens: 1982, input_text_tokens: 542, input_image_tokens: 1440, output_tokens: 158, total_tokens: 2140 } };
export const jpegBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCMABmX/9k=";
export const operation = () => randomUUID();
export function chapterFixture(context?: NarrativeContext): Chapter {
  const ending = context ? context.step >= context.max_steps : false;
  return {
    panels: structuredClone(scriptFixture.panels),
    event: { action: "Kael checks the maker's seal inside the core.", consequence: "The cat opens the station's maintenance hatch.", source_clue: { source: "Aster Transit Lab", evidence: "Maker's seal TL-9 identifies the maintenance network." } },
    story_state_updates: {
      facts_added: ending ? [{ id: "lab_signal_stopped", text: "Kael stops the Aster Transit Lab tracking signal." }, { id: "cat_safe", text: "The cat leaves safely through the TL-9 maintenance hatch." }] : [{ id: "device_source", text: "The device was built by Aster Transit Lab." }, { id: "cat_access", text: "The cyborg cat can open the TL-9 maintenance hatch." }],
      used_fact_ids: ending ? ["device_source", "cat_access"] : [], characters_added: [],
      appearance_changes: ending ? [] : [{ character_id: "kael", injuries_added: ["A shallow cut on his right hand"], clothing_condition: "Yellow coat wet and torn at the right cuff", objects_added: [], objects_removed: [] }],
      object_updates: [], relationships_added: [], unresolved_threads: ending ? [] : ["Why did Aster Transit Lab target Kael?"],
    },
    next_decision: ending ? { question: "", options: [] } : { question: "The lab seal and the cat's hatch reveal a route. What does Kael do?", options: [{ id: "follow_cat", label: "Follow the cat into the Aster Lab maintenance route", uses_fact_ids: ["device_source", "cat_access"] }, { id: "isolate_signal", label: "Use the TL-9 hatch to isolate Aster Lab's signal", uses_fact_ids: ["device_source", "cat_access"] }] },
    is_ending: ending,
  };
}

// Reproduces the hammer choice without forcing a maker/origin revelation.
export function hammerChapterFixture(): Chapter {
  const chapter = chapterFixture();
  chapter.event = { action: "Kael smashes the device with a maintenance hammer.", consequence: "Its cyan core goes dark and the cameras turn away.", source_clue: { source: "Transit maintenance hammer", evidence: "A steel hammer lies beside the shattered housing." } };
  chapter.panels.forEach((panel, index) => {
    panel.visual_description = index === 0 ? "Wide shot: Kael drives a steel hammer into the black device on the platform." : "Close-up: shattered cyan core beneath Kael's yellow cuff; cameras turn away.";
    panel.image_prompt = panel.visual_description;
    panel.dialogues[0].text = index === 0 ? "You don't get to follow me." : "The cameras stopped. Now I choose.";
  });
  chapter.story_state_updates.facts_added = [{ id: "device_destroyed", text: "Kael smashed the device with a hammer; its core is destroyed." }, { id: "tracking_stopped", text: "The cameras turned away when the device's core went dark." }];
  chapter.story_state_updates.appearance_changes = [{ character_id: "kael", injuries_added: [], clothing_condition: null, objects_added: [], objects_removed: ["device"] }];
  chapter.story_state_updates.object_updates = [{ id: "device", name: "Palm-sized black square device with cyan core", condition: "destroyed", holder: null }];
  chapter.next_decision = { question: "With the core shattered and the cameras blind, what does Kael do?", options: [{ id: "leave_station", label: "Leave the broken core and escape the blind cameras", uses_fact_ids: ["device_destroyed", "tracking_stopped"] }, { id: "inspect_fragments", label: "Examine the fragments while the cameras are blind", uses_fact_ids: ["device_destroyed", "tracking_stopped"] }] };
  return chapter;
}

// Synthetic choice-specific responses; these are not recovered live payloads.
export function choiceChapterFixture(choice: "activate" | "destroy" | "investigate", ending = false): Chapter {
  const chapter = choice === "destroy" ? hammerChapterFixture() : chapterFixture();
  if (choice === "activate") {
    chapter.event = { action: "Kael activates the device.", consequence: "The device opens the station's locked escape gate.", source_clue: null };
    chapter.story_state_updates.facts_added = [{ id: "escape_gate_opened", text: "Activating the device opened the station's escape gate." }];
    chapter.story_state_updates.appearance_changes = [];
    chapter.story_state_updates.object_updates = [{ id: "device", name: "Palm-sized black square device with cyan core", condition: "active", holder: "kael" }];
    chapter.next_decision = { question: "The escape gate is open. What does Kael do?", options: [{ id: "take_gate", label: "Escape through the open gate", uses_fact_ids: ["escape_gate_opened"] }, { id: "close_gate", label: "Close the gate to block pursuit", uses_fact_ids: ["escape_gate_opened"] }] };
    chapter.panels[0].visual_description = "Wide shot: Kael activates the black device beside the locked station gate.";
    chapter.panels[1].visual_description = "Close-up: Kael sees the gate unlock, still holding the active device.";
    chapter.panels[0].dialogues[0].text = "Let's see what you do.";
    chapter.panels[1].dialogues[0].text = "An exit. Now I control the way through.";
  } else if (choice === "investigate") {
    chapter.event = { action: "Kael checks the maker's seal as a cyborg cat arrives.", consequence: "The cat reads the seal and unlocks a safe maintenance route.", source_clue: { source: "Aster Transit Lab", evidence: "Its maintenance seal matches the cat's reader." } };
    chapter.story_state_updates.facts_added = [{ id: "maintenance_route_unlocked", text: "The cyborg cat used the device's maker seal to unlock a safe maintenance route." }];
    chapter.story_state_updates.characters_added = [{ id: "relay_cat", name: "Relay", visual_anchor: "Small graphite cyborg cat with white ear tips and a cyan collar", injuries: [], clothing_condition: "Bare metal body and cyan collar", carried_objects: [] }];
    chapter.next_decision = { question: "The cyborg cat opened a safe route. What does Kael do?", options: [{ id: "follow_route", label: "Follow the cat through the unlocked route", uses_fact_ids: ["maintenance_route_unlocked"] }, { id: "secure_route", label: "Secure the open route for others", uses_fact_ids: ["maintenance_route_unlocked"] }] };
    chapter.panels[0].visual_description = "Wide shot: Kael inspects the maker seal while a cyborg cat reads it.";
    chapter.panels[1].visual_description = "Close-up: the cat unlocks a maintenance hatch beside Kael's torn cuff.";
    chapter.panels[0].dialogues[0].text = "You recognize this mark?";
    chapter.panels[1].dialogues[0].text = "A safe route. Lead the way.";
  } else {
    chapter.next_decision.options.forEach(option => { option.uses_fact_ids = ["tracking_stopped"]; });
  }
  chapter.panels.forEach(panel => { panel.image_prompt = panel.visual_description; });
  if (ending) {
    const anchor = chapter.next_decision.options[0].uses_fact_ids[0];
    const route = choice === "activate" ? "open escape gate" : choice === "destroy" ? "station while its cameras remain blind" : "maintenance route alongside the cyborg cat";
    chapter.event = { action: `Kael leaves through the ${route}.`, consequence: "He reaches safety beyond the station's surveillance.", source_clue: null };
    chapter.story_state_updates = { facts_added: [{ id: "kael_reached_safety", text: `Kael escaped through the ${route}.` }], used_fact_ids: [anchor], characters_added: [], appearance_changes: [], object_updates: [], relationships_added: [], unresolved_threads: [] };
    chapter.next_decision = { question: "", options: [] }; chapter.is_ending = true;
    chapter.panels.forEach((panel, index) => {
      panel.visual_description = index === 0 ? `Wide shot: Kael leaves through the ${route}.` : "Close-up: Kael relaxes in safety beyond the station.";
      panel.image_prompt = panel.visual_description;
      panel.dialogues[0].text = index === 0 ? "This way is clear." : "I'm safe. This night is over.";
    });
  }
  return chapter;
}
