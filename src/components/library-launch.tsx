"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { ImageApproach } from "@/lib/contracts";
import type { StoryTemplate } from "@/lib/story-engine/contracts";
import { StartSavedRun } from "./start-saved-run";

export function LibraryLaunch({ referenceSupported, template }: { referenceSupported: boolean; template?: StoryTemplate }) {
  const referenceAvailable = referenceSupported && (!template || template.reference_asset_ids.length > 0);
  const [approach, setApproach] = useState<ImageApproach>(referenceAvailable ? "reference" : "text");
  const modeId = useId();
  const playable = !template || template.status === "ready";
  return <div className="library-launch">
    {playable ? <StartSavedRun approach={approach} simple templateId={template?.id} templateVersion={template?.version} /> : <p>{template.status === "draft" ? "Draft" : "Coming soon"}</p>}
    {playable && template && !template.reference_asset_ids.length && <p className="book-saving-note">Illustrations use this story’s written visual guide. No reference images attached.</p>}
    <Link className="story-info-link" href={`/story/${template?.id ?? "neon-protocol"}`}>About this story <span aria-hidden="true">↗</span></Link>
    {playable && <details className="book-developer"><summary>Developer details</summary><div className="book-details-body">
      <label htmlFor={modeId}>Image approach</label><select id={modeId} value={approach} onChange={event => setApproach(event.target.value as ImageApproach)}><option value="text">A · Text only</option><option value="reference" disabled={!referenceAvailable}>B · Reference edit</option></select>
      {template && !template.reference_asset_ids.length && <p>This story has no reference images. Text-only illustration is selected.</p>}
      <p>Starting a run makes no paid calls. Each continuation requests one script and two images. Reference input can cost more. Run budgets and hard call limits apply.</p>
      <Link href="/experiment">Open the original experiment</Link>
    </div></details>}
  </div>;
}
