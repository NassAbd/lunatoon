import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorStudio } from "@/components/creator-studio";
import { StoryHeader } from "@/components/story-book";
import { getCreator } from "@/lib/creator/runtime";
import { listDrafts } from "@/lib/creator/store";
import { Id } from "@/lib/story-engine/contracts";
import { getModelConfig } from "@/lib/server/ai";
import { isReferenceModelSupported } from "@/lib/art-direction";
import { EngineError } from "@/lib/story-engine/errors";
import "./studio.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Studio — Lunatoon" };
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  if (draft && !Id.safeParse(draft).success) notFound();
  let initial = null;
  try { initial = draft ? getCreator().store.getDraft(draft) : null; }
  catch (error) { if (error instanceof EngineError && error.status === 404) notFound(); throw error; }
  const drafts = listDrafts({ limit: 12 });
  return <div className="story-reader library-page"><StoryHeader active="studio" /><main className="studio-main">
    <header className="studio-intro"><p className="book-eyebrow">CREATOR STUDIO · LOCAL EDITION</p><h1>A story only you could start.</h1><p>Bring a world to life with a few words.<br />Shape its first moments, then see where your choices lead.</p>{draft && <Link href="/studio" className="studio-text-button">Start a fresh draft →</Link>}</header>
    <CreatorStudio key={draft ?? "new"} initial={initial} referenceSupported={isReferenceModelSupported(getModelConfig().image)} />
    {drafts.length > 0 && <section className="studio-local" aria-labelledby="drafts-heading"><p className="book-eyebrow">YOUR LOCAL WORKSPACE</p><h2 id="drafts-heading">Come back to an idea.</h2><p className="studio-muted">Drafts and saved versions stay on this installation. They aren’t publicly published.</p><div className="studio-draft-list">{drafts.map(item => <Link key={item.id} href={`/studio?draft=${item.id}`}><span>{item.title}</span><small>{item.status === "ready" ? `Ready to play · v${item.latest_saved_version}` : "Draft"}</small></Link>)}</div></section>}
    <footer className="book-footer">A little moonlight. A different story.</footer>
  </main></div>;
}
