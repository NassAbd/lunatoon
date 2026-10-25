"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { INITIAL_CONTEXT, type ImageApproach } from "@/lib/contracts";
import type { StoryTemplate } from "@/lib/story-engine/contracts";
import { StoryHeader, StoryOpening } from "./story-book";
import { StartSavedRun } from "./start-saved-run";
export function StoryWelcome({ referenceSupported, template, assetUrls }: { referenceSupported: boolean; template?: StoryTemplate; assetUrls?: Record<string, string> }) {
  const referenceAvailable = referenceSupported && (!template || template.reference_asset_ids.length > 0);
  const [approach, setApproach] = useState<ImageApproach>(referenceAvailable ? "reference" : "text");
  const modeId = useId();
  const protagonist = template?.initial_state.characters.find(character => character.id === template.protagonist_id)?.name ?? "Kael";
  const playable = !template || template.status === "ready";
  return <div className="story-reader"><StoryHeader /><main className="book-flow">
    <StoryOpening src="/neon-protocol.svg" context={INITIAL_CONTEXT} template={template} assetUrls={assetUrls} />
    <section id="about" className="book-invitation"><p className="book-eyebrow">A STORY SHAPED BY YOU</p><h2>Where does {protagonist} go from here?</h2><p>Read. Make a choice. Add a little of your imagination.<br />See your story unfold, one illustrated chapter at a time.</p>{playable ? <><StartSavedRun approach={approach} simple templateId={template?.id} templateVersion={template?.version} />{template && !template.reference_asset_ids.length && <p className="book-saving-note">Illustrations use this story’s written visual guide. No reference images attached.</p>}<p className="book-saving-note">Two choices. One ending. Saved on this device.</p></> : <p className="book-saving-note">{template.status === "draft" ? "This story is still a draft." : "Coming soon."}</p>}</section>
    {playable && <details className="book-developer"><summary>Developer details</summary><div className="book-details-body"><label htmlFor={modeId}>Image approach</label><select id={modeId} value={approach} onChange={e => setApproach(e.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!referenceAvailable}>B · Reference edit</option></select>{template && !template.reference_asset_ids.length && <p>This story has no reference images. Text-only illustration is selected.</p>}<p>Starting a run makes no paid calls. Each continuation requests one script and two images. Reference input can cost more. Run budgets and hard call limits apply.</p><Link href="/experiment">Open the original experiment</Link></div></details>}
    <footer className="book-footer">A little moonlight. A different story.</footer>
  </main></div>;
}
