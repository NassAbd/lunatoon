"use client";
import { useRef, useState } from "react";
import { SnapshotSchema } from "@/lib/story-engine/contracts";
import { useRouter } from "next/navigation";
import type { ImageApproach } from "@/lib/contracts";

export function StartSavedRun({ approach, simple = false, templateId, templateVersion, label }: { approach: ImageApproach; simple?: boolean; templateId?: string; templateVersion?: number; label?: string }) {
  const router = useRouter(); const operation = useRef<{ scope: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError("");
    const scope = JSON.stringify([templateId, templateVersion, approach]);
    if (operation.current?.scope !== scope) operation.current = { scope, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation_id: operation.current.id, approach, ...(templateId ? { template_id: templateId, template_version: templateVersion } : {}) }) });
      if (!response.ok) throw new Error("Could not create the saved run. Check local server settings.");
      const snapshot = SnapshotSchema.parse(await response.json()); router.push(`/run/${snapshot.run.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the saved run."); setBusy(false); }
  }
  return <div className={simple ? "book-start" : "saved-start"}><button type="button" className={simple ? "book-primary" : "generate-button"} disabled={busy} onClick={start}>{busy ? "Opening saved story…" : label ?? (simple ? "Begin the story" : "Start a persistent story")}</button>{!simple && <p className="approach-note">POC 03 · Two decisions and an ending. Saved locally. Starting a run makes no AI calls; uses the selected image mode.</p>}{error && <p role="alert">{error}</p>}</div>;
}
