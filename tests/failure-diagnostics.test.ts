import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorSchema } from "../src/lib/story-engine/contracts";
import { stageError, withFailurePhase } from "../src/lib/story-engine/failure-diagnostics";
import { EngineError } from "../src/lib/story-engine/errors";
import { providerFailure } from "../src/lib/story-engine/provider";

describe("safe stage diagnostics", () => {
  it("reports field paths and rules without leaking rejected values, arbitrary keys, messages or stack traces", () => {
    const privateText = "PRIVATE_CONTENT_MUST_NOT_APPEAR";
    const raw = new z.ZodError([{ code: "custom", path: [privateText, "panels", 1, "dialogues"], message: privateText }]);
    const failure = stageError(raw, "chapter_validation");
    expect(failure.code).toBe("invalid_chapter_contract");
    expect(failure.diagnostics?.issues).toEqual([{ path: "field.panels.1.dialogues", rule: "custom_constraint" }]);
    expect(JSON.stringify({ code: failure.code, message: failure.message, diagnostics: failure.diagnostics })).not.toContain(privateText);
    const unexpected = stageError(new TypeError(privateText), "panel_commit");
    expect(unexpected.diagnostics).toMatchObject({ phase: "panel_commit", error_type: "TypeError" });
    expect(unexpected.message).not.toContain(privateText);
  });
  it("distinguishes schema, continuity, SQLite and unexpected failures and preserves the original inner phase", () => {
    const schema = z.object({ facts: z.array(z.string()).max(1) }).safeParse({ facts: ["first", "second"] });
    if (schema.success) throw new Error("Expected a fixture validation error");
    const inner = stageError(schema.error, "state_validation");
    expect(inner.code).toBe("invalid_saved_state_contract");
    expect(stageError(inner, "script_commit").diagnostics?.phase).toBe("state_validation");
    expect(stageError(new EngineError("invalid_story_state", "A static invariant message."), "state_validation").diagnostics?.kind).toBe("continuity");
    expect(stageError({ code: "ERR_SQLITE_ERROR", errcode: 2067, message: "DO_NOT_REPORT_SQL_OR_CONTENT" }, "panel_commit").diagnostics).toEqual({ phase: "panel_commit", kind: "storage", error_type: "SQLiteError", issues: [], sqlite_code: 2067 });
    expect(() => withFailurePhase("node_commit", () => { throw new Error("private error"); })).toThrow(EngineError);
  });
  it("recognizes SDK parsing failures and reads old saved errors without a migration", () => {
    const result = z.object({ panels: z.array(z.string()).length(2) }).safeParse({ panels: [] });
    if (result.success) throw new Error("Expected a fixture validation error");
    expect(providerFailure(result.error)).toMatchObject({ code: "invalid_chapter_contract", request_id: null, diagnostics: { phase: "provider_parse", kind: "schema" } });
    expect(ErrorSchema.parse({ code: "stage_failed", message: "Historical failure", request_id: null }).diagnostics).toBeUndefined();
  });
});
