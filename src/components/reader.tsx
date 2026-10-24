"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { CHOICES, INITIAL_CONTEXT, type ComicPanel, type ImageApproach, type Metrics, type StoryRequest, type StoryResponse } from "@/lib/contracts";
import { fetchImage, fetchStory, RequestError } from "@/lib/api-client";
import { runContinuation } from "@/lib/pipeline";
import { ComicPanelCard } from "./comic-panel";
import { Icon } from "./icon";
import { yieldForTextPaint } from "@/lib/presentation";

type Models = { story: string; image: string; quality: string; referenceSupported: boolean };
type Failure = { stage: string; message: string; code: string; duration_ms: number | null; request_id: string | null };
type Run = { started: number; textReady: number | null; total: number | null; settled: number | null; imagePhase: number | null; narrative: Metrics | null; approach: ImageApproach; scriptReused: boolean; failures: Failure[] };
type SavedScript = { request: StoryRequest; response: StoryResponse };
type Archive = { panels: ComicPanel[]; run: Run };
const choiceDetails = ["Let the unknown in.", "Some things should stay buried.", "Every secret has a source."];
const choiceIcons = ["power", "break", "search"] as const;

function seconds(ms: number | null | undefined) { return ms == null ? "—" : `${(ms / 1000).toFixed(2)}s`; }
function failure(stage: string, error: unknown): Failure {
  return { stage, message: error instanceof Error ? error.message : "An unexpected error occurred.", code: error instanceof RequestError ? error.code : "client_error", duration_ms: error instanceof RequestError ? error.duration_ms : null, request_id: error instanceof RequestError ? error.request_id : null };
}

