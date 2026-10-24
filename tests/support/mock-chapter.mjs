// Deterministic provider output for integration tests; never calls a paid service.
export function mockChapter(context) {
  if (context.bible.template?.protagonist_id === "ada") return cartographerChapter(context);
  if (context.bible.template?.id === "last-lightkeeper") return lightkeeperChapter(context);
  if (context.bible.template?.id === "glass-orchard") return orchardChapter(context);
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

export function mockFoundation(input = {}, openingCount = 2) {
  return {
    title: input.title || "The Star Atlas", genre: input.genre || "Celestial Adventure",
    description: "A cartographer unfolds a silent star chart and chooses a way home before the sky closes.",
    premise: "In a hilltop observatory, Ada holds an indigo star chart whose ink has faded. A storm hides the north star. One silver crease still catches moonlight, while the old bell tower remains visible through the glass roof.",
    world: "The hillside observatory and its nearby bell tower beneath a stormy violet sky. Moonlight reveals physical routes along old paper folds. Keep the story within this small, quiet world.",
    protagonist_id: "ada",
    character_bible: "Ada is a thirty-year-old cartographer with dark-brown skin, a long black braid over her anatomical right shoulder, round silver spectacles, and a cobalt poncho over a white shirt. She is patient and observant. Preserve her face, braid side, spectacles and costume.",
    art_direction: "Original flat ink comic with indigo, cream, cobalt and silver, clean contours and restrained two-tone shadows. No photorealism, lettering or watermarks. Keep quiet space for dialogue overlays.",
    object_anchor: "A folded indigo paper star chart with a silver crescent seal. Preserve its folds, color, scale and ownership. Its revealed route is shown by silver shapes, never drawn letters.",
    setting_anchor: "A small hillside observatory with a glass roof and a visible bell tower; violet storm clouds and silver moonlight.",
    continuity_rules: ["Ada keeps her identity and silver spectacles.", "The chart is initially faded and intact in Ada's hands.", "Choices must reveal a concrete route or consequence.", "The ending settles Ada's way home without introducing another quest."],
    initial_state: {
      facts: [{ id: "north_star_hidden", text: "Storm clouds hide the north star above the observatory." }, { id: "chart_faded", text: "Ada's star chart has faded except for a silver crease." }, { id: "bell_tower_visible", text: "The nearby bell tower remains visible through the observatory roof." }],
      characters: [{ id: "ada", name: "Ada", visual_anchor: "Ada has dark-brown skin, a long black braid over her anatomical right shoulder, round silver spectacles, a cobalt poncho and a white shirt.", injuries: [], clothing_condition: "Dry cobalt poncho and white shirt", carried_objects: ["star_chart"] }],
      objects: [{ id: "star_chart", name: "Folded indigo star chart with a silver crescent seal", condition: "intact", holder: "ada" }],
      relationships: ["Ada wants to find a safe way home before the storm closes in."], unresolved_threads: ["Can Ada recover a route from the faded star chart?"],
    },
    initial_decision: { question: "How should Ada find the missing route?", options: [{ id: "trace_crease", label: "Trace the chart's silver crease in moonlight" }, { id: "watch_tower", label: "Align the chart with the visible bell tower" }, { id: "open_roof", label: "Open the observatory roof to follow the wind" }] },
    opening_beats: [
      { caption: "Ada waits under the observatory's glass roof. Clouds have hidden the north star.", alt: "Ada holds her faded indigo chart under a glass observatory roof" },
      { caption: "One silver crease still catches the moon. Beyond it, the bell tower stands clear.", alt: "Moonlight catches a silver fold in Ada's chart beside the distant bell tower" },
      { caption: "She brings the chart to the window, keeping the distant bell tower in sight.", alt: "Ada's cobalt poncho and silver spectacles at the observatory window, chart in hand" },
      { caption: "A gust rattles the roof. Ada must choose how to find the missing route.", alt: "The storm presses against the glass roof while Ada studies her folded chart" },
    ].slice(0, Math.max(1, Math.min(4, openingCount))),
    choice_effects: [],
  };
}

function cartographerChapter(context) {
  const ending = context.step === context.max_steps;
  const first = ending ? "Ada aligns the silver crease with the visible bell tower, keeping the indigo chart open in her hands." : "Ada traces the indigo chart's silver crease in moonlight. A folded route points toward the visible bell tower.";
  const second = ending ? "Ada follows the revealed path to her lit home below the bell tower, her cobalt poncho and right-shoulder braid unchanged." : "Through her silver spectacles Ada sees the crease split around a flooded stair; a dry path runs beside the bell tower.";
  return {
    panels: [first, second].map((text, index) => ({ panel_id: `panel_${index + 1}`, sequence_index: index + 1, layout_aspect: "vertical", visual_description: text, image_prompt: `${index ? "SCENE_TWO Close-up" : "SCENE_ONE Wide shot"}: ${text} No lettering.`, dialogues: [{ id: `bubble_${index + 1}`, character: "Ada", text: ending ? index ? "Home, before the storm. I found my own way." : "The tower and the silver fold agree. This is the dry path." : index ? "The stairs are flooded, but the tower's side path is dry." : "Moonlight brings out the fold. It points to the bell tower.", position: index ? "bottom-right" : "top-left", style: "normal" }] })),
    event: { action: first, consequence: second, source_clue: null },
    story_state_updates: {
      facts_added: ending ? [{ id: "dry_path_followed", text: "Ada aligned her chart with the tower and followed the dry side path." }, { id: "ada_home", text: "Ada reached her lit home before the storm closed in." }] : [{ id: "silver_route_found", text: "Moonlight revealed a route along the chart's silver crease toward the bell tower." }, { id: "dry_side_path", text: "The tower's side path is dry while the main stair is flooded." }],
      used_fact_ids: ending ? ["silver_route_found", "dry_side_path"] : ["chart_faded", "bell_tower_visible"], characters_added: [], appearance_changes: [], object_updates: [], relationships_added: [], unresolved_threads: ending ? [] : ["Will Ada take the dry path home before the storm arrives?"],
    },
    next_decision: ending ? { question: "", options: [] } : { question: "The silver route reveals a dry path beside the tower. How will Ada reach home?", options: [{ id: "follow_dry_path", label: "Align the chart and follow the dry side path home", uses_fact_ids: ["silver_route_found", "dry_side_path"] }, { id: "mark_safe_route", label: "Confirm the dry route from the tower before heading home", uses_fact_ids: ["silver_route_found", "dry_side_path"] }] }, is_ending: ending,
  };
}

function lightkeeperChapter(context) {
  const ending = context.step === context.max_steps;
  const first = ending
    ? "Mara aligns the lighthouse lens's brass ring with the causeway marker, holding the tide lantern steady to restore the missing third reflection."
    : "Mara follows the exposed causeway into the tower with her tide lantern and inspects the dark lighthouse lens. Its turned brass ring blocks the third reflection.";
  const second = ending
    ? "The tide moves again beneath the causeway. Mara keeps her seafoam cape and ivory shell hairpin as the lighthouse answers with three warm pulses."
    : "Mara holds the hexagonal brass tide lantern beside the fixed lens. Two reflections pass its brass ring; a causeway marker shows where the third should pass.";
  return {
    panels: [first, second].map((text, index) => ({
      panel_id: `panel_${index + 1}`, sequence_index: index + 1, layout_aspect: "vertical", visual_description: text,
      image_prompt: `${index ? "SCENE_TWO Expressive close-up" : "SCENE_ONE Wide establishing"}: ${text} No lettering.`,
      dialogues: [{ id: `bubble_${index + 1}`, character: "Mara", text: ending ? index ? "Three lights. The sea can find its way home." : "The marker shows where the third light belongs." : index ? "The causeway marker shows where this ring belongs." : "The lighthouse lens blocks the third reflection.", position: index ? "bottom-right" : "top-left", style: "normal" }],
    })),
    event: { action: first, consequence: second, source_clue: { source: "The lighthouse lens's brass alignment ring", evidence: "The causeway marker matches the turned ring that blocks the third reflection." } },
    story_state_updates: {
      facts_added: ending ? [{ id: "third_pulse_restored", text: "Mara aligned the lighthouse lens's ring with the causeway marker and restored its third reflection." }, { id: "tide_returned", text: "The lighthouse answered all three pulses and the island's tide resumed." }] : [{ id: "blocked_third_pulse", text: "The turned lighthouse lens ring blocks the lantern's third reflection." }, { id: "causeway_alignment", text: "A marker on the exposed causeway shows the lens ring's correct alignment." }],
      used_fact_ids: ending ? ["blocked_third_pulse", "causeway_alignment"] : ["tide_stalled", "lantern_answers"],
      characters_added: [], appearance_changes: [], object_updates: [], relationships_added: [],
      unresolved_threads: ending ? [] : ["Can Mara restore the third pulse before the lighthouse goes dark?"],
    },
    next_decision: ending ? { question: "", options: [] } : {
      question: "The blocked third pulse and causeway marker reveal the missing rhythm. What will Mara do?",
      options: [
        { id: "align_ring", label: "Align the lighthouse lens ring with the causeway marker", uses_fact_ids: ["blocked_third_pulse", "causeway_alignment"] },
        { id: "signal_lighthouse", label: "Carry the lantern to the marker and signal the lighthouse", uses_fact_ids: ["blocked_third_pulse", "causeway_alignment"] },
      ],
    }, is_ending: ending,
  };
}

function orchardChapter(context) {
  const ending = context.step === context.max_steps;
  const first = ending
    ? "Ivo lifts the root knot from the return valve, keeping the copper seed compass in his other hand. Water returns to the glass orchard's dry channels."
    : "Ivo opens the sealed irrigation hatch beneath the hot glass canopy. His copper seed compass points at a thick root knot trapped in a return valve.";
  const second = ending
    ? "Water reaches the last living sapling. Ivo's round copper glasses catch its new green leaves as he closes the hatch gently without harming the roots."
    : "Ivo studies the trapped root through his round copper glasses. Water knocks behind the valve while the compass's coral center points toward the sapling's channel.";
  return {
    panels: [first, second].map((text, index) => ({ panel_id: `panel_${index + 1}`, sequence_index: index + 1, layout_aspect: "vertical", visual_description: text,
      image_prompt: `${index ? "SCENE_TWO Expressive close-up" : "SCENE_ONE Wide establishing"}: ${text} No lettering.`,
      dialogues: [{ id: `bubble_${index + 1}`, character: "Ivo", text: ending ? index ? "The roots can drink again. This grove has a tomorrow." : "Easy now. We can free the water without cutting you." : index ? "The sapling's channel is beyond this valve. There's still time." : "A living root jammed the return valve. The water never left.", position: index ? "bottom-right" : "top-left", style: "normal" }],
    })),
    event: { action: first, consequence: second, source_clue: { source: "The irrigation hatch's return valve", evidence: "A visible root knot pins the valve shut while water knocks behind it." } },
    story_state_updates: {
      facts_added: ending ? [{ id: "return_valve_freed", text: "Ivo freed the return valve without cutting the living roots." }, { id: "sapling_watered", text: "Water reached the last sapling and its leaves opened beneath the glass canopy." }] : [{ id: "root_knot_found", text: "A living root knot jams the irrigation return valve." }, { id: "sapling_channel_found", text: "The seed compass identifies the sapling's channel beyond the blocked valve." }],
      used_fact_ids: ending ? ["root_knot_found", "sapling_channel_found"] : ["orchard_dry", "compass_points"],
      characters_added: [], appearance_changes: [], object_updates: [], relationships_added: [], unresolved_threads: ending ? [] : ["How can Ivo restore water to the sapling without harming the living roots?"],
    },
    next_decision: ending ? { question: "", options: [] } : { question: "A root blocks the return valve beside the sapling's channel. How will Ivo restore the water?", options: [
      { id: "free_root", label: "Lift the living root free of the return valve", uses_fact_ids: ["root_knot_found", "sapling_channel_found"] },
      { id: "reroute_water", label: "Guide water around the root into the sapling's channel", uses_fact_ids: ["root_knot_found", "sapling_channel_found"] },
    ] }, is_ending: ending,
  };
}
// Original opaque 32×48 color fixture. A 1×1 JPEG scaled into Chrome's
// composited image layer can show the underlying placeholder in screenshots.
export const jpegBase64 = "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAYH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnwCMZ8AAAAAAAAAA/9k=";

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
