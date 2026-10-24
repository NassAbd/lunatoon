import { SnapshotSchema, type Snapshot } from "./story-engine/contracts";
import { ImageStreamEventSchema, type ImageStreamEvent } from "./story-engine/image-stream";

// A preview is transient. Only a settled snapshot can identify a durable asset.
export async function consumeImageResponse(response: Response, onPreview: (event: Extract<ImageStreamEvent, { type: "preview" }>) => void): Promise<Snapshot> {
  if (!response.ok) throw new Error("This illustration request could not finish. Check saved progress before trying again.");
  if (!response.headers.get("Content-Type")?.includes("application/x-ndjson")) return SnapshotSchema.parse(await response.json());
  if (!response.body) throw new Error("The illustration connection closed. Check saved progress before trying again.");
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let pending = ""; let settled: Snapshot | undefined;
  const accept = (line: string) => {
    if (line.length > 28_100_000) throw new Error("The illustration response exceeded the supported size.");
    if (!line.trim()) return;
    if (settled) throw new Error("Unexpected data after the saved illustration result.");
    const event = ImageStreamEventSchema.parse(JSON.parse(line) as unknown);
    if (event.type === "preview") onPreview(event);
    else if (event.type === "settled") settled = event.snapshot;
    else throw new Error(event.message);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) { accept(pending.slice(0, newline)); pending = pending.slice(newline + 1); }
      if (pending.length > 28_100_000) throw new Error("The illustration response exceeded the supported size.");
      if (done) break;
    }
    if (pending.trim()) accept(pending);
    if (!settled) throw new Error("The illustration connection was interrupted. Check saved progress before explicitly retrying.");
    return settled;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
