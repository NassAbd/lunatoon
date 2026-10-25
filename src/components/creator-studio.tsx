"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CreatorSnapshotSchema, type CreatorSnapshot, type FoundationPrompt } from "@/lib/creator/contracts";
import type { StoryFoundation, VisualReference } from "@/lib/story-engine/contracts";
import { FoundationEditor } from "./foundation-editor";
import { LibraryLaunch } from "./library-launch";
import { CreatorOpening } from "./creator-opening";
import type { OpeningPanel } from "@/lib/creator/opening-contracts";
import { consumeIllustrationResponse } from "@/lib/image-stream-client";
import { useRouter } from "next/navigation";

const emptyPrompt: FoundationPrompt = { prompt: "", title: "", genre: "", main_character: "", visual_style: "", atmosphere: "" };
async function snapshotRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const value: unknown = await response.json();
  if (!response.ok) {
    const detail = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string" ? detail.message : "This step could not be saved. Please check your local server.");
  }
  return CreatorSnapshotSchema.parse(value);
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const money = (micro: number) => `$${(micro / 1e6).toFixed(5)}`;

export function CreatorStudio({ initial, referenceSupported }: { initial: CreatorSnapshot | null; referenceSupported: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [input, setInput] = useState<FoundationPrompt>(initial?.draft.last_input ?? emptyPrompt);
  const [foundation, setFoundation] = useState<StoryFoundation | null>(initial?.draft.foundation ?? null);
  const [visualReferences, setVisualReferences] = useState<VisualReference[]>(initial?.draft.visual_references ?? []);
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState(initial?.draft.foundation && !initial.latest_template ? "Draft saved. No illustrations were requested." : ""); const [previews, setPreviews] = useState<Record<string, string>>({});
  const openingOperations = useRef(new Map<string, string>()); const openingLock = useRef(false);
  const readQueue = useRef<Promise<unknown>>(Promise.resolve()); const openingVersion = useRef(initial?.opening?.version);
  const draft = useRef(initial?.draft.id); const creating = useRef<Promise<string> | null>(null);
  const createOperation = useRef<string | null>(null);
  const generateOperation = useRef<{ fingerprint: string; id: string } | null>(null);
  const saveOperation = useRef<{ fingerprint: string; id: string } | null>(null);
  const last = snapshot?.attempts.at(-1);
  const active = last?.status === "running";
  const failed = last?.status === "failed" || last?.status === "interrupted";
  const uncertain = Boolean(failed && last?.estimated_micro_usd == null);
  const refs = snapshot?.assets.filter(asset => snapshot.draft.reference_asset_ids.includes(asset.id)) ?? [];
  const mainReference = refs.findIndex(asset => visualReferences.some(reference => reference.asset_id === asset.id && reference.role === "protagonist"));
  const adopt = (next: CreatorSnapshot, replace = false) => {
    setSnapshot(next); draft.current = next.draft.id;
    openingVersion.current = next.opening?.version;
    if (replace) setFoundation(next.draft.foundation);
  };
  function clearPreview(id: string) { setPreviews(current => { const copy = { ...current }; delete copy[id]; return copy; }); }
  function setReferenceRole(id: string, role: VisualReference["role"]) {
    setVisualReferences(current => refs.map(asset => {
      const previous = current.find(reference => reference.asset_id === asset.id)?.role ?? "unspecified";
      return { asset_id: asset.id, role: asset.id === id ? role : role === "protagonist" && previous === "protagonist" ? "unspecified" : previous };
    }));
  }
  function readSaved() {
    const id = draft.current;
    const next = readQueue.current.catch(() => undefined).then(async () => {
      if (!id) throw new Error("Save a draft before checking its illustrations.");
      const saved = await snapshotRequest(`/api/creator/drafts/${id}`); adopt(saved); return saved;
    });
    readQueue.current = next; return next;
  }
  const openingRunning = busy === "illustrating" || snapshot?.opening?.panels.some(panel => panel.status === "running");
  useEffect(() => {
    if (!openingRunning) return;
    const timer = window.setInterval(() => { void readSaved().catch(() => setError("Saved illustration status could not be checked. Refresh to check it before explicitly retrying.")); }, 1200);
    return () => window.clearInterval(timer);
    // This effect only reads durable status. It never schedules paid work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingRunning]);
  async function illustrate(saved: CreatorSnapshot, panels: OpeningPanel[], retry = false, acknowledgeUnknown = false) {
    if (!saved.opening || openingLock.current || !panels.length) return;
    openingLock.current = true; setBusy("illustrating"); setError("");
    const version = saved.opening.version;
    try {
      await Promise.all(panels.map(async panel => {
        const previous = saved.opening!.attempts.filter(attempt => attempt.panel_id === panel.id).at(-1);
        const key = `${version}:${panel.id}:${retry ? previous?.id ?? "retry" : "initial"}`;
        let operation = openingOperations.current.get(key);
        if (!operation) { operation = crypto.randomUUID(); openingOperations.current.set(key, operation); }
        clearPreview(panel.id);
        try {
          const response = await fetch(`/api/creator/drafts/${saved.draft.id}/opening/${version}/${panel.id}/image`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ operation_id: operation, retry, acknowledge_unknown: acknowledgeUnknown }) });
          const settled = await consumeIllustrationResponse(response, event => {
            if (event.panel_id !== panel.id) throw new Error("The illustration preview did not match this saved opening scene.");
            if (openingVersion.current === version) setPreviews(current => ({ ...current, [panel.id]: event.image_url }));
          }, CreatorSnapshotSchema);
          if (settled.opening?.panels.find(item => item.id === panel.id)?.status !== "complete") clearPreview(panel.id);
        } catch (error) { clearPreview(panel.id); setError(error instanceof Error ? error.message : "This illustration connection was interrupted. Check saved status before retrying."); }
        finally {
          // Serialized authoritative reads avoid rolling back a faster sibling.
          await readSaved().catch(() => setError("Saved status could not be checked. Refresh before explicitly retrying."));
        }
      }));
    } finally { openingLock.current = false; setBusy(""); router.refresh(); }
  }
  async function ensureDraft() {
    if (draft.current) return draft.current;
    if (!creating.current) {
      createOperation.current ??= crypto.randomUUID();
      creating.current = snapshotRequest("/api/creator/drafts", json({ operation_id: createOperation.current })).then(next => {
        adopt(next); window.history.replaceState(null, "", `/studio?draft=${next.draft.id}`); return next.draft.id;
      }).catch(error => { creating.current = null; throw error; });
    }
    return creating.current;
  }
  async function generate(retry = false) {
    setBusy("writing"); setError("");
    try {
      const id = await ensureDraft(); const fingerprint = JSON.stringify(input);
      if (retry || generateOperation.current?.fingerprint !== fingerprint) generateOperation.current = { fingerprint, id: crypto.randomUUID() };
      const next = await snapshotRequest(`/api/creator/drafts/${id}/generate`, json({ ...input, operation_id: generateOperation.current!.id, ...(retry && last ? { retry_of: last.id, acknowledge_unknown: acknowledged } : {}) }));
      adopt(next, true); setAcknowledged(false);
      if (next.attempts.at(-1)?.status === "succeeded") generateOperation.current = null;
    } catch (error) {
      setError(error instanceof Error ? error.message : "The foundation could not be created.");
      // Read the durable result after a lost response. Never resubmit paid work here.
      if (draft.current) try {
        const recovered = await snapshotRequest(`/api/creator/drafts/${draft.current}`);
        const saved = recovered.attempts.find(attempt => attempt.operation_id === generateOperation.current?.id && attempt.status === "succeeded");
        adopt(recovered, Boolean(saved) || !foundation);
        if (saved) { generateOperation.current = null; setError(""); setAcknowledged(false); }
      } catch { /* Keep the explicit refresh action. */ }
    } finally { setBusy(""); }
  }
  async function refresh() {
    if (!draft.current) return;
    setBusy("checking"); setError("");
    try {
      const recovered = await snapshotRequest(`/api/creator/drafts/${draft.current}`);
      const saved = recovered.attempts.find(attempt => attempt.operation_id === generateOperation.current?.id && attempt.status === "succeeded");
      adopt(recovered, Boolean(saved) || !foundation);
      if (saved) generateOperation.current = null;
    }
    catch (error) { setError(error instanceof Error ? error.message : "The saved draft is unavailable."); }
    finally { setBusy(""); }
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length + refs.length > 3) { setError("Choose up to three reference images in total. Remove one before replacing it."); return; }
    if ([...files].some(file => file.size > 5 * 1024 * 1024)) { setError("Each reference image must be 5 MiB or smaller."); return; }
    setBusy("uploading"); setError("");
    try {
      const id = await ensureDraft();
      for (const file of files) {
        const form = new FormData(); form.set("file", file); form.set("purpose", "Character, world or style reference supplied by the creator");
        adopt(await snapshotRequest(`/api/creator/drafts/${id}/references`, { method: "POST", body: form }));
      }
    } catch (error) { setError(error instanceof Error ? error.message : "This reference image could not be saved."); }
    finally { setBusy(""); }
  }
  async function remove(id: string) {
    if (!draft.current) return;
    setBusy("removing"); setError("");
    try { adopt(await snapshotRequest(`/api/creator/drafts/${draft.current}/references/${id}`, { method: "DELETE" })); setVisualReferences(current => current.filter(reference => reference.asset_id !== id)); }
    catch (error) { setError(error instanceof Error ? error.message : "This reference could not be removed."); }
    finally { setBusy(""); }
  }
  async function save(mode: "draft" | "illustrate") {
    if (!foundation) return;
    setBusy("saving"); setError(""); setNotice("");
    try {
      const id = await ensureDraft(); const body = { foundation, reference_asset_ids: refs.map(ref => ref.id), visual_references: refs.map(ref => ({ asset_id: ref.id, role: visualReferences.find(reference => reference.asset_id === ref.id)?.role ?? "unspecified" })), mode };
      const fingerprint = JSON.stringify(body);
      if (saveOperation.current?.fingerprint !== fingerprint) saveOperation.current = { fingerprint, id: crypto.randomUUID() };
      const saved = await snapshotRequest(`/api/creator/drafts/${id}/save`, json({ ...body, operation_id: saveOperation.current.id }));
      adopt(saved, true); setVisualReferences(saved.draft.visual_references ?? []);
      if (mode === "draft") { setNotice("Draft saved. No illustrations were requested."); router.refresh(); }
      else { setPreviews({}); await illustrate(saved, saved.opening?.panels.filter(panel => panel.status === "pending") ?? []); }
    } catch (error) { setError(error instanceof Error ? error.message : "The story needs a little more work before saving."); }
    finally { setBusy(""); }
  }
  const disabled = Boolean(busy) || active || Boolean(openingRunning);
  const attemptLimit = Boolean(snapshot && snapshot.summary.calls >= snapshot.draft.limits.max_calls);
  return <div className="studio-workspace">
    <div className="studio-steps" aria-label="Creation steps"><span>01 Describe</span><span>02 Edit</span><span>03 Save</span><span>04 Illustrate</span><span>05 Play</span></div>
    <div className="studio-create-grid">
      <section className="studio-card" aria-labelledby="describe-heading"><p className="book-eyebrow">START WITH A SPARK</p><h2 id="describe-heading">What world is waiting?</h2>
        <label className="studio-field"><span id="story-description-label">Describe your story</span><textarea aria-labelledby="story-description-label" rows={6} minLength={20} maxLength={4000} value={input.prompt} disabled={disabled} placeholder="A young cartographer discovers that the stars are disappearing. Her oldest map holds a light that refuses to go out…" onChange={event => setInput({ ...input, prompt: event.target.value })} /></label>
        <details className="studio-config"><summary>Shape the details</summary><div className="studio-grid">{([['title', 'Title (optional)'], ['genre', 'Genre (optional)'], ['main_character', 'Main character (optional)'], ['visual_style', 'Visual style (optional)'], ['atmosphere', 'Atmosphere (optional)']] as const).map(([key, label]) => <label className="studio-field" key={key}>{label}<input maxLength={300} value={input[key]} disabled={disabled} onChange={event => setInput({ ...input, [key]: event.target.value })} /></label>)}</div></details>
        <div className="studio-generation"><button className="book-primary" disabled={disabled || input.prompt.trim().length < 20 || failed || attemptLimit} onClick={() => void generate()}>{busy === "writing" ? "Writing your story foundation…" : "Create story foundation"}</button><p className="studio-muted">One narrative request. No illustrations are generated here. Review and edit the result before saving.</p></div>
        {failed && <div className="studio-recovery" role="status"><strong>This foundation needs another attempt.</strong><p>{last?.error?.message ?? "The request did not finish. Its cost may be unknown."}</p>{uncertain && <label className="studio-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I understand the earlier request may have been charged.</label>}<button className="book-secondary" disabled={Boolean(busy) || attemptLimit || uncertain && !acknowledged} onClick={() => void generate(true)}>Retry foundation generation</button></div>}
        {(active || busy === "writing") && <p className="studio-muted" role="status">Your foundation is being written. This page can check its saved result without starting another request.</p>}
        {snapshot && <button type="button" className="studio-text-button" disabled={Boolean(busy)} onClick={() => void refresh()}>Check saved result</button>}
        {attemptLimit && <p className="studio-muted">This draft has reached its {snapshot?.draft.limits.max_calls}-request limit. You can still edit and save an existing foundation.</p>}
      </section>
      <aside className="studio-card studio-references" aria-labelledby="references-heading"><p className="book-eyebrow">GIVE IT A VISUAL DIRECTION</p><h2 id="references-heading">A face. A place. A feeling.</h2><p className="studio-muted">Add up to three images of your own: a character, a setting, or a style you want to explore. References guide illustrations, but don’t guarantee an exact match.</p>
        <div className="studio-reference-grid">{refs.map((ref, index) => <figure className="studio-reference" data-reference-id={ref.id} key={ref.id}>
          {/* Private local images are normalized and served through draft ownership checks. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/creator/drafts/${ref.draft_id}/references/${ref.id}`} alt={`Reference ${index + 1}`} width={ref.width} height={ref.height} /><figcaption><span>Reference {index + 1}</span><label className="studio-reference-role">Use for<select aria-label={`Use Reference ${index + 1} for`} value={visualReferences.find(reference => reference.asset_id === ref.id)?.role ?? "unspecified"} disabled={disabled} onChange={event => setReferenceRole(ref.id, event.target.value as VisualReference["role"])}><option value="unspecified">Unspecified</option><option value="protagonist">Main character</option><option value="character">Other character</option><option value="environment">Setting</option><option value="style">Style</option></select></label><button disabled={disabled} onClick={() => void remove(ref.id)} aria-label={`Remove reference ${index + 1}`}>Remove</button></figcaption>
        </figure>)}</div>
        <label className={`studio-upload ${disabled || refs.length >= 3 ? "is-disabled" : ""}`}>Add reference images<input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={disabled || refs.length >= 3} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} /></label>
        {busy === "uploading" && <p className="studio-muted" role="status">Checking and saving your reference images…</p>}
        <p className="studio-muted">PNG, JPEG or WebP · 5 MiB each · up to 4096 px per edge / 16 megapixels · still images only. Stored privately on this local installation.</p>
        <p className="studio-reference-note">{refs.length ? `${refs.length} of 3 references attached. These guide the opening and later illustrations; they do not determine the number of scenes. Reference editing adds image-input usage.` : "No references? Your story will use its written visual guide in text-only illustration mode."}</p>
        {refs.length > 0 && <p className="studio-muted">{mainReference >= 0 ? `Reference ${mainReference + 1} is the main character's visual guide. It will be used first for identity. Selecting another main character replaces this designation.` : "No main-character reference selected. The written character description guides identity; uploaded images keep their chosen purposes."} Save your draft to keep these choices. Save &amp; Illustrate applies them to a new version. Existing readings keep their saved references.</p>}
      </aside>
    </div>
    {error && <p className="studio-alert" role="alert">{error}</p>}
    {notice && <p className="studio-saved-notice" role="status">{notice}</p>}
    {foundation && <section className="studio-card studio-preview" aria-labelledby="preview-heading"><div className="studio-preview-header"><div><p className="book-eyebrow">YOUR STORY FOUNDATION</p><h2 id="preview-heading">Make it your own</h2><p className="studio-muted">Edit the details, then save a local version. Existing reading sessions always keep the version they began with.</p></div><span className="studio-status">Draft</span></div>
      <div className="studio-cover-placeholder" aria-label="Decorative cover placeholder"><span aria-hidden="true">☾</span><div><p className="book-eyebrow">YOUR ORIGINAL WORLD</p><h3>{foundation.title}</h3><p>Draft cover · your opening illustrations are created after you save</p></div></div>
      <FoundationEditor foundation={foundation} onChange={setFoundation} disabled={disabled} />
      <div className="studio-save"><div className="studio-save-actions"><button type="button" className="book-secondary" disabled={disabled} onClick={() => void save("draft")}>Save draft</button><button type="button" className="book-primary" disabled={disabled} onClick={() => void save("illustrate")}>{busy === "saving" ? "Saving your story…" : "Save & Illustrate"}</button></div><p className="studio-muted">Save draft makes no AI calls. Save & Illustrate saves a version and requests up to {foundation.opening_beats.length} opening illustrations using your saved visual guide{refs.length ? ` and ${refs.length} ${refs.length === 1 ? "reference" : "references"}` : ""}. Image generation may incur API charges. Unchanged completed artwork can be reused.</p></div>
    </section>}
    {snapshot?.opening && <CreatorOpening key={`${snapshot.opening.template_id}:${snapshot.opening.version}`} snapshot={snapshot} busy={busy === "illustrating"} referenceSupported={referenceSupported} previews={previews} onRetry={(panel, acknowledged) => void illustrate(snapshot, [panel], true, acknowledged)} onStart={() => void illustrate(snapshot, snapshot.opening!.panels.filter(panel => panel.status === "pending"))} onVisible={clearPreview} />}
    {snapshot?.latest_template?.status === "ready" && !snapshot.opening && <section className="studio-card studio-ready" aria-labelledby="ready-heading"><div><p className="book-eyebrow">SAVED ON THIS INSTALLATION · VERSION {snapshot.latest_template.version}</p><h2 id="ready-heading">Ready to play</h2><h3>{snapshot.latest_template.title}</h3><p className="studio-muted">This earlier saved version retains its original opening artwork. Save & Illustrate to create an illustrated new version.</p><Link href="/#creator-stories">View in the library →</Link></div><LibraryLaunch key={`${snapshot.latest_template.id}:${snapshot.latest_template.version}`} template={snapshot.latest_template} referenceSupported={referenceSupported} label="Play your story" /></section>}
    {snapshot && <details className="book-developer studio-diagnostics"><summary>Developer details</summary><div className="book-details-body"><p>Foundation generation: {snapshot.summary.calls}/{snapshot.draft.limits.max_calls} calls · estimated spend {money(snapshot.summary.estimated_micro_usd)} · planning amount held {money(snapshot.summary.held_micro_usd)} · draft budget {money(snapshot.draft.limits.budget_usd * 1e6)}.</p><p>Measured tokens: {snapshot.summary.measured_input_tokens} input / {snapshot.summary.measured_output_tokens} output. Unknown-cost attempts: {snapshot.summary.unknown_cost_attempts}. Unpriced attempts: {snapshot.summary.unpriced_attempts}. These estimates are not a provider billing cap. Reading uses separate per-run limits.</p><p>Model: {snapshot.draft.model}. No automatic paid retries. Uploads are sent only during an explicit opening or reader image-edit request.</p><ul>{snapshot.attempts.map(attempt => <li key={attempt.id}>{attempt.status} · {attempt.metrics?.duration_ms ?? "unknown"} ms · {attempt.metrics?.request_id ?? "No provider request ID"}{attempt.error ? ` · ${attempt.error.code}` : ""}</li>)}</ul></div></details>}
  </div>;
}
