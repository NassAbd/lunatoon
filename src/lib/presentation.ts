export function yieldForTextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => { if (finished) return; finished = true; window.clearTimeout(fallback); window.cancelAnimationFrame(frame); resolve(); };
    // Background tabs can suspend rAF; never make paid work depend on it resuming.
    const fallback = window.setTimeout(done, 100);
    const frame = window.requestAnimationFrame(() => { window.setTimeout(done, 0); });
  });
}
