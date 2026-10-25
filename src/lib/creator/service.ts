import type { Metrics } from "../contracts";
import type { StoryFoundation } from "../story-engine/contracts";
import { validateStoryFoundation } from "../story-engine/state";
import { FoundationPromptSchema, GenerateFoundationSchema, type GenerateFoundationInput } from "./contracts";
import { creatorFailure, openAICreatorProvider, type CreatorProvider } from "./provider";
import { CreatorStore } from "./store";

export class CreatorService {
  constructor(readonly store: CreatorStore, private readonly provider: CreatorProvider = openAICreatorProvider()) {}
  async generate(draftId: string, value: GenerateFoundationInput, signal?: AbortSignal) {
    const input = GenerateFoundationSchema.parse(value);
    const replay = this.store.replayGeneration(draftId, input);
    if (replay) return replay;
    // Check missing local credentials before reserving a billable attempt. This
    // hook does no network work, and mock providers use a no-op implementation.
    this.provider.prepare();
    const claim = this.store.claimGeneration(draftId, input);
    if (!claim.claim_token) return this.store.getDraft(draftId);
    let metrics: Metrics | null = null;
    let foundation: StoryFoundation;
    try {
      const prompt = FoundationPromptSchema.parse(Object.fromEntries(Object.keys(FoundationPromptSchema.shape).map(key => [key, input[key as keyof GenerateFoundationInput]])));
      // The deadline covers receiving the whole response, not only headers.
      const deadline = AbortSignal.timeout(180_000);
      const result = await this.provider.foundation(prompt, claim.attempt.model, signal ? AbortSignal.any([signal, deadline]) : deadline);
      metrics = result.metrics;
      foundation = validateStoryFoundation(result.foundation);
    } catch (error: unknown) {
      const failure = creatorFailure(error); metrics = metrics ?? failure.metrics;
      failure.error.request_id ??= metrics?.request_id ?? null;
      return this.store.finishGeneration(draftId, claim.attempt.id, claim.claim_token, { metrics, error: failure.error });
    }
    // A storage failure is not rejected model output. Do not retry the commit or
    // provider here; a lost response remains fenced for explicit lease recovery.
    return this.store.finishGeneration(draftId, claim.attempt.id, claim.claim_token, { foundation, metrics });
  }
}
