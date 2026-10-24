"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageDisplayTiming } from "@/lib/reader-timing";
import { Icon } from "./icon";
import "@/app/generation-ux.css";
export type OnImageDisplay = (kind: "preview" | "final", timing: ImageDisplayTiming) => void;
function DecodedImage({ src, description, kind, onDisplay }: { src: string; description: string; kind: "preview" | "final"; onDisplay?: OnImageDisplay }) {
  const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false);
  const element = useRef<HTMLImageElement>(null); const decoding = useRef(false);
  const timing = useRef<ImageDisplayTiming | null>(null); const reported = useRef(false);
  const loaded = useCallback(async (image: HTMLImageElement) => {
    if (decoding.current) return;
    decoding.current = true;
    const started = performance.now();
    try { await image.decode(); } catch { setFailed(true); return; }
    if (!image.isConnected) return;
    const entry = performance.getEntriesByName(image.currentSrc).at(-1) as PerformanceResourceTiming | undefined;
    timing.current = { phase: "decoded", at: performance.now(), transfer_ms: entry?.responseStart ? Math.max(0, entry.responseEnd - entry.responseStart) : null, decode_ms: performance.now() - started };
    onDisplay?.(kind, timing.current); setReady(true);
  }, [kind, onDisplay]);
  useEffect(() => {
    // A cached server-rendered asset can load before hydration attaches onLoad.
    // Decoding either path once also avoids duplicate display observations.
    if (!failed && element.current?.complete) void loaded(element.current);
  }, [loaded, failed]);
  function visible() {
    if (!timing.current || reported.current) return;
    reported.current = true; onDisplay?.(kind, { ...timing.current, phase: "visible", at: performance.now() });
  }
  function reloadAsset() {
    // Re-mount only this saved image. This never calls a generation endpoint.
    decoding.current = false; timing.current = null; reported.current = false;
    setReady(false); setFailed(false);
  }
  if (failed) return <div className="image-display-error" role="status"><p>{kind === "final" ? "This illustration couldn’t load. Your saved story is safe." : "The preview couldn’t load. Waiting for the final artwork."}</p>{kind === "final" && <button type="button" onClick={reloadAsset}>Load saved illustration again</button>}</div>;
  // Local saved assets and transient real previews need no Next image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={element} className={`${kind === "final" ? "generated-image" : "preview-image"} reader-image ${ready ? "is-ready" : ""}`} src={src} alt={description} onLoad={event => void loaded(event.currentTarget)} onError={() => setFailed(true)} onAnimationEnd={visible} />;
}
function WaitingCopy() {
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLongWait(true), 20_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <span>{longWait ? "Taking a little longer. Your dialogue is saved." : "Keep reading. The scene will appear here."}</span>;
}
export function ReaderIllustration({ src, preview, description, error, onDisplay }: { src?: string; preview?: string; description: string; error?: string; onDisplay?: OnImageDisplay }) {
  return <>
    <div className="image-placeholder reading-placeholder generation-placeholder" data-state={error ? "failed" : "pending"} aria-hidden={Boolean(src)}>
      {/* Authored decorative geometry, not a generated preview or story event. */}
      <svg className="generation-composition" viewBox="0 0 480 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <path className="generation-structure" d="M0 0H480V720H0ZM28 720V148L106 70H374L452 148V720M44 720V160L116 88H364L436 160V720M28 148H452M44 160H436M28 196H452M44 210H436" />
        <path className="generation-structure" d="M28 196L44 242M452 196L436 242M28 320H44M436 320H452M28 444H44M436 444H452M28 568H44M436 568H452M44 590H436" />
        <path className="generation-floor" d="M0 720L180 590M96 720L204 590M192 720L228 590M288 720L252 590M384 720L276 590M480 720L300 590M0 704H480M24 662H456M72 628H408M116 604H364" />
        <path className="generation-light" d="M118 108H184M296 108H362M58 232V286M422 232V286M56 582H122M358 582H424" />
        <circle className="generation-orbit" cx="240" cy="176" r="26" />
        <path className="generation-orbit" d="M240 138V146M240 206V214M202 176H210M270 176H278" />
      </svg>
      <div className="generation-copy">
        <span className="placeholder-mark"><Icon name={error ? "break" : "moon"} size={24} /></span>
        <p>{error ? "This illustration couldn’t be finished" : src ? "Loading your saved illustration…" : "Illustrating this moment…"}</p>
        {error ? <span>Your dialogue is still here.</span> : src ? <span>Your artwork is saved.</span> : <WaitingCopy />}
      </div>
    </div>
    {preview && !error && <DecodedImage key={preview} src={preview} description={`Preview: ${description}`} kind="preview" onDisplay={onDisplay} />}
    {src && <DecodedImage key={src} src={src} description={description} kind="final" onDisplay={onDisplay} />}
    {preview && !src && !error && <span className="preview-label">Preview · still illustrating</span>}
  </>;
}
