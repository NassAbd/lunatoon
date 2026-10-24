import { z } from "zod";
import { MetricsSchema } from "../contracts";
import { Id, StoryFoundationSchema, StoryTemplateSchema } from "../story-engine/contracts";

const Key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
const configuration = z.string().trim().max(300);
export const CreateDraftSchema = z.object({ operation_id: Id }).strict();
export const GenerateFoundationSchema = z.object({
  operation_id: Id, prompt: z.string().trim().min(20).max(4000),
  title: configuration.default(""), genre: configuration.default(""), main_character: configuration.default(""),
  visual_style: configuration.default(""), atmosphere: configuration.default(""),
  retry_of: Id.optional(), acknowledge_unknown: z.boolean().default(false),
}).strict();
export const FoundationPromptSchema = GenerateFoundationSchema.pick({ prompt: true, title: true, genre: true, main_character: true, visual_style: true, atmosphere: true });
// Artwork IDs are supplied by the server's authored-placeholder helper, not uploaded SVGs.
export const SaveTemplateSchema = z.object({
  operation_id: Id, foundation: StoryFoundationSchema,
  reference_asset_ids: z.array(Key).max(3), cover_asset_id: Key,
  opening_asset_ids: z.array(Key).min(1).max(4),
}).strict();
export const CreatorLimitsSchema = z.object({ max_calls: z.number().int().min(1).max(3), budget_usd: z.number().positive().max(1) }).strict();
export const CreatorErrorSchema = z.object({
  code: z.string(), message: z.string(), request_id: z.string().nullable(),
  issues: z.array(z.object({ path: z.string().max(200), rule: z.string().max(60) }).strict()).max(12),
}).strict();
export const CreatorAssetSchema = z.object({
  id: Key, draft_id: Id, mime: z.enum(["image/png", "image/svg+xml"]),
  width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), purpose: z.string().trim().min(1).max(200),
  kind: z.enum(["reference", "artwork"]), created_at: z.number(),
}).strict();
export const CreatorDraftSchema = z.object({
  id: Id, operation_id: Id, template_id: Key, status: z.enum(["draft", "ready"]),
  foundation: StoryFoundationSchema.nullable(), reference_asset_ids: z.array(Key).max(3),
  last_input: FoundationPromptSchema.nullable(),
  limits: CreatorLimitsSchema, model: z.string(), latest_saved_version: z.number().int().positive().nullable(),
  created_at: z.number(), updated_at: z.number(),
}).strict();
export const CreatorAttemptSchema = z.object({
  id: Id, draft_id: Id, operation_id: Id, status: z.enum(["running", "succeeded", "failed", "interrupted"]),
  model: z.string(), created_at: z.number(), finished_at: z.number().nullable(),
  reserved_micro_usd: z.number().int().nonnegative().nullable(), estimated_micro_usd: z.number().int().nonnegative().nullable(),
  price_version: z.string().nullable(), metrics: MetricsSchema.nullable(), error: CreatorErrorSchema.nullable(),
}).strict();
export const CreatorSummarySchema = z.object({
  calls: z.number().int(), estimated_micro_usd: z.number().int(), held_micro_usd: z.number().int(),
  unknown_cost_attempts: z.number().int(), unpriced_attempts: z.number().int(),
  measured_input_tokens: z.number().int(), measured_output_tokens: z.number().int(),
}).strict();
export const CreatorSnapshotSchema = z.object({
  draft: CreatorDraftSchema, attempts: z.array(CreatorAttemptSchema), assets: z.array(CreatorAssetSchema),
  latest_template: StoryTemplateSchema.nullable(), summary: CreatorSummarySchema,
}).strict();
export type GenerateFoundationInput = z.infer<typeof GenerateFoundationSchema>;
export type FoundationPrompt = Pick<GenerateFoundationInput, "prompt" | "title" | "genre" | "main_character" | "visual_style" | "atmosphere">;
export type SaveTemplateInput = z.infer<typeof SaveTemplateSchema>;
export type CreatorLimits = z.infer<typeof CreatorLimitsSchema>;
export type CreatorError = z.infer<typeof CreatorErrorSchema>;
export type CreatorAsset = z.infer<typeof CreatorAssetSchema>;
export type CreatorDraft = z.infer<typeof CreatorDraftSchema>;
export type CreatorAttempt = z.infer<typeof CreatorAttemptSchema>;
export type CreatorSummary = z.infer<typeof CreatorSummarySchema>;
export type CreatorSnapshot = z.infer<typeof CreatorSnapshotSchema>;