export function Reader({ configured, models }: { configured: boolean; models: Models }) {
  const [choice, setChoice] = useState<(typeof CHOICES)[number]>(CHOICES[0]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [panels, setPanels] = useState<ComicPanel[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [approach, setApproach] = useState<ImageApproach>(models.referenceSupported ? "reference" : "text");
  const [savedScript, setSavedScript] = useState<SavedScript | null>(null);
  const [archive, setArchive] = useState<Archive | null>(null);
  const controller = useRef<AbortController | null>(null);
  const continuation = useRef<HTMLDivElement | null>(null);
  const runStarted = run?.started;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!busy || runStarted == null) return;
    const started = runStarted;
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 100);
    return () => window.clearInterval(timer);
  }, [busy, runStarted]);

  async function generate(event?: React.FormEvent<HTMLFormElement>, replay = false) {
    event?.preventDefault();
    if (busy || (replay && !savedScript)) return;
    const request: StoryRequest = replay && savedScript ? savedScript.request : { context: INITIAL_CONTEXT, choice, instruction };
    const reusedResponse = replay ? savedScript?.response : null;
    if (replay && run && panels.length) setArchive({ panels, run });
    if (!replay) { setArchive(null); setSavedScript(null); }
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    const started = performance.now();
    setBusy(true); setPanels([]); setElapsed(0);
    setRun({ started, textReady: null, total: null, settled: null, imagePhase: null, narrative: null, approach, scriptReused: replay, failures: [] });
    let successfulImages = 0;
    let imagesStarted: number | null = null;
    try {
      await runContinuation(request, {
        story: (input) => reusedResponse ? Promise.resolve(reusedResponse) : fetchStory(input, abort.signal),
        image: (panel) => fetchImage(panel, abort.signal, approach),
      }, {
        script: async (response) => {
          if (!replay) setSavedScript({ request, response });
          flushSync(() => {
            setPanels(response.script.panels.map((panel) => ({ ...panel, status: "loading_image" })));
          });
          setRun((current) => current && ({ ...current, narrative: response.metrics, textReady: replay ? null : performance.now() - started }));
          continuation.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
          // Yield a painted frame before dispatching the independent image requests.
          await yieldForTextPaint();
          imagesStarted = performance.now();
        },
        image: (result) => {
          successfulImages += 1;
          setPanels((current) => current.map((panel) => panel.panel_id === result.panel_id ? { ...panel, image_url: result.image_url, metrics: result.metrics, status: "complete" } : panel));
        },
        imageError: (panelId, error) => {
          const entry = failure(panelId, error);
          setPanels((current) => current.map((panel) => panel.panel_id === panelId ? { ...panel, error: entry.message } : panel));
          setRun((current) => current && ({ ...current, failures: [...current.failures, entry] }));
        },
      });
    } catch (error: unknown) {
      if (!abort.signal.aborted) setRun((current) => current && ({ ...current, failures: [...current.failures, failure("Narrative", error)] }));
    } finally {
      if (!abort.signal.aborted) {
        const settled = performance.now() - started;
        setElapsed(settled);
        setRun((current) => current && ({ ...current, settled, total: successfulImages === 2 ? settled : null, imagePhase: successfulImages === 2 && imagesStarted != null ? performance.now() - imagesStarted : null }));
        setBusy(false);
      }
    }
  }

  function downloadRun() {
    if (!run || !savedScript) return;
    const report = (snapshot: Archive) => ({ ...snapshot.run, started: undefined, panels: snapshot.panels.map((panel) => { const copy = { ...panel }; delete copy.image_url; return copy; }) });
    const json = JSON.stringify({ recorded_at: new Date().toISOString(), source: "browser-live-api", request: savedScript.request, models, current: report({ panels, run }), previous: archive ? report(archive) : null }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "lunatoon-poc-02-run.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const complete = panels.filter((panel) => panel.status === "complete").length;
  const stage = busy ? panels.length ? "Illustrating" : "Writing the next beat" : run?.failures.length ? "Run interrupted" : complete === 2 ? "Continuation complete" : "Waiting for your choice";

  return <div className="app-shell">
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Lunatoon home"><span className="logo-mark"><Icon name="moon" size={24} /></span>lunatoon<span className="wordmark-dot">.</span></Link>
      <div className="header-divider" /><span className="header-caption">A NEW KIND OF STORY</span>
      <div className="header-right"><span className="poc-tag">EXPERIMENT 001</span><span className="local-badge"><i /> LOCAL POC</span></div>
    </header>

    <main className="workspace">
      <aside className="director-column">
        <div className="eyebrow"><span className="tiny-line" /> YOU DIRECT. AI DRAWS.</div>
        <div className="story-heading"><span className="genre">CYBERPUNK / MYSTERY</span><h1>Neon<br /><em>Protocol</em><span className="title-period">.</span></h1></div>
        <p className="story-logline">The city knows everything.<br />Except what you’ll do next.</p>
        <div className="story-meta"><span>NEW KYOTO, 2089</span><span className="meta-dot">·</span><span>DETECTIVE KAEL</span></div>
        <div className="context-block"><span className="section-label">THE STORY SO FAR</span><p>{INITIAL_CONTEXT}</p></div>

        <form onSubmit={generate}>
          <div className="section-heading"><span className="section-label">WHAT HAPPENS NEXT?</span><span className="step-label">01 / YOUR CHOICE</span></div>
          <fieldset disabled={busy} className="choice-group"><legend className="sr-only">Choose a narrative action</legend>
            {CHOICES.map((item, index) => <label key={item} className={`choice-card ${choice === item ? "selected" : ""}`}>
              <input type="radio" name="choice" value={item} checked={choice === item} onChange={() => setChoice(item)} />
              <span className="choice-icon"><Icon name={choiceIcons[index]} size={19} /></span>
              <span className="choice-copy"><strong>{item}</strong><small>{choiceDetails[index]}</small></span>
              <span className="radio-visual">{choice === item && <span />}</span>
            </label>)}
          </fieldset>
          <div className="twist-heading"><label className="section-label" htmlFor="twist">MAKE IT YOURS</label><span>OPTIONAL</span></div>
          <div className="twist-input"><textarea id="twist" value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={500} disabled={busy} placeholder="Add your own twist to the story..." rows={3} /><span className="character-count">{instruction.length} / 500</span></div>
          <label className="continuity-label section-label" htmlFor="image-approach">VISUAL CONTINUITY EXPERIMENT</label>
          <select id="image-approach" value={approach} disabled={busy} onChange={(event) => setApproach(event.target.value as ImageApproach)}><option value="text">A · Shared text constraints</option><option value="reference" disabled={!models.referenceSupported}>B · Authored visual reference</option></select>
          <p className="approach-note">{approach === "text" ? "Two independent illustrations, one shared character bible." : "Two reference edits using the original Kael sheet. Reference inputs can cost more; choose A for text-only generation. Project access is checked by the requests."}</p>
          <button className="generate-button" type="submit" disabled={busy}><Icon name="spark" size={19} /><span>{busy ? "Creating your continuation" : "Generate Continuation"}</span>{!busy && <Icon name="arrow" size={18} />}{busy && <span className="spinner" />}</button>
          <p className="generation-note">ONE CONTINUATION <span>·</span> TWO AI-GENERATED PANELS</p>
        </form>

        {!configured && <div className="setup-note"><Icon name="terminal" size={16} /><p><strong>Bring your own API key</strong>Add <code>OPENAI_API_KEY</code> to <code>.env.local</code> and restart to generate.</p></div>}
        <div className="director-footer"><span className="small-orbit">✳</span><p>A small experiment in stories<br />with a human in the loop.</p></div>
      </aside>

      <section className="reader-column" aria-label="Webtoon reader">
        <div className="reader-toolbar"><div><span className="reader-status-dot" /><span>NEON PROTOCOL</span><span className="toolbar-slash">/</span><span className="muted">THE FIRST SIGNAL</span></div><span className="chapter-label">CHAPTER 01</span></div>
        <div className="reading-area">
          <div className="scene-label"><span>THE BEGINNING</span><span>00</span></div>
          <article className="opening-panel" aria-label="Initial scene: Kael discovers the device">
            {/* This is a fixed illustration of the hardcoded opening, not an API result. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/neon-protocol.svg" alt="A detective in a yellow coat stands in a rain-soaked neon transit station, holding a glowing cyan device beneath the skyline of New Kyoto." className="opening-art" />
            <div className="opening-caption"><span>NEW KYOTO · 02:17 AM</span><p>Some things are better<br />left undiscovered.</p></div>
            <div className="opening-dialogue"><span>KAEL</span><p>“How do you know<br />my name?”</p></div>
            <span className="art-credit">PRE-WRITTEN OPENING · FIXED ILLUSTRATION</span>
          </article>
          <div className="scene-narration"><span className="narration-line" /><p>The signal stops. The device wakes.<br /><strong>And the city holds its breath.</strong></p><span className="narration-line" /></div>

          {!panels.length && <div className={`waiting-state ${busy ? "is-writing" : ""}`} aria-live="polite"><span className="waiting-icon"><Icon name="spark" size={23} /></span><div><h2>{busy ? "Your next chapter is taking shape." : "This is where you come in."}</h2><p>{busy ? "Writing two panels. Dialogue will appear first." : "Choose a direction. Add a twist. See what unfolds."}</p></div>{busy ? <span className="spinner" /> : <Icon name="arrow" size={19} />}</div>}

          <div ref={continuation} className="continuation" aria-busy={busy}>
            {panels.length > 0 && <><div className="scene-label continuation-label"><span>YOUR CONTINUATION · {run?.approach === "reference" ? "B / REFERENCE" : "A / TEXT"}</span><span>{complete} / 2 ILLUSTRATED</span></div><p className="branch-caption"><Icon name="power" size={13} />{savedScript?.request.choice ?? choice}{savedScript?.request.instruction && <span>+ your twist</span>}</p>{panels.map((panel) => <ComicPanelCard key={panel.panel_id} panel={panel} />)}{!busy && complete === 2 && <div className="end-marker"><Icon name="check" size={16} /><span>YOUR CHOICE BECAME A STORY.</span></div>}</>}
          </div>

          <details className="diagnostics" open><summary><span><Icon name="terminal" size={15} />DEVELOPER DIAGNOSTICS</span><span className={`run-state ${run?.failures.length ? "error-state" : ""}`}><i className={busy ? "active-dot" : ""} />{stage}<Icon name="chevron" size={13} /></span></summary>
            <div className="diagnostic-body">
              <div className="metrics-grid"><Metric label="NARRATIVE" value={run?.scriptReused ? "Reused" : seconds(run?.narrative?.duration_ms)} /><Metric label="PANEL 01" value={seconds(panels[0]?.metrics?.duration_ms)} /><Metric label="PANEL 02" value={seconds(panels[1]?.metrics?.duration_ms)} /><Metric label={run?.scriptReused ? "REPLAY TOTAL" : "TOTAL"} value={seconds(busy ? elapsed : run?.total)} highlight /></div>
              <div className="target-row"><span>Text ready <strong>{run?.scriptReused ? "reused" : seconds(run?.textReady)}</strong> <Target value={run?.textReady} target={3000} /></span><span>Image phase <strong>{seconds(run?.imagePhase)}</strong></span><span>Both images <strong>{seconds(run?.total)}</strong> {!run?.scriptReused && <Target value={run?.total} target={30000} />}</span></div>
              <p className="target-note">{run?.scriptReused ? "Replay uses the identical script. Total measures illustration work only; do not compare it with a full pipeline total." : "Targets: text < 3s · both images < 30s. Measured from submit; experimental, not guaranteed."}</p>
              {run?.narrative?.client && !run.scriptReused && <div className="timing-breakdown">Narrative request {seconds(run.narrative.client.request_ms)} · server {seconds(run.narrative.duration_ms)} · remainder {seconds(Math.max(0, run.narrative.client.request_ms - run.narrative.duration_ms))}<br />Remainder includes routing, startup, transfer and response decoding; it does not identify a bottleneck. Client validation {seconds(run.narrative.client.validation_ms)} · SDK request + parse {seconds(run.narrative.sdk_ms)} · output {run.narrative.output_chars ?? "—"} characters.</div>}
              {panels.some((panel) => panel.metrics?.client) && <div className="timing-breakdown">{panels.map((panel) => panel.metrics?.client && <div key={panel.panel_id}>Panel {panel.sequence_index}: request {seconds(panel.metrics.client.request_ms)} · decode {seconds(panel.metrics.client.decode_ms)}</div>)}</div>}
              <div className="model-info"><div><span>STORY</span><code>{run?.narrative?.model ?? models.story}</code></div><div><span>IMAGES</span><code>{panels.find((panel) => panel.metrics)?.metrics?.model ?? models.image}</code><span className="quality-tag">{models.quality}</span></div></div>
              {run && <div className="usage-section"><span>Usage (input / output / total tokens)</span>{run.narrative && !run.scriptReused && <Usage label="Narrative" metrics={run.narrative} />}{run.scriptReused && <p>Narrative reused · no new narrative request or tokens.</p>}{panels.filter((panel) => panel.metrics).map((panel) => <Usage key={panel.panel_id} label={`Panel ${panel.sequence_index}`} metrics={panel.metrics!} />)}<span className="usage-note">Cost not estimated. Check actual billing in your OpenAI project.</span></div>}
              {savedScript && !busy && <div className="experiment-actions"><button type="button" onClick={() => void generate(undefined, true)}>Render same script with {approach === "reference" ? "B / reference" : "A / text"} · 2 image calls</button><p>Uses the last script and original choice/twist, even if the fields changed. Select the other approach above for a controlled comparison. Both images still run concurrently.</p><button type="button" onClick={downloadRun}>Download diagnostics JSON · no images or credentials</button></div>}
              {run?.settled != null && run.total == null && <p className="settled-note">Run settled after {seconds(run.settled)}. Both panels did not complete.</p>}
              {run?.failures.map((entry, index) => <div className="diagnostic-error" role="alert" key={`${entry.stage}-${index}`}><strong>{entry.stage} · {entry.code}{entry.duration_ms != null && ` · ${seconds(entry.duration_ms)}`}</strong><p>{entry.message}</p>{entry.request_id && <code>Request: {entry.request_id}</code>}</div>)}
              <div className="diagnostic-footer"><span><i className={configured ? "configured-dot" : "unconfigured-dot"} />{configured ? "Server key configured · no automatic retries" : "API key not configured"}</span><span>LIVE API · NO SIMULATED RESULTS</span></div>
            </div>
          </details>
          {archive && <details className="previous-run"><summary>Compare with previous {archive.run.approach === "reference" ? "B / reference" : "A / text"} · same script · retained in this tab</summary><p>Image phase {seconds(archive.run.imagePhase)} · {archive.run.scriptReused ? "replayed script" : `text ready ${seconds(archive.run.textReady)}`}</p>{archive.panels.map((panel) => <ComicPanelCard key={`previous-${panel.panel_id}`} panel={panel} />)}</details>}
          <footer className="reader-footer"><span>LUNATOON / POC 01</span><span>A story is a conversation.</span></footer>
        </div>
      </section>
    </main>
  </div>;
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`metric ${highlight ? "metric-highlight" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Target({ value, target }: { value: number | null | undefined; target: number }) {
  return value == null ? null : <span className={value < target ? "target-pass" : "target-miss"}>{value < target ? "within target" : "over target"}</span>;
}
function Usage({ label, metrics }: { label: string; metrics: Metrics }) {
  return <div className="usage-row"><span>{label}</span><code>{metrics.usage ? `${metrics.usage.input_tokens} / ${metrics.usage.output_tokens} / ${metrics.usage.total_tokens}` : "Not returned"}</code>{metrics.request_id && <code className="request-id" title={metrics.request_id}>{metrics.request_id}</code>}</div>;
}
