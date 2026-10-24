"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CHOICES, type ComicPanel, type ImageApproach } from "@/lib/contracts";
import { SnapshotSchema, type Panel, type Snapshot } from "@/lib/story-engine/contracts";
import { isReferenceModelSupported } from "@/lib/art-direction";
import { yieldForTextPaint } from "@/lib/presentation";
import { ComicPanelCard } from "./comic-panel";
import { StoryHeader, StoryOpening } from "./story-book";
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
      setObservation(null);
      const started = performance.now(); const key = retryNode ? `script:${retryNode}:${snapshot.events.filter(e => e.node_id === retryNode && e.stage === "script").at(-1)?.operation_id}` : `decision:${snapshot.run.step}:${choice}:${instruction}`;
      const saved = await requestSnapshot(retryNode ? `${base}/nodes/${retryNode}/script` : `${base}/nodes`, retryNode ? { operation_id: operation(key), retry: true } : { operation_id: operation(key), choice_id: choice, instruction });
      flushSync(() => setSnapshot(saved));
      const node = saved.nodes.at(-1)!;
      if (!node.chapter) return;
      await yieldForTextPaint();
      document.getElementById(`chapter-${node.id}`)?.scrollIntoView({ block: "start" });
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
  const developerDetails = (
    <details className="book-developer"><summary>Developer details</summary><div className="book-details-body">
          <p>Measured usage returned: {snapshot.summary.measured_input_tokens} input / {snapshot.summary.measured_output_tokens} output tokens. Reference input: {snapshot.summary.measured_reference_input_tokens} image tokens.</p>
          <p>Estimated spend from verified usage: <strong>{usd(snapshot.summary.estimated_micro_usd)}</strong> · including {usd(snapshot.summary.reference_input_micro_usd)} reference input. Unknown-cost attempts: {snapshot.summary.unknown_cost_attempts}. Unpriced reservations: {snapshot.summary.unpriced_reservations}.</p>
          <p>Planning amount held: {usd(snapshot.summary.held_micro_usd)}. Estimated budget: {usd(snapshot.run.limits.budget_usd * 1e6)}. This application guard is not a provider billing cap.</p>
          <p>Image calls: {snapshot.summary.image_calls} attempted + {snapshot.summary.image_slots_reserved} reserved / {snapshot.run.limits.max_image_calls}. Narrative: {snapshot.summary.script_calls} attempted + {snapshot.summary.script_slots_reserved} reserved / {snapshot.run.limits.max_script_calls}.</p>
          <p>{snapshot.run.models.story} · {snapshot.run.models.image} · {snapshot.run.models.quality}</p>
          {observation ? <p>Browser observation this visit: text ready {seconds(observation.browser_text_ready_ms)} · total request flow {seconds(observation.browser_total_ms)}. {Object.entries(observation.image_request_ms).map(([id, ms]) => <span key={id}>Image {snapshot.panels.find(p => p.id === id)?.sequence}: {seconds(ms)}. </span>)}</p> : <p>Reloaded saved data. No new browser text-ready measurement and no generation calls from loading this page.</p>}
          {snapshot.nodes.map(n => <p key={n.id}>Chapter {n.step}: server narrative {seconds(n.metrics?.duration_ms)} · durable elapsed {seconds(n.completed_at == null ? null : n.completed_at - n.created_at)} (includes browser scheduling or recovery waits) · saved script {n.script_ready_at ? new Date(n.script_ready_at).toISOString() : "pending"}. {snapshot.panels.filter(p => p.node_id === n.id).map(p => <span key={p.id}>Image {p.sequence}: {seconds(p.metrics?.duration_ms)}. </span>)}</p>)}
          <details><summary>Request accounting details</summary><ul>{snapshot.events.map(e => <li key={e.id}>{e.stage} {e.sequence || ""} · {e.status} · {e.approach} · {e.model}/{e.quality} · {e.metrics?.request_id || "no request ID"} · cost {e.estimated_micro_usd == null ? "unknown / not yet measured" : `${usd(e.estimated_micro_usd)} estimated`} · price {e.price_version || "unverified"}</li>)}</ul></details>
          <button className="saved-secondary" onClick={download}>Download run diagnostics</button>

        {latest?.status === "complete" && !busy && <details className="saved-replay"><summary>Compare image modes using this saved script</summary><p>Explicit replay replaces the displayed pair, retains earlier local assets, and consumes two additional paid image calls. No narrative call or state change. Budget and call limits still apply.</p><label htmlFor="replay-mode">Replay image approach</label><select id="replay-mode" value={approach} onChange={e => setApproach(e.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!isReferenceModelSupported(snapshot.run.models.image)}>B · Reference edit</option></select><button className="saved-secondary" disabled={running} onClick={() => void work(async () => { const saved = await requestSnapshot(`${base}/nodes/${latest.id}/replay`, { operation_id: operation(`replay:${latest.id}:${snapshot.events.length}:${approach}`), approach }); flushSync(() => setSnapshot(saved)); await yieldForTextPaint(); await images(saved.panels.filter(p => p.node_id === latest.id && p.status === "pending")); })}>Replay saved script · two paid image calls</button></details>}
<p>Local run <code>{snapshot.run.id}</code>. Bookmark this URL to resume without generation calls.</p>
<p>State: {latest?.status ?? "not started"}. {latest?.error?.code} {latest?.error?.message}</p>{error && <p>Last request: {error}</p>}
<details><summary>Saved narrative & visual memory</summary><ul>{snapshot.run.state.facts.map(fact => <li key={fact.id}>{fact.text}</li>)}</ul>{snapshot.run.state.characters.map(character => <p key={character.id}><strong>{character.name}</strong>: {character.clothing_condition}. {character.injuries.join("; ") || "No recorded injuries."}</p>)}</details>
<button className="book-secondary" disabled={busy} onClick={() => void work(async () => { await refresh(); })}>Reload saved status · no AI calls</button>
<Link href="/experiment">Open the original experiment</Link></div></details>);
  return <div className="story-reader saved-reader">
    <StoryHeader />
    <main className="book-flow">
      <StoryOpening src={`${base}/assets/opening`} context={snapshot.bible.opening} />
      {snapshot.nodes.map(node => <section id={`chapter-${node.id}`} key={node.id} aria-label={`Chapter ${node.step}`} className="book-chapter">
        {node.chapter && <div className="book-chapter-heading"><span>Chapter {node.step}</span><h2>{node.chapter.is_ending ? "One choice changes everything." : "The story takes a turn."}</h2></div>}
        {snapshot.panels.filter(panel => panel.node_id === node.id).map(panel => <div className="book-panel" key={panel.id}>
          <ComicPanelCard panel={panelView(panel)} reading />
          {panel.status === "failed" && <div className="book-recovery" role="alert"><p>We couldn’t finish this illustration. Your dialogue and the rest of your story are saved.</p><button className="book-secondary" disabled={busy || running} onClick={() => void work(async () => { await requestSnapshot(`${base}/panels/${panel.id}/image`, { operation_id: operation(`retry:${panel.id}:${panel.operation_id}`), retry: true }); await refresh(); })}>Try this illustration again</button><small>Only this illustration will be retried. Another attempt may incur a charge.</small></div>}
        </div>)}
      </section>)}
      {(busy || running) && <div role="status" className="book-feedback"><Icon name="moon" size={20} /><p>{snapshot.panels.some(panel => ["pending", "running"].includes(panel.status)) ? "Your words are here. The illustrations are on their way." : "Writing the next part of your story…"}<span>You can keep reading while we work.</span></p></div>}
      {snapshot.run.status !== "ended" && (!latest || Boolean(latest.chapter)) && <section className="book-decision" aria-label="Your next choice">
        <p className="book-eyebrow">YOUR STORY, YOUR NEXT MOVE</p><h2>{latest?.chapter?.next_decision.question || "What does Kael do with the device?"}</h2>
        <form onSubmit={event => { event.preventDefault(); void writeChapter(); }}>
          <fieldset disabled={!canDecide} className="book-choices"><legend className="sr-only">Next decision</legend>{options.map((option, index) => <label className={`book-choice ${choice === option.id ? "is-selected" : ""}`} key={option.id}>
            <input type="radio" name="saved-choice" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span className="book-choice-number">0{index + 1}</span><span>{option.label}</span><span className="book-radio" aria-hidden="true" />
          </label>)}</fieldset>
          <label className="book-twist-label" htmlFor="saved-twist">Add a little of your imagination <span>Optional</span></label>
          <textarea id="saved-twist" value={instruction} onChange={event => setInstruction(event.target.value)} maxLength={500} disabled={!canDecide} placeholder="Maybe a cyborg cat appears. Or Kael reaches for a hammer…" rows={3} />
          <button className="book-primary" disabled={!canDecide || !choice} type="submit">{busy ? "Continuing your story…" : "Continue the story"}<Icon name="arrow" size={18} /></button>
          <p className="book-saving-note">Your progress is saved here. Come back whenever you like.</p>
        </form>
      </section>}
      {latest?.status === "script_pending" && !busy && <div className="book-recovery"><p>Your last choice is saved. Ready to pick up the story?</p><button className="book-primary" disabled={running} onClick={() => void work(async () => { const saved = await requestSnapshot(`${base}/nodes/${latest.id}/script`, { operation_id: latest.operation_id, retry: false }); flushSync(() => setSnapshot(saved)); await yieldForTextPaint(); await images(saved.panels.filter(panel => panel.node_id === latest.id && panel.status === "pending")); })}>Continue writing</button></div>}
      {latest?.status === "script_failed" && <div className="book-recovery" role="alert"><h2>This part of the story couldn’t be written.</h2><p>Your last choice and earlier story are safe. You can try this part again.</p><p className="book-recovery-choice">{latest.choice}{latest.instruction && ` · ${latest.instruction}`}</p><button className="book-primary" disabled={busy || running} onClick={() => void writeChapter(latest.id)}>Try this part again</button><small>Another attempt may incur a charge. Your spending limits still apply.</small></div>}
      {pending.length > 0 && !busy && <div className="book-recovery"><p>Your words are saved. Let’s bring the remaining illustrations to life.</p><button className="book-primary" disabled={running} onClick={() => void work(async () => { await images(pending); })}>Finish the illustrations</button><small>Only unfinished illustrations will be requested.</small></div>}
      {error && <div className="book-recovery" role="alert"><p>{/limit|budget/i.test(error) ? "This story has reached a generation or spending limit. Your progress is saved; check Developer details for the remaining allowance." : "We couldn’t finish that request. Your saved story is safe. Check its status before trying again."}</p><button className="book-secondary" disabled={busy} onClick={() => void work(async () => { await refresh(); })}>Check saved progress</button></div>}
      {snapshot.run.status === "ended" && <div className="book-ending"><Icon name="moon" size={26} /><p className="book-eyebrow">THE END</p><h2>A story only you could tell.</h2><p>Every choice left its mark.<br />Your story is saved here, whenever you want to return.</p><Link href="/" className="book-secondary">Read a new story<Icon name="arrow" size={16} /></Link></div>}
      {developerDetails}
      <footer className="book-footer">A little moonlight. A different story.</footer>
    </main>
  </div>;
}
