import sharp from "sharp";
import type { ImageResponse, Metrics } from "../contracts";
import { generateIllustration, getClient, GenerationError } from "../server/ai";
import type { OnIllustrationPreview } from "../story-engine/image-stream";
import { EngineError } from "../story-engine/errors";
import { OpeningImageSchema, type OpeningImageInput } from "./opening-contracts";
import { OPENING_PROMPT_VERSION, openingMemory, openingScene } from "./opening-plan";
import type { OpeningContext } from "./opening-store";
import { creatorFailure } from "./provider";
import { CreatorStore } from "./store";

export interface OpeningProvider {
  prepare(): void;
  image(context: OpeningContext, signal?: AbortSignal, onPreview?: OnIllustrationPreview): Promise<ImageResponse>;
}
export function openAIOpeningProvider(): OpeningProvider {
  return {
    prepare() { getClient(); },
    image(context, signal, onPreview) {
      return generateIllustration(getClient(), openingScene(context.panel, context.foundation), signal, context.approach, { ...openingMemory(context.foundation), prompt_version: OPENING_PROMPT_VERSION, references: context.references.map(asset => ({ bytes: asset.bytes, mime: asset.mime, name: `${asset.id}.png` })), models: { image: context.model, quality: context.quality } }, onPreview);
    },
  };
}
async function finalJPEG(url: string) {
  const prefix = "data:image/jpeg;base64,";
  if (!url.startsWith(prefix) || url.length > 28_000_000) throw new GenerationError("invalid_opening_image", "The returned illustration was not a usable JPEG. No automatic retry was made.");
  const encoded = url.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new GenerationError("invalid_opening_image", "The returned illustration could not be decoded. No automatic retry was made.");
  const bytes = Buffer.from(encoded, "base64");
  try {
    if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("jpeg");
    const image = sharp(bytes, { failOn: "warning", limitInputPixels: 16_777_216 });
    const metadata = await image.metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) !== 1) throw new Error("dimensions");
    await image.raw().toBuffer(); // Full decode, not only a plausible JPEG header.
    return { bytes, width: metadata.width, height: metadata.height };
  } catch { throw new GenerationError("invalid_opening_image", "The returned illustration failed its image check. Its returned usage was retained; no automatic retry was made."); }
}

export class OpeningService {
  constructor(readonly store: CreatorStore, private readonly provider: OpeningProvider = openAIOpeningProvider()) {}
  async generate(id: string, version: number, panelId: string, value: OpeningImageInput, signal?: AbortSignal, onPreview?: OnIllustrationPreview) {
    const input = OpeningImageSchema.parse(value);
    const replay = this.store.replayOpening(id, version, panelId, input); if (replay) return replay;
    signal?.throwIfAborted();
    const context = this.store.getOpeningContext(id, version, panelId);
    // Local credentials and owned references are checked before a billable claim.
    this.provider.prepare();
    const claim = this.store.claimOpening(id, version, panelId, input);
    if (!claim.claim_token || !claim.attempt) return this.store.replayOpening(id, version, panelId, input) ?? this.store.getDraft(id);
    const { attempt, claim_token: token } = claim;
    let metrics: Metrics | null = null;
    let final: Awaited<ReturnType<typeof finalJPEG>>;
    try {
      const deadline = AbortSignal.timeout(180_000);
      const result = await this.provider.image(context, signal ? AbortSignal.any([signal, deadline]) : deadline, onPreview ? preview => {
        if (this.store.isOpeningClaimActive(id, version, panelId, attempt.id, token)) onPreview(preview);
      } : undefined);
      metrics = result.metrics;
      if (!this.store.recordOpeningReceipt(id, version, attempt.id, token, metrics)) return this.store.getDraft(id);
      final = await finalJPEG(result.image_url);
    } catch (error: unknown) {
      if (error instanceof EngineError && error.code === "content_deleted") throw error;
      const failure = creatorFailure(error); metrics ??= failure.metrics;
      const safe = { ...failure.error, request_id: failure.error.request_id ?? metrics?.request_id ?? null };
      if (!(error instanceof GenerationError)) safe.message = "This illustration could not be completed. Its cost may be unknown. Review its details before explicitly trying again.";
      return this.store.finishOpening(id, version, attempt.id, token, { metrics, error: safe });
    }
    // Persist only the verified final. Commit errors remain distinct from model
    // errors and are never automatically retried or turned into new paid work.
    return this.store.finishOpening(id, version, attempt.id, token, { ...final, metrics });
  }
}
