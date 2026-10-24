import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { BibleSchema, Id, NodeSchema, PanelSchema, RunSchema, type Bible, type Panel, type Run, type StoryNode } from "./contracts";
import { EngineError } from "./errors";
import { SCHEMA_VERSION } from "./schema";

export type StoryExport = { html: string; filename: string };
const CONTENT_POLICY = "default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
export const EXPORT_CONTENT_POLICY = `${CONTENT_POLICY}; sandbox`;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_EXPORT_IMAGE_BYTES = 48 * 1024 * 1024;
function unavailable(): never { throw new EngineError("export_asset_unavailable", "A saved illustration is missing, unsupported or could not be verified. Restore it before downloading this story.", 409); }
function invalid(): never { throw new EngineError("export_invalid_saved_story", "The saved story order or ownership could not be verified. Preserve the data and check this run before exporting.", 409); }
function incomplete(): never { throw new EngineError("export_not_complete", "Finish the story and save every illustration before downloading it.", 409); }
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function parse<T>(row: Record<string, unknown> | undefined, schema: z.ZodType<T>): T {
  if (!row) invalid();
  try { return schema.parse(JSON.parse(z.string().parse(row.document)) as unknown); } catch { return invalid(); }
}
type ExportRecords = { run: Run; bible: Bible; nodes: StoryNode[]; panels: Panel[]; root: string };
function load(runId: string, directory?: string): ExportRecords {
  if (!Id.safeParse(runId).success) throw new EngineError("invalid_id", "Choose a saved local story.", 400);
  const requested = path.resolve(directory ?? process.env.LUNATOON_DATA_DIR ?? path.join(process.cwd(), "data"));
  const database = path.join(requested, "stories.sqlite");
  if (!existsSync(database)) throw new EngineError("not_found", "This saved story was not found.", 404);
  const root = realpathSync(requested); const db = new DatabaseSync(database, { readOnly: true, timeout: 5000 });
  try {
    if (Number(db.prepare("PRAGMA user_version").get()?.user_version) !== SCHEMA_VERSION) throw new EngineError("export_storage_version", "This saved-story database version is not supported for export.", 409);
    db.exec("BEGIN");
    const runRow = db.prepare("SELECT id,story_id,document FROM story_runs WHERE id=?").get(runId);
    if (!runRow) throw new EngineError("not_found", "This saved story was not found.", 404);
    const run = parse(runRow, RunSchema); if (run.id !== runId || run.story_id !== runRow.story_id) invalid();
    const bible = parse(db.prepare("SELECT document FROM stories WHERE id=?").get(run.story_id), BibleSchema); if (bible.id !== run.story_id) invalid();
    const nodes = db.prepare("SELECT id,run_id,step,document FROM story_nodes WHERE run_id=? ORDER BY step").all(runId).map(row => {
      const node = parse(row, NodeSchema); if (node.id !== row.id || node.run_id !== runId || node.step !== row.step) invalid(); return node;
    });
    const panels = db.prepare("SELECT p.id,p.node_id,p.sequence,p.document FROM comic_panels p JOIN story_nodes n ON n.id=p.node_id WHERE n.run_id=? ORDER BY n.step,p.sequence").all(runId).map(row => {
      const panel = parse(row, PanelSchema); if (panel.id !== row.id || panel.node_id !== row.node_id || panel.sequence !== row.sequence) invalid(); return panel;
    });
    if (run.status !== "ended" || run.step !== run.limits.max_steps || nodes.length !== run.limits.max_steps || panels.length !== run.limits.max_steps * 2) incomplete();
    for (const [index, node] of nodes.entries()) {
      if (node.status !== "complete" || !node.chapter || !node.after) incomplete();
      if (node.step !== index + 1 || node.parent_id !== (nodes[index - 1]?.id ?? null) || node.chapter.is_ending !== (index === nodes.length - 1)) invalid();
      const pair = panels.filter(panel => panel.node_id === node.id); if (pair.length !== 2) invalid();
      for (const [sequence, panel] of pair.entries()) {
        if (panel.status !== "complete" || !panel.image_path) incomplete();
        if (panel.sequence !== sequence + 1 || panel.script.sequence_index !== sequence + 1 || JSON.stringify(panel.script) !== JSON.stringify(node.chapter.panels[sequence])) invalid();
      }
    }
    const ending = nodes.at(-1)!.chapter!;
    if (ending.next_decision.options.length || ending.story_state_updates.unresolved_threads.length) invalid();
    db.exec("COMMIT"); return { run, bible, nodes, panels, root };
  } finally { if (db.isTransaction) db.exec("ROLLBACK"); db.close(); }
}
function readOwned(root: string, relative: string, expectedHash?: string): Buffer {
  try {
    const target = path.resolve(root, relative);
    // Canonical paths only: a link must never point an export into another run
    // or outside its data directory, even if the JSON record was altered.
    if (!target.startsWith(`${root}${path.sep}`) || realpathSync(target) !== target || statSync(target).size > MAX_ASSET_BYTES) unavailable();
    const bytes = readFileSync(target); if (expectedHash && hash(bytes) !== expectedHash) unavailable(); return bytes;
  } catch { return unavailable(); }
}
function openingBytes(records: ExportRecords, id: string) {
  const asset = records.bible.assets.find(asset => asset.id === id);
  if (!asset || !["image/svg+xml", "image/png", "image/jpeg", "image/webp"].includes(asset.mime) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !new RegExp(`^references/${asset.sha256}\\.(?:svg|png|jpg|webp)$`).test(asset.path)) unavailable();
  return { bytes: readOwned(records.root, asset.path, asset.sha256), mime: asset.mime };
}
// Export supports the repository's small authored SVG subset. It is not a
// general SVG sanitizer: unknown tags, resource attributes, CSS, entities and
// escaped URL syntax are rejected before any rasterizer sees the document.
function validateAuthoredSVG(bytes: Buffer) {
  if (bytes.length > 1024 * 1024) unavailable();
  const source = bytes.toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
  if (/<\?|<!|\bstyle\s*=|@import/i.test(source)) unavailable();
  const tags = new Set("svg g defs lineargradient radialgradient stop pattern filter fegaussianblur rect path circle ellipse line polyline polygon text tspan title desc clippath mask".split(" "));
  for (const match of source.matchAll(/<\s*\/?\s*([a-zA-Z][\w:-]*)\b/g)) if (!tags.has(match[1].toLowerCase())) unavailable();
  for (const match of source.matchAll(/([^\s="'<>/]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    const name = match[1].toLowerCase(), value = match[3];
    if (name.startsWith("on") || name === "style" || name.includes(":") || ["href", "src"].includes(name) || /[\\&]/.test(value)) unavailable();
    for (const url of value.matchAll(/url\s*\(([^)]*)\)/gi)) if (!/^#[a-zA-Z0-9_-]+$/.test(url[1].trim())) unavailable();
  }
}
async function rasterize(bytes: Buffer, mime: string) {
  if (mime === "image/svg+xml") validateAuthoredSVG(bytes);
  try {
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    const expected = mime === "image/svg+xml" ? "svg" : mime === "image/jpeg" ? "jpeg" : mime.slice(6);
    if (metadata.format !== expected || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || metadata.width * metadata.height > 16_000_000 || (metadata.pages ?? 1) > 1) unavailable();
    const format = mime === "image/jpeg" ? "jpeg" : "png";
    const pipeline = image.autoOrient().toColourspace("srgb");
    const result = await (format === "jpeg" ? pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }) : pipeline.png()).toBuffer({ resolveWithObject: true });
    if (result.data.length > MAX_ASSET_BYTES) unavailable();
    return { src: `data:image/${format};base64,${result.data.toString("base64")}`, width: result.info.width, height: result.info.height, bytes: result.data.length };
  } catch { return unavailable(); }
}

const STYLE = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#FAFAF7;color:#202124;font:18px/1.6 system-ui,sans-serif}main{width:min(800px,calc(100% - 48px));margin:60px auto 80px}header{text-align:center;margin:0 0 56px}.brand{font-size:16px;letter-spacing:.14em;text-transform:uppercase}h1{font:600 clamp(36px,7vw,64px)/1.1 Georgia,serif;margin:16px 0}h2{font:600 28px/1.2 Georgia,serif}figure{margin:0 0 48px;background:white;border:1px solid #E8E9E5;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:22px 28px}.choice{padding:28px;margin:64px 0 32px;border-left:4px solid #D9F77C;background:#fff}.choice h2{margin:0 0 12px}.twist{margin-bottom:0;white-space:pre-wrap}.dialogues{display:grid;gap:12px}.bubble{margin:0;padding:14px 18px;border:1px solid #E8E9E5;border-radius:18px;background:#FAFAF7}.speaker{display:block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.ending{margin:64px 0 0;text-align:center;border-top:1px solid #E8E9E5;padding-top:48px}.ending ol{text-align:left;padding-left:26px}.ending li{margin:16px 0}.note{font-size:14px;color:#62675d}.label{font-size:12px;letter-spacing:.12em;text-transform:uppercase}.opening-caption{white-space:pre-wrap}@media print{body{background:white}main{width:100%;margin:0}figure{break-inside:avoid}header,.choice{break-after:avoid}}`;

export async function exportCompletedStory(runId: string, options: { directory?: string } = {}): Promise<StoryExport> {
  const records = load(runId, options.directory); let imageBytes = 0;
  const embedded = async (bytes: Buffer, mime: string, alt: string) => {
    const image = await rasterize(bytes, mime); imageBytes += image.bytes;
    if (imageBytes > MAX_EXPORT_IMAGE_BYTES) throw new EngineError("export_too_large", "This story is too large for a single HTML download.", 409);
    return `<img src="${image.src}" width="${image.width}" height="${image.height}" alt="${escape(alt)}">`;
  };
  const template = records.bible.template;
  const opening = template?.opening_beats ?? [{ asset_id: "opening", caption: records.bible.opening, alt: "Saved opening illustration" }];
  const openingFigures: string[] = [];
  for (const beat of opening) {
    const asset = openingBytes(records, beat.asset_id);
    openingFigures.push(`<figure>${await embedded(asset.bytes, asset.mime, beat.alt)}<figcaption class="opening-caption">${escape(beat.caption)}</figcaption></figure>`);
  }
  const chapters: string[] = [];
  for (const node of records.nodes) {
    const figures: string[] = [];
    for (const panel of records.panels.filter(panel => panel.node_id === node.id)) {
      if (!panel.image_path || !new RegExp(`^images/${records.run.id}/[a-f0-9-]{36}\\.jpg$`).test(panel.image_path)) unavailable();
      const image = await embedded(readOwned(records.root, panel.image_path), "image/jpeg", panel.script.visual_description);
      const dialogues = panel.script.dialogues.map(bubble => `<p class="bubble"><span class="speaker">${escape(bubble.character)}</span>${escape(bubble.text)}</p>`).join("");
      figures.push(`<figure class="panel">${image}<figcaption class="dialogues">${dialogues}</figcaption></figure>`);
    }
    chapters.push(`<section aria-label="Decision ${node.step}"><div class="choice"><p class="label">Decision ${node.step}</p><h2>${escape(node.choice)}</h2>${node.instruction ? `<p class="twist">${escape(node.instruction)}</p>` : ""}</div>${figures.join("")}</section>`);
  }
  const recap = records.nodes.map(node => `<li><strong>${escape(node.choice)}</strong>${node.instruction ? `<p class="twist">${escape(node.instruction)}</p>` : ""}</li>`).join("");
  const title = escape(records.bible.title);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CONTENT_POLICY}"><meta name="referrer" content="no-referrer"><title>${title} — Lunatoon</title><style>${STYLE}</style></head><body><main><header><p class="brand">Lunatoon</p><h1>${title}</h1>${template ? `<p>${escape(template.genre)}</p><p>${escape(template.description)}</p>` : ""}</header><section aria-label="Story opening">${openingFigures.join("")}</section>${chapters.join("")}<section class="ending" aria-label="Story ending"><p class="label">THE END</p><h2>A story only you could tell.</h2><ol aria-label="Your choices">${recap}</ol><p class="note">A completed story exported from Lunatoon. This file can be read offline; it contains no interactive generation.</p></section></main></body></html>`;
  const slug = records.bible.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "story";
  return { html, filename: `${slug}-lunatoon.html` };
}
