import type { CSSProperties } from "react";

export function Icon({ name, size = 20, className, style }: { name: "spark" | "arrow" | "power" | "break" | "search" | "terminal" | "chevron" | "clock" | "check" | "moon"; size?: number; className?: string; style?: CSSProperties }) {
  const paths: Record<typeof name, React.ReactNode> = {
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    power: <><path d="M12 2v10m-6-7a9 9 0 1 0 12 0" /></>,
    break: <><path d="m13 2-3 7 5 3-4 10M5 5l2 2M3 13h3m13-8-2 2m4 8h-3M5 20l2-2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    terminal: <><path d="m4 6 5 6-5 6m8 0h8" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    moon: <><path d="M19.2 15.1A8.8 8.8 0 0 1 8.9 4.8 8.8 8.8 0 1 0 19.2 15.1Z" /><path d="m18 3 .5 1.5L20 5l-1.5.5L18 7l-.5-1.5L16 5l1.5-.5Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{paths[name]}</svg>;
}
