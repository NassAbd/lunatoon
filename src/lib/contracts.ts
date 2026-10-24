import { z } from "zod";

export const CHOICES = ["Activate the device", "Destroy the device", "Investigate its origin"] as const;
export const INITIAL_CONTEXT = "New Kyoto, 2089. Rain never stops in the lower city. Detective Kael follows an anonymous signal into an abandoned transit station. Beneath a shattered advertisement, he finds a palm-sized black device with a pulsing cyan core. It knows his name. Every surveillance camera turns toward him. For the first time in years, the city's all-seeing AI has gone silent.";
export { CHARACTER_IDENTITY, ART_DIRECTION } from "./art-direction";
export const ImageApproachSchema = z.enum(["text", "reference"]);
export type ImageApproach = z.infer<typeof ImageApproachSchema>;

const shortText = z.string().min(1).max(400);
export const SpeechBubbleSchema = z.object({
  id: z.string().min(1).max(60),
  character: z.string().min(1).max(60),
  text: z.string().min(1).max(180),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
  style: z.enum(["normal", "whisper", "shout"]),
}).strict();

export const ScriptPanelSchema = z.object({
  panel_id: z.string().min(1).max(60),
  sequence_index: z.number().int().min(1).max(2),
  layout_aspect: z.enum(["square", "vertical", "banner"]),
  visual_description: shortText,
  image_prompt: z.string().min(1).max(1800),
  dialogues: z.array(SpeechBubbleSchema).min(1).max(2),
}).strict();

// Keep the model's strict JSON schema free of cross-field refinements.
export const ScriptSchema = z.object({
  story_node_id: z.literal("node_step_2"),
  panels: z.array(ScriptPanelSchema).length(2),
}).strict();
export const ValidatedScriptSchema = ScriptSchema.superRefine((script, ctx) => {
  if (script.panels.length !== 2) return;
  if (script.panels[0].sequence_index !== 1 || script.panels[1].sequence_index !== 2) {
    ctx.addIssue({ code: "custom", path: ["panels"], message: "Panels must be ordered 1, 2." });
  }
  if (script.panels[0].panel_id === script.panels[1].panel_id) {
    ctx.addIssue({ code: "custom", path: ["panels", 1, "panel_id"], message: "Panel IDs must be unique." });
  }
  for (const [index, panel] of script.panels.entries()) {
    if (new Set(panel.dialogues.map((bubble) => bubble.id)).size !== panel.dialogues.length) {
      ctx.addIssue({ code: "custom", path: ["panels", index, "dialogues"], message: "Dialogue IDs must be unique within a panel." });
    }
  }
});

export const StoryRequestSchema = z.object({
  context: z.literal(INITIAL_CONTEXT),
  choice: z.enum(CHOICES),
  instruction: z.string().trim().max(500).default(""),
}).strict();
export const ImageRequestSchema = z.object({ panel: ScriptPanelSchema, approach: ImageApproachSchema.default("text") }).strict();
export const UsageSchema = z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
  input_text_tokens: z.number().nonnegative().optional(),
  input_image_tokens: z.number().nonnegative().optional(),
  cached_input_tokens: z.number().nonnegative().optional(),
});
export const MetricsSchema = z.object({
  model: z.string(),
  duration_ms: z.number().nonnegative(),
  request_id: z.string().nullable(),
  usage: UsageSchema.nullable(),
  quality: z.string().optional(),
  approach: ImageApproachSchema.optional(),
  prompt_version: z.string().optional(),
  sdk_ms: z.number().nonnegative().optional(),
  validation_ms: z.number().nonnegative().optional(),
  output_chars: z.number().nonnegative().optional(),
  client: z.object({ request_ms: z.number().nonnegative(), validation_ms: z.number().nonnegative(), decode_ms: z.number().nonnegative() }).optional(),
});
export const StoryResponseSchema = z.object({ script: ValidatedScriptSchema, metrics: MetricsSchema });
export const ImageResponseSchema = z.object({
  panel_id: z.string(),
  image_url: z.string().startsWith("data:image/jpeg;base64,"),
  metrics: MetricsSchema,
});
export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), request_id: z.string().nullable() }),
  duration_ms: z.number().nonnegative(),
});

export type SpeechBubble = z.infer<typeof SpeechBubbleSchema>;
export type ScriptPanel = z.infer<typeof ScriptPanelSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type StoryRequest = z.infer<typeof StoryRequestSchema>;
export type StoryResponse = z.infer<typeof StoryResponseSchema>;
export type ImageResponse = z.infer<typeof ImageResponseSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type ComicPanel = ScriptPanel & {
  image_url?: string;
  status: "pending_script" | "rendering_text" | "loading_image" | "complete";
  error?: string;
  metrics?: Metrics;
};
