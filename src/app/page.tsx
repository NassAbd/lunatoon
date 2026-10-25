import Link from "next/link";
import { StoryHeader } from "@/components/story-book";
import { SavedSessions } from "@/components/saved-sessions";
import { CreatorStories } from "@/components/creator-stories";
import { listSavedRuns } from "@/lib/story-library";
import { BUNDLED_STORIES, PREVIEW_STORIES } from "@/lib/story-templates/catalog";
import { listOwnedSavedTemplates } from "@/lib/creator/store";
export const dynamic = "force-dynamic";
export default function Home() {
  let saved: ReturnType<typeof listSavedRuns> | null;
  try { saved = listSavedRuns({ limit: 6 }); } catch { saved = null; }
  const stories = BUNDLED_STORIES.filter(entry => entry.template.status === "ready");
  let creatorStories: ReturnType<typeof listOwnedSavedTemplates> = [];
  let creatorUnavailable = false;
  try { creatorStories = listOwnedSavedTemplates({ limit: 12 }); } catch { creatorUnavailable = true; }
  return <div className="story-reader library-page"><StoryHeader active="library" /><main className="library-main">
    <section className="library-intro"><p className="book-eyebrow">A LITTLE MOONLIGHT. A DIFFERENT STORY.</p><h1>Every story starts<br /> with a choice.</h1><p>Step into an illustrated world. Choose what happens next.<br />Leave a little of yourself in the story.</p></section>
    <section id="stories" className="library-collection" aria-labelledby="playable-heading">
      <div className="library-section-heading"><div><p className="book-eyebrow">FIND YOUR NEXT STORY</p><h2 id="playable-heading">Ready when you are.</h2></div><p className="library-count">{stories.length} playable worlds · Two decisions, one ending</p></div>
      <div className="library-stories">{stories.map(({ template }, index) => {
        const cover = template.opening_beats.find(beat => beat.asset_id === template.cover_asset_id) ?? template.opening_beats[0];
        return <article className={`story-card playable-story ${index === 0 ? "featured-story" : ""}`} data-story={template.id} data-status="ready" key={template.id}>
          <div className={`story-cover ${template.id === "neon-protocol" ? "neon-cover" : ""}`}>
            {/* Public original artwork, never a generated private run asset. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/templates/${template.id}/assets/${template.cover_asset_id}?version=${template.version}`} width={cover.width} height={cover.height} alt={cover.alt} />
            <span className="cover-label">{index === 0 ? "FEATURED · PLAYABLE" : "PLAYABLE"}</span>
          </div>
          <div className="story-card-copy"><p className="story-genre">{template.genre}</p><h2>{template.title}</h2><p>{template.description}</p><div className="library-launch"><Link className="book-primary" href={`/story/${template.id}`}>About this story</Link></div></div>
        </article>;
      })}</div>
    </section>
    <section id="creator-stories" className="library-preview library-collection" aria-labelledby="creator-heading">
      <div className="library-section-heading"><div><p className="book-eyebrow">MADE BY YOU</p><h2 id="creator-heading">Your own worlds.</h2></div><Link href="/studio">Create a story <span aria-hidden="true">↗</span></Link></div>
      <p className="library-collection-note">Describe a world, refine its beginning, and make it playable. Saved on this local installation.</p>
      {creatorUnavailable ? <p role="status">Local creator stories are temporarily unavailable. Your saved files have been preserved.</p> : <CreatorStories stories={creatorStories} />}
    </section>
    <section className="library-preview library-collection" aria-labelledby="preview-heading">
      <div className="library-section-heading"><div><p className="book-eyebrow">WORLDS ON THE HORIZON</p><h2 id="preview-heading">More stories to look forward to.</h2></div></div>
      <p className="library-collection-note">A glimpse of what might come next. These original previews aren’t playable yet.</p>
      <div className="library-stories">{PREVIEW_STORIES.map(story => <article className="story-card preview-story" data-story={story.id} data-status="preview" key={story.id}>
        <div className="story-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story.cover} width={1000} height={650} alt={story.alt} />
          <span className="cover-label">Coming soon</span>
        </div>
        <div className="story-card-copy"><p className="story-genre">{story.genre}</p><h2>{story.title}</h2><p>{story.description}</p></div>
      </article>)}</div>
    </section>
    <section className="library-saved" aria-labelledby="continue-heading"><div className="library-section-heading"><div><p className="book-eyebrow">YOUR READING CORNER</p><h2 id="continue-heading">Pick up where you left off.</h2></div><Link href="/saved">All saved stories <span aria-hidden="true">↗</span></Link></div><p className="local-note">Saved on this local installation. No account or cloud sync.</p><SavedSessions runs={saved?.runs ?? []} unavailable={!saved} /></section>
    <footer className="platform-footer"><span>Made for the turns you didn’t see coming.</span><Link href="/about">About Lunatoon</Link></footer>
  </main></div>;
}
