import { z } from "zod";

export const DeletionTargetSchema = z.object({ kind: z.enum(["run", "creator"]), id: z.uuid() }).strict();
export const BeginDeletionSchema = DeletionTargetSchema.extend({ action: z.literal("begin"), operation_id: z.uuid(), confirmation_revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const ResumeDeletionSchema = z.object({ action: z.literal("resume"), operation_id: z.uuid() }).strict();
export const DeletionRequestSchema = z.discriminatedUnion("action", [BeginDeletionSchema, ResumeDeletionSchema]);
export const DeletionPreviewSchema = DeletionTargetSchema.extend({ title: z.string(), run_count: z.number().int().nonnegative(), version_count: z.number().int().nonnegative(), active_work: z.boolean(), confirmation_revision: z.string() }).strict();
export const DeletionReceiptSchema = DeletionTargetSchema.extend({ operation_id: z.uuid(), status: z.enum(["pending", "complete", "cleanup_failed"]), deleted_run_count: z.number().int().nonnegative(), remaining_files: z.number().int().nonnegative(), error_code: z.string().nullable() }).strict();
export type DeletionTarget = z.infer<typeof DeletionTargetSchema>;
export type DeletionPreview = z.infer<typeof DeletionPreviewSchema>;
export type DeletionReceipt = z.infer<typeof DeletionReceiptSchema>;
export type BeginDeletionInput = z.infer<typeof BeginDeletionSchema>;
