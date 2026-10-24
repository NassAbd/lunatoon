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
