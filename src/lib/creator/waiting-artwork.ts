import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { StoryTemplateSchema, type Snapshot } from "../story-engine/contracts";
import { CreatorAssetSchema } from "./contracts";
import { OpeningPanelSchema } from "./opening-contracts";
import { openingShots } from "./opening-plan";
import { isContentDeleted, safeDatabaseFile } from "../content-management/gate";
import { safeOwnedFile } from "../content-management/files";

// Read only the saved classification and ownership fields. This adapter never
// opens CreatorStore, migrates storage, recovers stages or changes a template.
const OpeningMetadata = z.object({ template_id: z.string(), version: z.number().int().positive(), draft_id: z.uuid(), panels: z.array(OpeningPanelSchema).min(1).max(4) });
const Row = z.object({ draft_id: z.uuid(), template_document: z.string(), opening_document: z.string() });

export function getSavedOpeningScenery(snapshot: Pick<Snapshot, "run" | "bible">, directory?: string): string[] {
  const template = snapshot.bible.template;
  if (!template?.id.startsWith("creator_") || template.status !== "ready") return [];
  const root = path.resolve(directory ?? (process.env.LUNATOON_DATA_DIR || path.join(process.cwd(), "data")));
  if (!existsSync(path.join(root, "creator.sqlite"))) return [];
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(safeDatabaseFile(root, "creator.sqlite"), { readOnly: true, timeout: 1000 });
    if (Number(db.prepare("PRAGMA user_version").get()?.user_version) !== 2) return [];
    const row = Row.safeParse(db.prepare(`SELECT t.draft_id, t.document AS template_document, o.document AS opening_document
      FROM creator_templates t JOIN creator_drafts d ON d.id=t.draft_id
      JOIN creator_openings o ON o.template_id=t.id AND o.version=t.version AND o.draft_id=t.draft_id
      WHERE t.id=? AND t.version=?`).get(template.id, template.version));
    if (!row.success) return [];
    const saved = StoryTemplateSchema.parse(JSON.parse(row.data.template_document) as unknown);
    const opening = OpeningMetadata.parse(JSON.parse(row.data.opening_document) as unknown);
    if (JSON.stringify(saved) !== JSON.stringify(StoryTemplateSchema.parse(template))
      || template.id !== `creator_${row.data.draft_id.replaceAll("-", "")}`
      || opening.template_id !== template.id || opening.version !== template.version || opening.draft_id !== row.data.draft_id
      || isContentDeleted(root, "run", snapshot.run.id) || isContentDeleted(root, "template", template.id) || isContentDeleted(root, "draft", row.data.draft_id)) return [];
    if (opening.panels.length !== template.opening_beats.length || !opening.panels.every((panel, index) => panel.sequence === index + 1
      && panel.status === "complete" && panel.error === null && panel.asset_id === template.opening_beats[index].asset_id)) return [];

    // This exact code-authored classification establishes scene intent, not
    // pixel content. Medium, close-up and ambiguous over-shoulder shots stay out.
    const first = opening.panels[0];
    if (first.shot_direction !== openingShots[0] || !first.asset_id) return [];
    const assetRow = db.prepare("SELECT document FROM creator_assets WHERE id=? AND draft_id=?").get(first.asset_id, row.data.draft_id);
    if (typeof assetRow?.document !== "string") return [];
    const asset = CreatorAssetSchema.parse(JSON.parse(assetRow.document) as unknown);
    const frozen = snapshot.bible.assets.find(item => item.id === first.asset_id);
    const beat = template.opening_beats[0];
    if (!frozen || asset.id !== first.asset_id || asset.draft_id !== row.data.draft_id || asset.kind !== "opening" || asset.mime !== "image/jpeg"
      || frozen.mime !== asset.mime || frozen.sha256 !== asset.sha256 || frozen.path !== `references/${asset.sha256}.jpg`
      || asset.width !== beat.width || asset.height !== beat.height) return [];
    const bytes = readFileSync(safeOwnedFile(root, frozen.path));
    if (createHash("sha256").update(bytes).digest("hex") !== frozen.sha256) return [];
    return [first.asset_id];
  } catch {
    // Optional decoration must not make an otherwise readable saved story fail.
    // Missing/malformed legacy metadata or missing artwork keeps the placeholder.
    return [];
  } finally { db?.close(); }
}
