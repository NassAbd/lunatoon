"use client";
import Link from "next/link";
import { useState } from "react";
import { INITIAL_CONTEXT, type ImageApproach } from "@/lib/contracts";
import { StoryHeader, StoryOpening } from "./story-book";
import { StartSavedRun } from "./start-saved-run";
export function StoryWelcome({ referenceSupported }: { referenceSupported: boolean }) {
  const [approach, setApproach] = useState<ImageApproach>(referenceSupported ? "reference" : "text");
  return <div className="story-reader"><StoryHeader home /><main className="book-flow">
    <StoryOpening src="/neon-protocol.svg" context={INITIAL_CONTEXT} />
    <section id="about" className="book-invitation"><p className="book-eyebrow">A STORY SHAPED BY YOU</p><h2>Where does Kael go from here?</h2><p>Read. Make a choice. Add a little of your imagination.<br />See your story unfold, one illustrated chapter at a time.</p><StartSavedRun approach={approach} simple /><p className="book-saving-note">Two choices. One ending. Saved on this device.</p></section>
    <details className="book-developer"><summary>Developer details</summary><div className="book-details-body"><label htmlFor="start-mode">Image approach</label><select id="start-mode" value={approach} onChange={e => setApproach(e.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!referenceSupported}>B · Reference edit</option></select><p>Starting a run makes no paid calls. Each continuation requests one script and two images. Reference input can cost more. Run budgets and hard call limits apply.</p><Link href="/experiment">Open the original experiment</Link></div></details>
    <footer className="book-footer">A little moonlight. A different story.</footer>
  </main></div>;
}
