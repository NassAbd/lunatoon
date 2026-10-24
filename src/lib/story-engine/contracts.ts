import { z } from "zod";
import { ImageApproachSchema, MetricsSchema, ScriptPanelSchema } from "../contracts";

export const Id = z.uuid();
const Key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
const Text = z.string().min(1).max(300);
export const FailurePhaseSchema = z.enum(["provider_parse", "chapter_validation", "state_validation", "node_commit", "panel_commit", "usage_commit", "script_commit"]);
export const FailureDiagnosticsSchema = z.object({
  phase: FailurePhaseSchema,
  kind: z.enum(["schema", "continuity", "storage", "unexpected"]),
  error_type: z.enum(["ZodError", "EngineError", "SQLiteError", "TypeError", "RangeError", "SyntaxError", "UnknownError"]),
  issues: z.array(z.object({ path: z.string().max(200), rule: z.string().max(60) }).strict()).max(12),
  sqlite_code: z.number().int().optional(),
}).strict();
export type FailurePhase = z.infer<typeof FailurePhaseSchema>;
export type FailureDiagnostics = z.infer<typeof FailureDiagnosticsSchema>;
export const ErrorSchema = z.object({ code: z.string(), message: z.string(), request_id: z.string().nullable(), diagnostics: FailureDiagnosticsSchema.optional() });
export const LimitsSchema = z.object({
  max_steps: z.number().int().min(1).max(2),
  max_image_calls: z.number().int().min(2).max(12),
  max_script_calls: z.number().int().min(1).max(6),
  budget_usd: z.number().positive().max(10),
});
export const ModelsSchema = z.object({ story: z.string(), image: z.string(), quality: z.enum(["low", "medium", "high"]) });
const FactSchema = z.object({ id: Key, text: Text }).strict();
export const CharacterSchema = z.object({ id: Key, name: Text, visual_anchor: z.string().min(1).max(900), injuries: z.array(Text).max(8), clothing_condition: Text, carried_objects: z.array(Key).max(8) }).strict();
export const ObjectSchema = z.object({ id: Key, name: Text, condition: z.enum(["intact", "active", "damaged", "destroyed", "missing"]), holder: Key.nullable() }).strict();
export const StateSchema = z.object({ facts: z.array(FactSchema).max(20), characters: z.array(CharacterSchema).min(1).max(6), objects: z.array(ObjectSchema).min(1).max(8), relationships: z.array(Text).max(12), unresolved_threads: z.array(Text).max(8) }).strict();
const UpdatesSchema = z.object({
  facts_added: z.array(FactSchema).min(1).max(4),
  used_fact_ids: z.array(Key).max(6),
  characters_added: z.array(CharacterSchema).max(2),
  appearance_changes: z.array(z.object({ character_id: Key, injuries_added: z.array(Text).max(3), clothing_condition: Text.nullable(), objects_added: z.array(Key).max(3), objects_removed: z.array(Key).max(3) }).strict()).max(4),
  object_updates: z.array(ObjectSchema).max(4),
  relationships_added: z.array(Text).max(3),
  unresolved_threads: z.array(Text).max(8),
}).strict();
export const DecisionSchema = z.object({ question: z.string().max(200), options: z.array(z.object({ id: Key, label: z.string().min(1).max(100), uses_fact_ids: z.array(Key).max(4) }).strict()).max(3) }).strict();
export const ChapterSchema = z.object({
  panels: z.array(ScriptPanelSchema).length(2),
  event: z.object({ action: Text, consequence: Text, source_clue: z.object({ source: z.string().min(3).max(100), evidence: Text }).strict().nullable() }).strict(),
  story_state_updates: UpdatesSchema,
  next_decision: DecisionSchema,
  is_ending: z.boolean(),
}).strict();
// Constrain each paid request to the topology already required by applyChapter.
// Saved chapters keep the shared schema so older runs need no migration.
export function chapterRequestSchema(step: number, maxSteps: number, continuityFactIds: string[] = []) {
  const ending = step === maxSteps;
  // Structured Outputs follows property order: plan the event and memory first,
  // then describe panels against that plan. This is guidance, not semantic proof.
  return z.object({
    is_ending: z.literal(ending),
    event: ChapterSchema.shape.event,
    story_state_updates: UpdatesSchema.extend({
      unresolved_threads: ending ? UpdatesSchema.shape.unresolved_threads.max(0) : UpdatesSchema.shape.unresolved_threads,
      used_fact_ids: step > 1 ? z.array(z.enum(continuityFactIds)).min(1).max(6) : UpdatesSchema.shape.used_fact_ids,
    }),
    panels: ChapterSchema.shape.panels,
    next_decision: DecisionSchema.extend({ options: ending ? DecisionSchema.shape.options.max(0) : z.array(DecisionSchema.shape.options.element.extend({ uses_fact_ids: z.array(Key).min(1).max(4) })).min(2).max(3) }),
  }).strict();
}
export const AssetSchema = z.object({ id: z.string(), path: z.string(), sha256: z.string(), mime: z.string(), purpose: z.string() });
export const BibleSchema = z.object({ id: z.string(), title: z.literal("Neon Protocol"), opening: z.string(), character_bible: z.string(), art_direction: z.string(), device_anchor: z.string(), setting_anchor: z.string(), assets: z.array(AssetSchema) });
export const RunSchema = z.object({ id: Id, operation_id: Id, story_id: z.string(), step: z.number().int(), status: z.enum(["active", "ended"]), state: StateSchema, limits: LimitsSchema, models: ModelsSchema, approach: ImageApproachSchema, created_at: z.number(), updated_at: z.number() });
export const NodeSchema = z.object({
  id: Id, run_id: Id, step: z.number().int(), parent_id: Id.nullable(), operation_id: Id, choice_id: z.string(), choice: z.string(), instruction: z.string(),
  status: z.enum(["script_pending", "script_running", "script_failed", "script_ready", "images_running", "partial", "complete"]),
  before: StateSchema, after: StateSchema.nullable(), chapter: ChapterSchema.nullable(), error: ErrorSchema.nullable(),
  created_at: z.number(), script_ready_at: z.number().nullable(), completed_at: z.number().nullable(), metrics: MetricsSchema.nullable(),
});
export const PanelSchema = z.object({
  id: Id, node_id: Id, sequence: z.number().int(), script: ScriptPanelSchema, visual_brief: z.string(),
  status: z.enum(["pending", "running", "complete", "failed"]), image_path: z.string().nullable(), error: ErrorSchema.nullable(), metrics: MetricsSchema.nullable(), operation_id: Id,
});
export const EventSchema = z.object({
  id: Id, run_id: Id, node_id: Id, panel_id: Id.nullable(), sequence: z.number().int(), operation_id: Id,
  stage: z.enum(["script", "image"]), status: z.enum(["planned", "running", "succeeded", "failed", "interrupted", "cancelled"]),
  model: z.string(), quality: z.enum(["low", "medium", "high"]), approach: ImageApproachSchema,
  reserved_micro_usd: z.number().int().nonnegative().nullable(), estimated_micro_usd: z.number().int().nonnegative().nullable(),
  reference_input_micro_usd: z.number().int().nonnegative().nullable(), price_version: z.string().nullable(),
  metrics: MetricsSchema.nullable(), error: ErrorSchema.nullable(), asset_path: z.string().nullable(),
  lease_until: z.number().nullable(), claim_token: z.string().nullable(), created_at: z.number(), started_at: z.number().nullable(), finished_at: z.number().nullable(),
});
export const SummarySchema = z.object({
  image_calls: z.number(), image_slots_reserved: z.number(), script_calls: z.number(), script_slots_reserved: z.number(),
  estimated_micro_usd: z.number(), held_micro_usd: z.number(), reference_input_micro_usd: z.number(), unknown_cost_attempts: z.number(), unpriced_reservations: z.number(),
  measured_input_tokens: z.number(), measured_output_tokens: z.number(), measured_reference_input_tokens: z.number(),
});
export const SnapshotSchema = z.object({ run: RunSchema, bible: BibleSchema, nodes: z.array(NodeSchema), panels: z.array(PanelSchema), events: z.array(EventSchema), summary: SummarySchema });
export const NewRunRequestSchema = z.object({ operation_id: Id, approach: ImageApproachSchema }).strict();
export const NewNodeRequestSchema = z.object({ operation_id: Id, choice_id: z.string().min(1).max(60), instruction: z.string().trim().max(500).default("") }).strict();
export const StageRequestSchema = z.object({ operation_id: Id, retry: z.boolean().default(false) }).strict();
export const ReplayRequestSchema = z.object({ operation_id: Id, approach: ImageApproachSchema }).strict();
export type StoryState = z.infer<typeof StateSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Bible = z.infer<typeof BibleSchema>;
export type Run = z.infer<typeof RunSchema>;
export type StoryNode = z.infer<typeof NodeSchema>;
export type Panel = z.infer<typeof PanelSchema>;
export type GenerationEvent = z.infer<typeof EventSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type Models = z.infer<typeof ModelsSchema>;
export type Failure = z.infer<typeof ErrorSchema>;
export type NarrativeContext = { bible: Bible; state: StoryState; step: number; max_steps: number; choice: string; instruction: string; recent_panels: z.infer<typeof ScriptPanelSchema>[] };
