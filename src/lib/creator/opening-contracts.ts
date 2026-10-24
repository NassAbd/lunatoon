import { z } from "zod";
import { MetricsSchema } from "../contracts";
import { Id, StoryFoundationSchema } from "../story-engine/contracts";
import { ImagePreviewSchema } from "../story-engine/image-stream";

const Key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
export const SaveDraftSchema = z.object({ operation_id: Id, foundation: StoryFoundationSchema, reference_asset_ids: z.array(Key).max(3) }).strict();
export const OpeningImageSchema = z.object({ operation_id: Id, retry: z.boolean().default(false), acknowledge_unknown: z.boolean().default(false) }).strict();
export const OpeningLimitsSchema = z.object({ max_calls: z.number().int().min(1).max(12), budget_usd: z.number().positive().max(5) }).strict();
export const OpeningErrorSchema = z.object({ code: z.string(), message: z.string(), request_id: z.string().nullable(), issues: z.array(z.object({ path: z.string().max(200), rule: z.string().max(60) }).strict()).max(12) }).strict();
export const OpeningPanelSchema = z.object({
  id: Id, sequence: z.number().int().min(1).max(4), caption: z.string(), scene_description: z.string(),
  shot_direction: z.string(), layout_aspect: z.enum(["square", "vertical", "banner"]), context_hash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "running", "complete", "failed", "interrupted"]), asset_id: Key.nullable(), error: OpeningErrorSchema.nullable(),
}).strict();
export const OpeningAttemptSchema = z.object({
  id: Id, draft_id: Id, template_id: Key, version: z.number().int().positive(), panel_id: Id, operation_id: Id,
  status: z.enum(["running", "succeeded", "failed", "interrupted"]), model: z.string(), quality: z.enum(["low", "medium", "high"]),
  approach: z.enum(["text", "reference"]), reference_count: z.number().int().min(0).max(3), created_at: z.number(), finished_at: z.number().nullable(),
  reserved_micro_usd: z.number().int().nonnegative().nullable(), estimated_micro_usd: z.number().int().nonnegative().nullable(), reference_input_micro_usd: z.number().int().nonnegative().nullable(),
  price_version: z.string().nullable(), metrics: MetricsSchema.nullable(), error: OpeningErrorSchema.nullable(),
}).strict();
export const OpeningSummarySchema = z.object({
  calls: z.number().int(), estimated_micro_usd: z.number().int(), held_micro_usd: z.number().int(), unknown_cost_attempts: z.number().int(), unpriced_attempts: z.number().int(),
  measured_input_tokens: z.number().int(), measured_output_tokens: z.number().int(), measured_reference_input_tokens: z.number().int(), reference_input_micro_usd: z.number().int(),
}).strict();
export const OpeningSnapshotSchema = z.object({
  template_id: Key, version: z.number().int().positive(), status: z.enum(["pending", "running", "failed", "ready"]),
  model: z.string(), quality: z.enum(["low", "medium", "high"]), approach: z.enum(["text", "reference"]), reference_asset_ids: z.array(Key).max(3), limits: OpeningLimitsSchema,
  panels: z.array(OpeningPanelSchema).min(1).max(4), attempts: z.array(OpeningAttemptSchema), summary: OpeningSummarySchema,
}).strict();
// Snapshot schema is passed by the route to avoid a circular schema dependency.
export function openingStreamSchema<T extends z.ZodType>(snapshot: T) {
  return z.discriminatedUnion("type", [ImagePreviewSchema, z.object({ type: z.literal("settled"), snapshot }).strict(), z.object({ type: z.literal("error"), code: z.string(), message: z.string() }).strict()]);
}
export type SaveDraftInput = z.infer<typeof SaveDraftSchema>;
export type OpeningImageInput = z.infer<typeof OpeningImageSchema>;
export type OpeningLimits = z.infer<typeof OpeningLimitsSchema>;
export type OpeningPanel = z.infer<typeof OpeningPanelSchema>;
export type OpeningAttempt = z.infer<typeof OpeningAttemptSchema>;
export type OpeningSnapshot = z.infer<typeof OpeningSnapshotSchema>;
