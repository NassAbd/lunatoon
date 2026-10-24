"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CHOICES, type ComicPanel, type ImageApproach } from "@/lib/contracts";
import { SnapshotSchema, type Panel, type Snapshot } from "@/lib/story-engine/contracts";
import { isReferenceModelSupported } from "@/lib/art-direction";
import { yieldForTextPaint } from "@/lib/presentation";
import { ComicPanelCard } from "./comic-panel";
import { Icon } from "./icon";

const usd = (micro: number) => `$${(micro / 1e6).toFixed(6)}`;
const seconds = (ms: number | null | undefined) => ms == null ? "—" : `${(ms / 1000).toFixed(3)}s`;
type Observation = { node_id: string; browser_text_ready_ms: number | null; image_request_ms: Record<string, number>; browser_total_ms: number | null };
async function requestSnapshot(url: string, body?: unknown): Promise<Snapshot> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json: unknown = await response.json();
  if (!response.ok) {
    const message = typeof json === "object" && json && "error" in json && typeof json.error === "object" && json.error && "message" in json.error && typeof json.error.message === "string" ? json.error.message : "The saved story request failed.";
    throw new Error(message);
  }
  return SnapshotSchema.parse(json);
}
export function SavedReader({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initial); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [error, setError] = useState(""); const [choice, setChoice] = useState(""); const [instruction, setInstruction] = useState("");
  const [approach, setApproach] = useState<ImageApproach>(initial.run.approach); const [observation, setObservation] = useState<Observation | null>(null);
  const operations = useRef(new Map<string, string>()); const readQueue = useRef<Promise<unknown>>(Promise.resolve());
  const base = `/api/runs/${initial.run.id}`;
  const operation = (key: string) => { let id = operations.current.get(key); if (!id) { id = crypto.randomUUID(); operations.current.set(key, id); } return id; };
  function refresh() {
    // Serialize read responses so concurrent image completions cannot roll the UI back.
    const next = readQueue.current.catch(() => undefined).then(async () => { const saved = await requestSnapshot(base); setSnapshot(saved); return saved; });
    readQueue.current = next; return next;
  }
  const running = snapshot.events.some(event => event.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { void refresh().catch(() => setError("Could not refresh saved status. Reload this URL to recover.")); }, 1200);
    return () => window.clearInterval(timer);
    // Reads only; a refresh never schedules or retries paid generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, base]);
  async function work(action: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Request interrupted. Reload saved status before retrying."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function images(panels: Panel[], observed?: Observation) {
    await Promise.all(panels.map(async panel => {
      const started = performance.now();
      try { await requestSnapshot(`${base}/panels/${panel.id}/image`, { operation_id: panel.operation_id, retry: false }); }
      catch (error) { setError(error instanceof Error ? error.message : "Image request interrupted. Reload saved status."); }
      finally {
        if (observed) { observed.image_request_ms[panel.id] = performance.now() - started; setObservation({ ...observed, image_request_ms: { ...observed.image_request_ms } }); }
        await refresh();
      }
    }));
  }
  async function writeChapter(retryNode?: string) {
    await work(async () => {
      const started = performance.now(); const key = retryNode ? `script:${retryNode}:${snapshot.events.filter(e => e.node_id === retryNode && e.stage === "script").at(-1)?.operation_id}` : `decision:${snapshot.run.step}:${choice}:${instruction}`;
      const saved = await requestSnapshot(retryNode ? `${base}/nodes/${retryNode}/script` : `${base}/nodes`, retryNode ? { operation_id: operation(key), retry: true } : { operation_id: operation(key), choice_id: choice, instruction });
      flushSync(() => setSnapshot(saved));
      const node = saved.nodes.at(-1)!;
      if (!node.chapter) return;
      await yieldForTextPaint();
      const observed: Observation = { node_id: node.id, browser_text_ready_ms: performance.now() - started, image_request_ms: {}, browser_total_ms: null };
      setObservation(observed);
      await images(saved.panels.filter(p => p.node_id === node.id && p.status === "pending"), observed);
      observed.browser_total_ms = performance.now() - started; setObservation({ ...observed }); setChoice(""); setInstruction("");
    });
  }
  const latest = snapshot.nodes.at(-1);
  const options = latest?.chapter?.next_decision.options ?? ["activate", "destroy", "investigate"].map((id, i) => ({ id, label: CHOICES[i] }));
  const pending = snapshot.panels.filter(p => p.status === "pending");
  const canDecide = !busy && !running && !pending.length && (!latest || Boolean(latest.chapter)) && snapshot.run.status !== "ended";
  function panelView(panel: Panel): ComicPanel {
    return { ...panel.script, image_url: panel.status === "complete" && panel.image_path ? `${base}/assets/${panel.id}?v=${panel.operation_id}` : undefined, status: panel.status === "complete" ? "complete" : "loading_image", error: panel.error?.message, metrics: panel.metrics ?? undefined };
  }
  function download() {
    const link = document.createElement("a"); const url = URL.createObjectURL(new Blob([JSON.stringify({ ...snapshot, browser_observation_this_visit: observation }, null, 2)], { type: "application/json" })); link.href = url; link.download = `lunatoon-${snapshot.run.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="app-shell saved-reader">
    <header className="site-header"><Link className="wordmark" href="/">lunatoon<span className="wordmark-dot">.</span></Link><span className="header-caption">NEON PROTOCOL · SAVED LOCALLY</span><div className="header-right"><span className="poc-tag">EXPERIMENT 003</span><Link href="/">POC 02 reader</Link></div></header>
    <main className="workspace">
      <aside className="director-column">
        <div className="eyebrow">TWO DECISIONS. YOUR STORY.</div><h1>Neon<br /><em>Protocol</em>.</h1>
        <p className="story-logline">The city remembers.<br />So does your story.</p>
        <p className="saved-run-id">Local run <code>{snapshot.run.id}</code></p><p className="approach-note">Bookmark this URL to resume. Saved dialogue, illustrations and reference artwork survive refresh and app restart.</p>
        <p className="section-label">DECISION {Math.min(snapshot.run.step + 1, snapshot.run.limits.max_steps)} / {snapshot.run.limits.max_steps} · {snapshot.run.approach === "reference" ? "B / REFERENCE EDIT" : "A / TEXT ONLY"}</p>
        {snapshot.run.status !== "ended" && <form onSubmit={event => { event.preventDefault(); void writeChapter(); }}>
          <p className="saved-question">{latest?.chapter?.next_decision.question || "What does Kael do with the device?"}</p>
          <fieldset disabled={!canDecide} className="choice-group"><legend className="sr-only">Next decision</legend>{options.map(option => <label key={option.id} className={`choice-card ${choice === option.id ? "selected" : ""}`}><input type="radio" name="saved-choice" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span className="choice-copy"><strong>{option.label}</strong></span><span className="radio-visual">{choice === option.id && <span />}</span></label>)}</fieldset>
          <div className="twist-heading"><label className="section-label" htmlFor="saved-twist">YOUR TWIST</label><span>OPTIONAL</span></div><textarea id="saved-twist" value={instruction} onChange={e => setInstruction(e.target.value)} maxLength={500} disabled={!canDecide} placeholder="A mysterious cyborg cat suddenly appears." />
          <button className="generate-button" disabled={!canDecide || !choice} type="submit">{busy ? "Creating the next beat…" : "Generate saved continuation"}</button><p className="approach-note">One narrative request + two independent image requests. No automatic paid retries.</p>
        </form>}
        {busy && <p role="status" className="saved-feedback">{snapshot.panels.some(p => p.status === "pending" || p.status === "running") ? "Dialogue saved. Illustrating each panel…" : "Writing the next beat. Your saved story is safe…"}</p>}
        {running && !busy && <p role="status">A request is still running. Reading saved status; no new generation calls.</p>}
        {latest?.status === "script_pending" && <button className="generate-button" disabled={busy || running} onClick={() => void work(async () => { const saved = await requestSnapshot(`${base}/nodes/${latest.id}/script`, { operation_id: latest.operation_id, retry: false }); flushSync(() => setSnapshot(saved)); await yieldForTextPaint(); await images(saved.panels.filter(p => p.node_id === latest.id && p.status === "pending")); })}>Resume reserved narrative request</button>}
        {latest?.status === "script_failed" && <div><p role="alert">{latest.error?.message}</p><button className="generate-button" disabled={busy || running} onClick={() => void writeChapter(latest.id)}>Retry narrative · paid call + reserve two images</button></div>}
        {pending.length > 0 && !busy && <button className="generate-button" disabled={running} onClick={() => void work(async () => { await images(pending); })}>Generate {pending.length} reserved {pending.length === 1 ? "image" : "images"}</button>}
        {error && <p className="panel-error" role="alert">{error}</p>}
        <details className="saved-memory"><summary>Saved narrative & visual memory</summary><ul>{snapshot.run.state.facts.map(f => <li key={f.id}>{f.text}</li>)}</ul>{snapshot.run.state.characters.map(c => <p key={c.id}><strong>{c.name}</strong>: {c.clothing_condition}. {c.injuries.join("; ") || "No recorded injuries."}</p>)}</details>
        <button className="saved-secondary" disabled={busy} onClick={() => void work(async () => { await refresh(); })}>Reload saved status · no AI calls</button>
      </aside>
      <section className="reader-column">
        <div className="reader-toolbar"><span><Icon name="moon" size={16} /> NEON PROTOCOL</span><span>{snapshot.run.status === "ended" ? "FINAL CHAPTER" : "YOUR SAVED STORY"}</span></div>
        <div className="comic-scroll">
          <div className="scene-label"><span>OPENING · NEW KYOTO, 2089</span><span>FIXED PANEL</span></div>
          {/* Original owned SVG, served from this run's immutable snapshot. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="saved-opening" src={`${base}/assets/opening`} alt="Kael in his yellow coat at an abandoned neon-lit transit station" />
          <p className="branch-caption">{snapshot.bible.opening}</p>
          {snapshot.nodes.map(node => <section key={node.id} aria-label={`Chapter ${node.step}`}><div className="scene-label continuation-label"><span>CHAPTER {node.step} · {node.chapter?.is_ending ? "ENDING" : node.status.replaceAll("_", " ")}</span><span>{snapshot.panels.filter(p => p.node_id === node.id && p.status === "complete").length} / 2 ILLUSTRATED</span></div><p className="branch-caption">{node.choice}{node.instruction && ` · ${node.instruction}`}</p>{node.chapter && <p className="saved-consequence">{node.chapter.event.action} {node.chapter.event.consequence}</p>}
            {snapshot.panels.filter(p => p.node_id === node.id).map(panel => <div key={panel.id}><ComicPanelCard panel={panelView(panel)} />{panel.status === "failed" && <button className="saved-secondary" disabled={busy || running} onClick={() => void work(async () => { await requestSnapshot(`${base}/panels/${panel.id}/image`, { operation_id: operation(`retry:${panel.id}:${panel.operation_id}`), retry: true }); await refresh(); })}>Retry panel {panel.sequence} image · one paid call</button>}</div>)}
          </section>)}
          {snapshot.run.status === "ended" && <div className="end-marker"><Icon name="check" size={16} /><span>THE END · YOUR STORY IS SAVED.</span></div>}
        </div>
        <details className="diagnostics saved-diagnostics" open><summary>Run cost & latency diagnostics</summary>
          <p>Measured usage returned: {snapshot.summary.measured_input_tokens} input / {snapshot.summary.measured_output_tokens} output tokens. Reference input: {snapshot.summary.measured_reference_input_tokens} image tokens.</p>
          <p>Estimated spend from verified usage: <strong>{usd(snapshot.summary.estimated_micro_usd)}</strong> · including {usd(snapshot.summary.reference_input_micro_usd)} reference input. Unknown-cost attempts: {snapshot.summary.unknown_cost_attempts}. Unpriced reservations: {snapshot.summary.unpriced_reservations}.</p>
          <p>Planning amount held: {usd(snapshot.summary.held_micro_usd)}. Estimated budget: {usd(snapshot.run.limits.budget_usd * 1e6)}. This application guard is not a provider billing cap.</p>
          <p>Image calls: {snapshot.summary.image_calls} attempted + {snapshot.summary.image_slots_reserved} reserved / {snapshot.run.limits.max_image_calls}. Narrative: {snapshot.summary.script_calls} attempted + {snapshot.summary.script_slots_reserved} reserved / {snapshot.run.limits.max_script_calls}.</p>
          <p>{snapshot.run.models.story} · {snapshot.run.models.image} · {snapshot.run.models.quality}</p>
          {observation ? <p>Browser observation this visit: text ready {seconds(observation.browser_text_ready_ms)} · total request flow {seconds(observation.browser_total_ms)}. {Object.entries(observation.image_request_ms).map(([id, ms]) => <span key={id}>Image {snapshot.panels.find(p => p.id === id)?.sequence}: {seconds(ms)}. </span>)}</p> : <p>Reloaded saved data. No new browser text-ready measurement and no generation calls from loading this page.</p>}
          {snapshot.nodes.map(n => <p key={n.id}>Chapter {n.step}: server narrative {seconds(n.metrics?.duration_ms)} · durable elapsed {seconds(n.completed_at == null ? null : n.completed_at - n.created_at)} (includes browser scheduling or recovery waits) · saved script {n.script_ready_at ? new Date(n.script_ready_at).toISOString() : "pending"}. {snapshot.panels.filter(p => p.node_id === n.id).map(p => <span key={p.id}>Image {p.sequence}: {seconds(p.metrics?.duration_ms)}. </span>)}</p>)}
          <details><summary>Request accounting details</summary><ul>{snapshot.events.map(e => <li key={e.id}>{e.stage} {e.sequence || ""} · {e.status} · {e.approach} · {e.model}/{e.quality} · {e.metrics?.request_id || "no request ID"} · cost {e.estimated_micro_usd == null ? "unknown / not yet measured" : `${usd(e.estimated_micro_usd)} estimated`} · price {e.price_version || "unverified"}</li>)}</ul></details>
          <button className="saved-secondary" onClick={download}>Download run diagnostics</button>
        </details>
        {latest?.status === "complete" && !busy && <details className="saved-replay"><summary>Compare image modes using this saved script</summary><p>Explicit replay replaces the displayed pair, retains earlier local assets, and consumes two additional paid image calls. No narrative call or state change. Budget and call limits still apply.</p><label htmlFor="replay-mode">Replay image approach</label><select id="replay-mode" value={approach} onChange={e => setApproach(e.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!isReferenceModelSupported(snapshot.run.models.image)}>B · Reference edit</option></select><button className="saved-secondary" disabled={running} onClick={() => void work(async () => { const saved = await requestSnapshot(`${base}/nodes/${latest.id}/replay`, { operation_id: operation(`replay:${latest.id}:${snapshot.events.length}:${approach}`), approach }); flushSync(() => setSnapshot(saved)); await yieldForTextPaint(); await images(saved.panels.filter(p => p.node_id === latest.id && p.status === "pending")); })}>Replay saved script · two paid image calls</button></details>}
      </section>
    </main>
  </div>;
}
