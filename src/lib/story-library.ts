import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SCHEMA_VERSION } from "./story-engine/schema";
import { hasDeletionTables } from "./content-management/gate";

export const SavedRunSummarySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  status: z.enum(["new", "in_progress", "illustrating", "needs_attention", "completed"]),
  step: z.number().int().min(0).max(2),
  max_steps: z.number().int().min(1).max(2),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
  completed_panels: z.number().int().min(0).max(4),
  total_panels: z.number().int().min(2).max(4),
}).strict();

export type SavedRunSummary = z.infer<typeof SavedRunSummarySchema>;
export type SavedRunList = { runs: SavedRunSummary[]; has_next: boolean; page: number };

const ListOptionsSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(1).max(12).default(6),
  directory: z.string().min(1).optional(),
}).strict();
const count = z.number().int().nonnegative();
const RowSchema = SavedRunSummarySchema.omit({ status: true, completed_panels: true, total_panels: true }).extend({
  run_status: z.enum(["active", "ended"]),
  node_count: count,
  failed_nodes: count,
  completed_panels: count.max(4),
  waiting_panels: count,
  failed_panels: count,
}).strict();

// Only project the listing contract: private state, instructions, images, events
// and diagnostics stay in the existing engine. This never invokes recovery.
const listSQL = (filterDeleted: boolean) => `
WITH page_runs AS (
  SELECT id, story_id,
    json_extract(document, '$.created_at') AS created_at,
    json_extract(document, '$.updated_at') AS updated_at,
    json_extract(document, '$.step') AS step,
    json_extract(document, '$.limits.max_steps') AS max_steps,
    json_extract(document, '$.status') AS run_status
  FROM story_runs
  ${filterDeleted ? "WHERE NOT EXISTS (SELECT 1 FROM deletion_targets d WHERE d.kind='run' AND d.id=story_runs.id)" : ""}
  ORDER BY created_at DESC, id DESC
  LIMIT ? OFFSET ?
)
SELECT r.id, r.created_at, r.updated_at, r.step, r.max_steps, r.run_status,
  json_extract(s.document, '$.title') AS title,
  (SELECT COUNT(*) FROM story_nodes n WHERE n.run_id=r.id) AS node_count,
  (SELECT COUNT(*) FROM story_nodes n WHERE n.run_id=r.id AND json_extract(n.document, '$.status')='script_failed') AS failed_nodes,
  (SELECT COUNT(*) FROM comic_panels p JOIN story_nodes n ON n.id=p.node_id
    WHERE n.run_id=r.id AND json_extract(p.document, '$.status')='complete') AS completed_panels,
  (SELECT COUNT(*) FROM comic_panels p JOIN story_nodes n ON n.id=p.node_id
    WHERE n.run_id=r.id AND json_extract(p.document, '$.status') IN ('pending', 'running')) AS waiting_panels,
  (SELECT COUNT(*) FROM comic_panels p JOIN story_nodes n ON n.id=p.node_id
    WHERE n.run_id=r.id AND json_extract(p.document, '$.status')='failed') AS failed_panels
FROM page_runs r LEFT JOIN stories s ON s.id=r.story_id
ORDER BY r.created_at DESC, r.id DESC
`;

export function listSavedRuns(options: { page?: number; limit?: number; directory?: string } = {}): SavedRunList {
  const { page, limit, directory } = ListOptionsSchema.parse(options);
  const filename = path.join(path.resolve(directory ?? (process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data"))), "stories.sqlite");
  if (!existsSync(filename)) return { runs: [], has_next: false, page };
  // Do not initialize StoryStore here: its constructor creates files/migrates,
  // while engine.snapshot also mutates expired stages and missing-asset records.
  const db = new DatabaseSync(filename, { readOnly: true, timeout: 1000 });
  try {
    if (db.prepare("PRAGMA user_version").get()?.user_version !== SCHEMA_VERSION) throw new Error("Saved stories use an unsupported database version.");
    const rows = db.prepare(listSQL(hasDeletionTables(db))).all(limit + 1, (page - 1) * limit);
    const runs = rows.slice(0, limit).map(raw => {
      const row = RowSchema.parse(raw);
      const total = row.max_steps * 2;
      let status: SavedRunSummary["status"] = "in_progress";
      if (row.failed_nodes > 0 || row.failed_panels > 0) status = "needs_attention";
      else if (row.run_status === "ended" && row.step === row.max_steps && row.node_count === row.max_steps && row.completed_panels === total) status = "completed";
      else if (row.waiting_panels > 0) status = "illustrating";
      else if (row.node_count === 0) status = "new";
      return SavedRunSummarySchema.parse({
        id: row.id, title: row.title, status,
        step: row.step, max_steps: row.max_steps,
        created_at: row.created_at, updated_at: row.updated_at,
        completed_panels: row.completed_panels, total_panels: total,
      });
    });
    return { runs, has_next: rows.length > limit, page };
  } finally {
    db.close();
  }
}
