"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { CHOICES, INITIAL_CONTEXT, type ComicPanel, type Metrics } from "@/lib/contracts";
import { fetchImage, fetchStory, RequestError } from "@/lib/api-client";
import { runContinuation } from "@/lib/pipeline";
import { ComicPanelCard } from "./comic-panel";
import { Icon } from "./icon";

type Models = { story: string; image: string; quality: string };
type Failure = { stage: string; message: string; code: string; duration_ms: number | null; request_id: string | null };
type Run = { started: number; textReady: number | null; total: number | null; settled: number | null; narrative: Metrics | null; failures: Failure[] };
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

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    const started = performance.now();
    setBusy(true); setPanels([]); setElapsed(0);
    setRun({ started, textReady: null, total: null, settled: null, narrative: null, failures: [] });
    let successfulImages = 0;
    try {
      await runContinuation({ context: INITIAL_CONTEXT, choice, instruction }, {
        story: (input) => fetchStory(input, abort.signal),
        image: (panel) => fetchImage(panel, abort.signal),
      }, {
        script: async (response) => {
          flushSync(() => {
            setPanels(response.script.panels.map((panel) => ({ ...panel, status: "loading_image" })));
            setRun((current) => current && ({ ...current, narrative: response.metrics, textReady: performance.now() - started }));
          });
          continuation.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
          // Yield a painted frame before dispatching the independent image requests.
          await new Promise<void>((resolve) => requestAnimationFrame(() => { window.setTimeout(resolve, 0); }));
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
        setRun((current) => current && ({ ...current, settled, total: successfulImages === 2 ? settled : null }));
        setBusy(false);
      }
    }
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
            {panels.length > 0 && <><div className="scene-label continuation-label"><span>YOUR CONTINUATION</span><span>{complete} / 2 ILLUSTRATED</span></div><p className="branch-caption"><Icon name="power" size={13} />{choice}{instruction && <span>+ your twist</span>}</p>{panels.map((panel) => <ComicPanelCard key={panel.panel_id} panel={panel} />)}{!busy && complete === 2 && <div className="end-marker"><Icon name="check" size={16} /><span>YOUR CHOICE BECAME A STORY.</span></div>}</>}
          </div>

          <details className="diagnostics" open><summary><span><Icon name="terminal" size={15} />DEVELOPER DIAGNOSTICS</span><span className={`run-state ${run?.failures.length ? "error-state" : ""}`}><i className={busy ? "active-dot" : ""} />{stage}<Icon name="chevron" size={13} /></span></summary>
            <div className="diagnostic-body">
              <div className="metrics-grid"><Metric label="NARRATIVE" value={seconds(run?.narrative?.duration_ms)} /><Metric label="PANEL 01" value={seconds(panels[0]?.metrics?.duration_ms)} /><Metric label="PANEL 02" value={seconds(panels[1]?.metrics?.duration_ms)} /><Metric label="TOTAL" value={seconds(busy ? elapsed : run?.total)} highlight /></div>
              <div className="target-row"><span>Text ready <strong>{seconds(run?.textReady)}</strong> <Target value={run?.textReady} target={3000} /></span><span>Both images <strong>{seconds(run?.total)}</strong> <Target value={run?.total} target={30000} /></span></div>
              <p className="target-note">Targets: text &lt; 3s · both images &lt; 30s. Measured from submit; experimental, not guaranteed.</p>
              <div className="model-info"><div><span>STORY</span><code>{run?.narrative?.model ?? models.story}</code></div><div><span>IMAGES</span><code>{panels.find((panel) => panel.metrics)?.metrics?.model ?? models.image}</code><span className="quality-tag">{models.quality}</span></div></div>
              {run && <div className="usage-section"><span>Usage (input / output / total tokens)</span>{run.narrative && <Usage label="Narrative" metrics={run.narrative} />}{panels.filter((panel) => panel.metrics).map((panel) => <Usage key={panel.panel_id} label={`Panel ${panel.sequence_index}`} metrics={panel.metrics!} />)}<span className="usage-note">Cost not estimated. Check actual billing in your OpenAI project.</span></div>}
              {run?.settled != null && run.total == null && <p className="settled-note">Run settled after {seconds(run.settled)}. Both panels did not complete.</p>}
              {run?.failures.map((entry, index) => <div className="diagnostic-error" role="alert" key={`${entry.stage}-${index}`}><strong>{entry.stage} · {entry.code}{entry.duration_ms != null && ` · ${seconds(entry.duration_ms)}`}</strong><p>{entry.message}</p>{entry.request_id && <code>Request: {entry.request_id}</code>}</div>)}
              <div className="diagnostic-footer"><span><i className={configured ? "configured-dot" : "unconfigured-dot"} />{configured ? "Server key configured · model access unverified" : "API key not configured"}</span><span>LIVE API · NO SIMULATED RESULTS</span></div>
            </div>
          </details>
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
