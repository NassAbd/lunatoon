"use client";
import { useState } from "react";
import type { CreatorSnapshot } from "@/lib/creator/contracts";
import type { OpeningPanel } from "@/lib/creator/opening-contracts";
import { ReaderIllustration } from "./reader-illustration";
import { LibraryLaunch } from "./library-launch";

export function CreatorOpening({ snapshot, busy, referenceSupported, previews, onRetry, onStart, onVisible }: {
  snapshot: CreatorSnapshot; busy: boolean; referenceSupported: boolean; previews: Record<string, string>;
  onRetry: (panel: OpeningPanel, acknowledged: boolean) => void; onStart: () => void; onVisible: (panelId: string) => void;
}) {
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const opening = snapshot.opening; if (!opening) return null;
  const complete = opening.panels.filter(panel => panel.status === "complete").length;
  const running = busy || opening.panels.some(panel => panel.status === "running");
  const title = opening.status === "ready" ? "Opening fully illustrated" : running ? "Opening illustrations generating" : complete ? "Opening partially illustrated" : "Your opening is saved";
  const cover = opening.panels[0];
  return <section className="studio-card studio-opening" aria-labelledby="opening-heading" data-version={opening.version}>
    <div className="studio-preview-header"><div className="studio-opening-title">{cover.status === "complete" && <figure className="studio-opening-cover">
      {/* The cover reuses the first saved opening asset; it makes no AI call. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/creator/drafts/${snapshot.draft.id}/opening/${opening.version}/${cover.id}/asset`} alt={`Cover: ${snapshot.latest_template?.title ?? "Your story"}`} width={96} height={144} /><figcaption>Cover · Scene 1</figcaption>
    </figure>}<div><p className="book-eyebrow">YOUR FIRST SCENES · VERSION {opening.version}</p><h2 id="opening-heading">{title}</h2><h3>{snapshot.latest_template?.title}</h3><p className="studio-muted" role="status">{complete} of {opening.panels.length} illustrations saved. Each scene appears when it is ready. Your captions are already saved.</p></div></div><span className="studio-status">{opening.status === "ready" ? "Ready to play" : running ? "Illustrating" : "Saved"}</span></div>
    <div className="studio-opening-grid">{opening.panels.map(panel => {
      const latest = opening.attempts.filter(attempt => attempt.panel_id === panel.id).at(-1);
      const failed = panel.status === "failed" || panel.status === "interrupted";
      const unknown = failed && latest?.estimated_micro_usd == null;
      const src = panel.status === "complete" && panel.asset_id ? `/api/creator/drafts/${snapshot.draft.id}/opening/${opening.version}/${panel.id}/asset` : undefined;
      return <article className="studio-opening-scene" key={panel.id} data-scene-id={panel.id} data-status={panel.status}>
        <div className="studio-opening-art" style={{ aspectRatio: panel.layout_aspect === "square" ? "1 / 1" : panel.layout_aspect === "banner" ? "3 / 2" : "2 / 3" }}>
          {panel.status === "pending" && !running ? <div className="studio-opening-unstarted"><span aria-hidden="true">☾</span><p>Ready to illustrate</p><small>Your scene is saved. Illustration starts only when you choose.</small></div> : <ReaderIllustration src={src} preview={previews[panel.id]} description={panel.scene_description} error={failed ? panel.error?.message ?? "This illustration did not finish." : undefined} savedContent="caption" onDisplay={(kind, timing) => { if (kind === "final" && timing.phase === "visible") onVisible(panel.id); }} />}
        </div>
        <div className="studio-opening-caption"><p className="book-eyebrow">SCENE {panel.sequence}</p><p>{panel.caption}</p>{failed && <div className="studio-opening-error" role="status"><p>This scene couldn’t be finished. Your story and the other illustrations are safe.</p>{unknown && <label className="studio-check"><input type="checkbox" checked={Boolean(acknowledged[panel.id])} onChange={event => setAcknowledged(current => ({ ...current, [panel.id]: event.target.checked }))} />I understand the previous illustration may have been charged.</label>}<button type="button" className="book-secondary" disabled={busy || unknown && !acknowledged[panel.id]} onClick={() => onRetry(panel, Boolean(acknowledged[panel.id]))}>Retry illustration</button><p className="studio-muted">This is a new image request and may incur API charges.</p></div>}</div>
      </article>;
    })}</div>
    {!running && opening.panels.some(panel => panel.status === "pending") && <div className="studio-save"><button type="button" className="book-primary" onClick={onStart}>Illustrate remaining scenes</button><p className="studio-muted">Starts only scenes that have never been requested. Image generation may incur API charges. Failed scenes have their own retry action.</p></div>}
    {opening.status === "ready" && snapshot.latest_template?.status === "ready" && <div className="studio-ready"><div><h2>Ready to play</h2><p className="studio-muted">Your illustrated opening will be reused by every reading of this version. Starting a reading makes no AI calls.</p></div><LibraryLaunch key={`${opening.template_id}:${opening.version}`} template={snapshot.latest_template} referenceSupported={referenceSupported} label="Play your story" /></div>}
    <details className="book-developer studio-diagnostics"><summary>Developer details</summary><div className="book-details-body"><p>Opening generation: {opening.summary.calls}/{opening.limits.max_calls} image calls · estimated spend ${(opening.summary.estimated_micro_usd / 1e6).toFixed(5)} · held ${(opening.summary.held_micro_usd / 1e6).toFixed(5)} · planning budget ${opening.limits.budget_usd.toFixed(2)}.</p><p>Measured tokens: {opening.summary.measured_input_tokens} input / {opening.summary.measured_output_tokens} output; reference image input {opening.summary.measured_reference_input_tokens} tokens, estimated ${(opening.summary.reference_input_micro_usd / 1e6).toFixed(5)}. Unknown-cost attempts: {opening.summary.unknown_cost_attempts}. Unpriced: {opening.summary.unpriced_attempts}. This is not a provider billing cap.</p><p>{opening.model} · {opening.quality} · {opening.approach}. No automatic paid retries.</p><ul>{opening.attempts.map(attempt => <li key={attempt.id}>Scene {opening.panels.find(panel => panel.id === attempt.panel_id)?.sequence} · {attempt.status} · {attempt.metrics?.duration_ms ?? "unknown"} ms · {attempt.metrics?.request_id ?? "No provider request ID"} · prompt {attempt.metrics?.prompt_version ?? "not recorded"}</li>)}</ul></div></details>
  </section>;
}
