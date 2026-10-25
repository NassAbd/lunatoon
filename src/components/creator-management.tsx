"use client";
import Link from "next/link";
import type { listDrafts } from "@/lib/creator/store";
import { useContentDeletion } from "./content-deletion";

export function CreatorManagement({ drafts, currentDraft }: { drafts: ReturnType<typeof listDrafts>; currentDraft?: string }) {
  const deletion = useContentDeletion("creator", currentDraft);
  return <section className="studio-local" aria-labelledby="drafts-heading"><p className="book-eyebrow">YOUR LOCAL WORKSPACE</p><h2 id="drafts-heading">Come back to an idea.</h2><p className="studio-muted">Drafts and saved versions stay on this installation. They aren’t publicly published.</p>
    {deletion.feedback}<div className="studio-draft-list">{drafts.filter(item => !deletion.hidden.includes(item.id)).map(item => <article key={item.id} data-draft-id={item.id}>
      <Link prefetch={false} href={`/studio?draft=${item.id}`}><span>{item.title}</span><small>{item.status === "ready" ? `Ready to play · v${item.latest_saved_version}` : "Draft saved"}</small></Link>
      <button type="button" className="management-delete" disabled={deletion.busy} aria-label={`Delete story · ${item.title}`} onClick={event => void deletion.requestDelete(item.id, event.currentTarget)}>Delete story</button>
    </article>)}</div>{deletion.confirmation}
  </section>;
}
