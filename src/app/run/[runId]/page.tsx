import { notFound } from "next/navigation";
import { SavedReader } from "@/components/saved-reader";
import { Id, type Snapshot } from "@/lib/story-engine/contracts";
import { EngineError } from "@/lib/story-engine/errors";
import { getEngine } from "@/lib/story-engine/runtime";
import { getSavedOpeningScenery } from "@/lib/creator/waiting-artwork";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function SavedRun({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params; if (!Id.safeParse(runId).success) notFound();
  let snapshot: Snapshot;
  try { snapshot = getEngine().snapshot(runId); }
  catch (error) { if (error instanceof EngineError && error.status === 404) notFound(); throw error; }
  return <SavedReader initial={snapshot} openingSceneryIds={getSavedOpeningScenery(snapshot)} />;
}
