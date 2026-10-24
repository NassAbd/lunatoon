"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageDisplayTiming } from "@/lib/reader-timing";
import { Icon } from "./icon";
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
    if (element.current?.complete) void loaded(element.current);
  }, [loaded]);
  function visible() {
    if (!timing.current || reported.current) return;
    reported.current = true; onDisplay?.(kind, { ...timing.current, phase: "visible", at: performance.now() });
  }
  if (failed) return <div className="image-display-error" role="status">This illustration couldn’t load. Your saved story is safe.</div>;
  // Local saved assets and transient real previews need no Next image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={element} className={`${kind === "final" ? "generated-image" : "preview-image"} reader-image ${ready ? "is-ready" : ""}`} src={src} alt={description} onLoad={event => void loaded(event.currentTarget)} onError={() => setFailed(true)} onAnimationEnd={visible} />;
}
export function ReaderIllustration({ src, preview, description, error, onDisplay }: { src?: string; preview?: string; description: string; error?: string; onDisplay?: OnImageDisplay }) {
  return <>
    <div className="image-placeholder reading-placeholder" aria-hidden={Boolean(src)}>
      <span className="placeholder-mark"><Icon name={error ? "break" : "moon"} size={28} /></span>
      <p>{error ? "This illustration couldn’t be finished" : "Illustrating this moment…"}</p>
      <span>{error ? "Your dialogue is still here." : "Keep reading. The scene will appear here."}</span>
    </div>
    {preview && !error && <DecodedImage key={preview} src={preview} description={`Preview: ${description}`} kind="preview" onDisplay={onDisplay} />}
    {src && <DecodedImage key={src} src={src} description={description} kind="final" onDisplay={onDisplay} />}
    {preview && !src && !error && <span className="preview-label">Preview · still illustrating</span>}
  </>;
}
