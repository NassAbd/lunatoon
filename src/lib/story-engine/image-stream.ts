import { z } from "zod";
import { Id, SnapshotSchema } from "./contracts";

export const IMAGE_STREAM_CONTENT_TYPE = "application/x-ndjson";
export const ImagePreviewSchema = z.object({
  type: z.literal("preview"),
  panel_id: Id,
  image_url: z.string().max(28_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  elapsed_ms: z.number().nonnegative(),
}).strict();
export const ImageStreamEventSchema = z.discriminatedUnion("type", [
  ImagePreviewSchema,
  z.object({ type: z.literal("settled"), snapshot: SnapshotSchema }).strict(),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }).strict(),
]);
export type ImagePreview = z.infer<typeof ImagePreviewSchema>;
export type ImageStreamEvent = z.infer<typeof ImageStreamEventSchema>;
export type IllustrationPreview = Pick<ImagePreview, "image_url" | "elapsed_ms">;
export type OnIllustrationPreview = (preview: IllustrationPreview) => void;
export function supportsImagePreviews(model: string) {
  return ["gpt-image-2.5-flare", "gpt-image-2.5-flare-2026-09-08"].includes(model);
}
