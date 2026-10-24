// Deterministic provider output for integration tests; never calls a paid service.
export function mockChapter(context) {
  if (context.choice === "Destroy the device") return hammerChapter(context);
  const ending = context.step === context.max_steps;
  if (ending && context.state.objects.some(object => object.id === "device" && object.condition === "destroyed")) return hammerEnding(context);
  const first = ending ? "The cat's TL-9 route leads to Aster Transit Lab. Kael disconnects its tracking relay with his cut hand." : "Kael reads the Aster Transit Lab maker's seal; a cyborg cat opens the TL-9 maintenance hatch.";
  const second = ending ? "Kael's torn yellow cuff frames the now-dark relay. The cat escapes safely and city surveillance stops." : "Kael catches his right cuff on the hatch, cutting his hand. The cat points toward the lab's relay.";
  return {
    panels: [first, second].map((text, i) => ({ panel_id: `panel_${i + 1}`, sequence_index: i + 1, layout_aspect: "vertical", visual_description: text, image_prompt: `${i === 0 ? "SCENE_ONE Wide establishing" : "SCENE_TWO Expressive close-up"}: ${text} Keep lettering absent.`, dialogues: [{ id: `bubble_${i + 1}`, character: "Kael", text: ending ? i === 0 ? "Aster Lab's signal ends here. Lead me through TL-9." : "No more tracking. You're free, little guide." : i === 0 ? "Aster Transit Lab. You're opening their TL-9 hatch?" : "A torn cuff for a route to the truth.", position: i === 0 ? "top-left" : "bottom-right", style: "normal" }] })),
    event: { action: first, consequence: second, source_clue: { source: "Aster Transit Lab", evidence: "The TL-9 maker's seal matches the station maintenance network." } },
    story_state_updates: {
      facts_added: ending ? [{ id: "lab_signal_stopped", text: "Kael stops the Aster Transit Lab tracking signal." }, { id: "cat_safe", text: "The cat escapes safely through the TL-9 hatch." }] : [{ id: "device_source", text: "The device was built by Aster Transit Lab." }, { id: "cat_access", text: "The cyborg cat opens the TL-9 maintenance hatch." }],
      used_fact_ids: ending ? ["device_source", "cat_access"] : [], characters_added: [], appearance_changes: ending ? [] : [{ character_id: "kael", injuries_added: ["A shallow cut on his right hand"], clothing_condition: "Yellow coat wet and torn at the right cuff", objects_added: [], objects_removed: [] }], object_updates: [], relationships_added: [], unresolved_threads: ending ? [] : ["Why did Aster Transit Lab target Kael?"],
    },
    next_decision: ending ? { question: "", options: [] } : { question: "The lab seal and cat's TL-9 hatch reveal a route. What now?", options: [{ id: "follow_cat", label: "Follow the cat into the Aster Lab maintenance route", uses_fact_ids: ["device_source", "cat_access"] }, { id: "isolate_signal", label: "Use the TL-9 hatch to isolate Aster Lab's signal", uses_fact_ids: ["device_source", "cat_access"] }] }, is_ending: ending,
  };
}
export const jpegBase64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCMABmX/9k=";

function hammerChapter(context) {
  const chapter = mockChapter({ ...context, choice: "Investigate its origin" });
  chapter.event = { action: "Kael smashes the device with a maintenance hammer.", consequence: "The core goes dark and surveillance cameras turn away.", source_clue: null };
  chapter.panels[0].visual_description = "Wide shot: Kael drives a hammer into the black device on the platform.";
  chapter.panels[1].visual_description = "Close-up: shattered cyan core beside the hammer; the cameras turn away.";
  chapter.panels.forEach((panel, i) => { panel.image_prompt = (i ? "SCENE_TWO Expressive close-up: " : "SCENE_ONE Wide establishing: ") + panel.visual_description; panel.dialogues[0].text = i ? "The cameras stopped. Now I choose." : "You don't get to follow me."; });
  chapter.story_state_updates.facts_added = [{ id: "device_destroyed", text: "Kael destroyed the device with a hammer." }, { id: "tracking_stopped", text: "The cameras turned away as the shattered core went dark." }];
  chapter.story_state_updates.appearance_changes = [{ character_id: "kael", injuries_added: [], clothing_condition: null, objects_added: [], objects_removed: ["device"] }];
  chapter.story_state_updates.object_updates = [{ id: "device", name: context.state.objects.find(object => object.id === "device").name, condition: "destroyed", holder: null }];
  chapter.next_decision = { question: "With the core shattered and the cameras blind, what does Kael do?", options: [{ id: "leave_station", label: "Leave the broken core and escape the blind cameras", uses_fact_ids: ["device_destroyed", "tracking_stopped"] }, { id: "inspect_fragments", label: "Examine the fragments while the cameras are blind", uses_fact_ids: ["device_destroyed", "tracking_stopped"] }] };
  return chapter;
}
function hammerEnding(context) {
  // Build the normal ending shape without recursing through the destroyed state.
  const chapter = mockChapter({ ...context, state: { ...context.state, objects: [] } });
  chapter.event = { action: "Kael leaves the shattered device and exits beneath the blind cameras.", consequence: "He escapes the station without a tracking signal.", source_clue: null };
  chapter.panels.forEach((panel, i) => { panel.visual_description = i ? "Close-up: Kael's amber eye catches dawn as the station recedes; the broken core stays behind." : "Wide shot: Kael leaves the fragments and hammer on the platform, walking beneath blind cameras."; panel.image_prompt = (i ? "SCENE_TWO: " : "SCENE_ONE: ") + panel.visual_description; panel.dialogues[0].text = i ? "For once, the city doesn't know my next move." : "A broken core. Blind cameras. My way out."; });
  chapter.story_state_updates.facts_added = [{ id: "station_escaped", text: "Kael escaped while the cameras were blind." }, { id: "fragments_left", text: "The shattered device remains abandoned on the platform." }];
  chapter.story_state_updates.used_fact_ids = ["device_destroyed", "tracking_stopped"];
  return chapter;
}
