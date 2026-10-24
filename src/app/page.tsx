import Link from "next/link";
import { StoryHeader } from "@/components/story-book";
import { LibraryLaunch } from "@/components/library-launch";
import { SavedSessions } from "@/components/saved-sessions";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";
import { listSavedRuns } from "@/lib/story-library";
export const dynamic = "force-dynamic";
export default function Home() {
  let saved: ReturnType<typeof listSavedRuns> | null;
  try { saved = listSavedRuns({ limit: 6 }); } catch { saved = null; }
  return <div className="story-reader library-page"><StoryHeader active="library" /><main className="library-main">
    <section className="library-intro"><p className="book-eyebrow">A LITTLE MOONLIGHT. A DIFFERENT STORY.</p><h1>Every story starts<br /> with a choice.</h1><p>Step into an illustrated world. Choose what happens next.<br />Leave a little of yourself in the story.</p></section>
    <section id="stories" className="library-stories" aria-label="Explore stories">
      <article className="story-card featured-story" data-story="neon-protocol">
        <div className="story-cover neon-cover">
          {/* Original authored cover; never a private generated story asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/neon-protocol.svg" width={1000} height={850} alt="Detective Kael stands in the rain, a cyan device glowing against his yellow coat" />
          <span className="cover-label">FEATURED · PLAYABLE</span>
        </div>
        <div className="story-card-copy"><p className="story-genre">CYBERPUNK NOIR <span>2 decisions · 1 ending</span></p><h2>Neon Protocol</h2><p>The city knows everything. Except what you’ll do next. Follow Detective Kael into New Kyoto’s silent surveillance network.</p><LibraryLaunch referenceSupported={isReferenceModelSupported(getModelConfig().image)} /></div>
      </article>
      <article className="story-card preview-story" data-story="last-lightkeeper">
        <div className="story-cover lightkeeper-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/last-lightkeeper.svg" width={1000} height={650} alt="An old lighthouse watches a seafoam ocean beneath a peach-colored moon" />
          <span className="cover-label">Coming soon</span>
        </div>
        <div className="story-card-copy"><p className="story-genre">COASTAL FANTASY <span>Preview</span></p><h2>The Last Lightkeeper</h2><p>On an island the tide is slowly forgetting, one lighthouse still answers the stars. A new world is on the horizon.</p><p className="preview-note">A story to look forward to.<br />This preview isn’t playable yet.</p></div>
      </article>
    </section>
    <section className="library-saved" aria-labelledby="continue-heading"><div className="library-section-heading"><div><p className="book-eyebrow">YOUR READING CORNER</p><h2 id="continue-heading">Pick up where you left off.</h2></div><Link href="/saved">All saved stories <span aria-hidden="true">↗</span></Link></div><p className="local-note">Saved on this local installation. No account or cloud sync.</p><SavedSessions runs={saved?.runs ?? []} unavailable={!saved} /></section>
    <footer className="platform-footer"><span>Made for the turns you didn’t see coming.</span><Link href="/about">About Lunatoon</Link></footer>
  </main></div>;
}
