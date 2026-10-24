import Link from "next/link";
import { StoryHeader } from "@/components/story-book";
import { SavedSessions } from "@/components/saved-sessions";
import { listSavedRuns } from "@/lib/story-library";

export const dynamic = "force-dynamic";
export default async function SavedPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const query = await searchParams;
  const page = typeof query.page === "string" && /^\d{1,5}$/.test(query.page) ? Math.max(1, Math.min(10000, Number(query.page))) : 1;
  let saved: ReturnType<typeof listSavedRuns> | null;
  try { saved = listSavedRuns({ page, limit: 12 }); } catch { saved = null; }
  return <div className="story-reader library-page"><StoryHeader active="saved" /><main className="library-main saved-main">
    <div className="library-section-heading saved-title"><div><p className="book-eyebrow">YOUR READING CORNER</p><h1>Stories to return to.</h1></div><Link className="book-secondary" href="/#stories">Start a new story <span aria-hidden="true">→</span></Link></div>
    <p className="local-note">These sessions are saved on this local installation. Open one to continue reading or revisit its ending. No account or cloud sync.</p>
    <SavedSessions runs={saved?.runs ?? []} unavailable={!saved} />
    {saved && <nav className="saved-pagination" aria-label="Saved story pages">{page > 1 && <Link href={`/saved?page=${page - 1}`}>← Newer sessions</Link>}{saved.has_next && <Link href={`/saved?page=${page + 1}`}>Older sessions →</Link>}</nav>}
    <footer className="platform-footer"><span>Your choices stay with your story.</span><Link href="/">Back to the library</Link></footer>
  </main></div>;
}
