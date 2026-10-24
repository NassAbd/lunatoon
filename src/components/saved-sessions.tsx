import Link from "next/link";
import type { SavedRunSummary } from "@/lib/story-library";
import { Icon } from "./icon";

const statusLabel: Record<SavedRunSummary["status"], string> = {
  new: "Ready to begin", in_progress: "In progress", illustrating: "Illustrations unfinished", needs_attention: "Ready to recover", completed: "Completed",
};
const date = (timestamp: number) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp);

export function SavedSessions({ runs, unavailable = false }: { runs: SavedRunSummary[]; unavailable?: boolean }) {
  if (unavailable) return <div className="library-empty" role="status"><h3>Saved stories couldn’t be loaded.</h3><p>Your bookmarked story URLs are still available. Try this page again after checking the local app.</p></div>;
  if (!runs.length) return <div className="library-empty"><Icon name="moon" size={26} /><h3>Your next story is waiting.</h3><p>Begin Neon Protocol and it will appear here, ready to return to.</p><Link href="/#stories">Start a new story <span aria-hidden="true">→</span></Link></div>;
  return <div className="saved-session-list">{runs.map(run => <article className="saved-session" key={run.id} data-run-id={run.id}>
    <div className="session-mark" aria-hidden="true"><Icon name="moon" size={23} /></div>
    <div className="session-copy"><div className="session-title-line"><h3>{run.title}</h3><span className={`session-status status-${run.status}`}>{statusLabel[run.status]}</span></div>
      <p><time dateTime={new Date(run.created_at).toISOString()}>Started {date(run.created_at)}</time><span aria-hidden="true"> · </span>{run.step} of {run.max_steps} decisions<span aria-hidden="true"> · </span>{run.completed_panels} illustrations saved</p>
      <small>Session {run.id.slice(0, 8)}</small>
    </div>
    <Link prefetch={false} href={`/run/${run.id}`} className="session-action" aria-label={`${run.status === "completed" ? "Read again" : "Resume story"} · ${run.title} · ${run.id.slice(0, 8)}`}>{run.status === "completed" ? "Read again" : "Resume story"}<Icon name="arrow" size={16} /></Link>
  </article>)}</div>;
}
