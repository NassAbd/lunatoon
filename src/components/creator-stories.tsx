"use client";
import Link from "next/link";
import type { OwnedSavedTemplate } from "@/lib/creator/store";
import { useContentDeletion } from "./content-deletion";

export function CreatorStories({ stories }: { stories: OwnedSavedTemplate[] }) {
  const deletion = useContentDeletion("creator");
  const visible = stories.filter(story => !deletion.hidden.includes(story.draft_id));
  return <>{deletion.feedback}{visible.length ? <div className="library-stories">{visible.map(({ template, draft_id }) => {
    const cover = template.opening_beats.find(beat => beat.asset_id === template.cover_asset_id) ?? template.opening_beats[0];
    return <article className="story-card playable-story" data-story={template.id} data-status="ready" key={`${template.id}:${template.version}`}>
      <div className="story-cover">
        {/* Existing owned artwork is read locally; deleting uses the verified draft UUID. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/templates/${template.id}/assets/${template.cover_asset_id}?version=${template.version}`} width={cover.width} height={cover.height} alt={cover.alt} /><span className="cover-label">LOCAL · READY TO PLAY</span>
      </div><div className="story-card-copy"><p className="story-genre">{template.genre} · v{template.version}</p><h2>{template.title}</h2><p>{template.description}</p><div className="library-launch"><Link className="book-primary" href={`/story/${template.id}`}>About this story</Link></div>
        <button type="button" className="management-delete" disabled={deletion.busy} aria-label={`Delete story · ${template.title}`} onClick={event => void deletion.requestDelete(draft_id, event.currentTarget)}>Delete story</button>
      </div>
    </article>;
  })}</div> : <p className="local-note">Your first original story starts with an idea. <Link href="/studio">Open Creator Studio →</Link></p>}{deletion.confirmation}</>;
}
