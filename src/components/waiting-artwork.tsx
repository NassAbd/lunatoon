"use client";
import { useEffect, useState } from "react";
import type { WaitingArtwork as Artwork } from "@/lib/reader-waiting-artwork";

export function WaitingArtwork({ artwork }: { artwork: readonly Artwork[] }) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState(0);
  const available = artwork.filter(item => !failed.has(item.src));
  const count = available.length;
  useEffect(() => {
    if (count < 2) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (!preference.matches) timer = setInterval(() => setCurrent(value => (value + 1) % count), 8_000);
    };
    update(); preference.addEventListener("change", update);
    return () => { clearInterval(timer); preference.removeEventListener("change", update); };
  }, [count]);
  if (!count) return null;
  return <div className="waiting-artwork" aria-hidden="true">
    {available.map((item, index) =>
      // Existing owned artwork is decorative atmosphere, never a model preview.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={item.src} src={item.src} alt="" className={index === current % count ? "is-current" : ""} onError={() => setFailed(previous => new Set(previous).add(item.src))} />)}
    <span className="waiting-artwork-label">Saved scenery · atmosphere while you wait</span>
  </div>;
}
