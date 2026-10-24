// Deterministic provider output for integration tests; never calls a paid service.
export function mockChapter(context) {
  const ending = context.step === context.max_steps;
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
