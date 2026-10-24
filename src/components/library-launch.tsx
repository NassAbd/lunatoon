"use client";
import Link from "next/link";
import { useState } from "react";
import type { ImageApproach } from "@/lib/contracts";
import { StartSavedRun } from "./start-saved-run";

export function LibraryLaunch({ referenceSupported }: { referenceSupported: boolean }) {
  const [approach, setApproach] = useState<ImageApproach>(referenceSupported ? "reference" : "text");
  return <div className="library-launch">
    <StartSavedRun approach={approach} simple />
    <Link className="story-info-link" href="/story/neon-protocol">About this story <span aria-hidden="true">↗</span></Link>
    <details className="book-developer"><summary>Developer details</summary><div className="book-details-body">
      <label htmlFor="library-mode">Image approach</label><select id="library-mode" value={approach} onChange={event => setApproach(event.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!referenceSupported}>B · Reference edit</option></select>
      <p>Starting a run makes no paid calls. Each continuation requests one script and two images. Reference input can cost more. Run budgets and hard call limits apply.</p>
      <Link href="/experiment">Open the original experiment</Link>
    </div></details>
  </div>;
}
