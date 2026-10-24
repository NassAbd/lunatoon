import type { Script, Metrics, StoryResponse } from "../src/lib/contracts";

export const metricsFixture: Metrics = { model: "test-model", duration_ms: 100, request_id: "test-request", usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } };
export const scriptFixture: Script = {
  story_node_id: "node_step_2",
  panels: [1, 2].map((index) => ({
    panel_id: `panel_${index}`,
    sequence_index: index,
    layout_aspect: "vertical",
    visual_description: `Kael studies the device beneath the rain, scene ${index}.`,
    image_prompt: `Kael in his yellow coat holds a cyan device, scene ${index}.`,
    dialogues: [{ id: `bubble_${index}`, character: "Kael", text: index === 1 ? "Who sent you?" : "Then let's find out.", position: "top-left", style: "normal" }],
  })),
};
export const storyFixture: StoryResponse = { script: scriptFixture, metrics: metricsFixture };
