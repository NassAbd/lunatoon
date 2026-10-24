import { z } from "zod";
import type { FailureDiagnostics, FailurePhase } from "./contracts";
import { EngineError } from "./errors";

// Only schema field names and numeric indices may enter diagnostics. Never log
// values, Zod messages/input, arbitrary object keys, provider bodies or stacks.
const fields = new Set("panels panel_id sequence_index layout_aspect visual_description image_prompt dialogues id character text position style event action consequence source_clue source evidence story_state_updates facts_added used_fact_ids characters_added appearance_changes character_id injuries_added clothing_condition objects_added objects_removed object_updates relationships_added unresolved_threads next_decision question options label uses_fact_ids is_ending facts characters name visual_anchor injuries carried_objects objects condition holder relationships before after chapter metrics model duration_ms request_id usage input_tokens output_tokens total_tokens cached_input_tokens input_text_tokens input_image_tokens run_id node_id step status parent_id operation_id choice_id choice instruction created_at script_ready_at completed_at error quality approach prompt_version sdk_ms validation_ms output_chars".split(" "));
const customRules: Record<string, string> = {
  "Panels must be ordered 1, 2.": "panel_order",
  "Panel IDs must be unique.": "panel_ids_unique",
  "Dialogue IDs must be unique within a panel.": "dialogue_ids_unique",
};
function safePath(path: PropertyKey[]): string {
  return path.slice(0, 12).map(part => typeof part === "number" && Number.isSafeInteger(part) && part >= 0 ? String(part) : typeof part === "string" && fields.has(part) ? part : "field").join(".").slice(0, 200) || "chapter";
}
function unexpectedType(error: unknown): FailureDiagnostics["error_type"] {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  return "UnknownError";
}
export function stageError(error: unknown, phase: FailurePhase): EngineError {
  if (error instanceof EngineError) {
    error.diagnostics ??= { phase, kind: "continuity", error_type: "EngineError", issues: [] };
    return error;
  }
  if (error instanceof z.ZodError) {
    const code = phase === "chapter_validation" || phase === "provider_parse" ? "invalid_chapter_contract" : "invalid_saved_state_contract";
    return new EngineError(code, "The chapter failed a local contract check. No story changes were applied. See the saved phase and field rules before explicitly retrying.", 422, {
      phase, kind: "schema", error_type: "ZodError",
      issues: error.issues.slice(0, 12).map(issue => ({ path: safePath(issue.path), rule: issue.code === "custom" ? (Object.hasOwn(customRules, issue.message) ? customRules[issue.message] : "custom_constraint") : issue.code })),
    });
  }
  if (typeof error === "object" && error && "code" in error && error.code === "ERR_SQLITE_ERROR") {
    const sqliteCode = "errcode" in error && typeof error.errcode === "number" && Number.isSafeInteger(error.errcode) ? error.errcode : undefined;
    return new EngineError("story_storage_failed", "The story could not be saved to the local database. No automatic retry was made. Inspect the saved phase and storage code.", 500, { phase, kind: "storage", error_type: "SQLiteError", issues: [], ...(sqliteCode == null ? {} : { sqlite_code: sqliteCode }) });
  }
  return new EngineError("story_stage_internal_error", "A local story stage failed. No automatic retry was made. Inspect its saved phase and error type.", 500, { phase, kind: "unexpected", error_type: unexpectedType(error), issues: [] });
}
export function withFailurePhase<T>(phase: FailurePhase, work: () => T): T {
  try { return work(); } catch (error: unknown) { throw stageError(error, phase); }
}
