import type { Metrics } from "../contracts";
import type { GenerationEvent } from "./contracts";

export const PRICES = { version: "openai-standard-2026-10-24", checked_at: "2026-10-24", expires_at: "2026-11-23", source: "https://developers.openai.com/api/docs/pricing" };
export function verifiedPrice(model: string, now = Date.now()): "script" | "image" | null {
  if (now < Date.parse(PRICES.checked_at) || now >= Date.parse(`${PRICES.expires_at}T00:00:00Z`)) return null;
  if (["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14"].includes(model)) return "script";
  if (["gpt-image-2.5-flare", "gpt-image-2.5-flare-2026-09-08", "gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst-2026-09-08"].includes(model)) return "image";
  return null;
}
// Integer micro-USD. These token allowances are planning estimates, not token or billing caps.
export function reservation(event: Pick<GenerationEvent, "model" | "stage" | "approach" | "quality">, now = Date.now()): number | null {
  const kind = verifiedPrice(event.model, now);
  if (kind !== event.stage) return null;
  if (kind === "script") return Math.ceil(4000 * 0.4 + 3000 * 1.6);
  const outputAllowance = { low: 1500, medium: 5000, high: 10000 }[event.quality];
  return 2000 * 5 + (event.approach === "reference" ? 2000 * 8 : 0) + outputAllowance * 30;
}
export function usageCost(event: Pick<GenerationEvent, "model" | "stage" | "price_version">, metrics: Metrics | null): { total: number | null; reference: number | null } {
  if (event.price_version !== PRICES.version || !metrics?.usage) return { total: null, reference: null };
  const usage = metrics.usage;
  if (![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(value => Number.isInteger(value) && value >= 0) || usage.total_tokens !== usage.input_tokens + usage.output_tokens) return { total: null, reference: null };
  if (event.stage === "script") {
    if (usage.cached_input_tokens == null || !Number.isInteger(usage.cached_input_tokens) || usage.cached_input_tokens < 0 || usage.cached_input_tokens > usage.input_tokens) return { total: null, reference: null };
    return { total: Math.ceil((usage.input_tokens - usage.cached_input_tokens) * 0.4 + usage.cached_input_tokens * 0.1 + usage.output_tokens * 1.6), reference: 0 };
  }
  if (usage.input_text_tokens == null || usage.input_image_tokens == null || usage.input_text_tokens + usage.input_image_tokens !== usage.input_tokens) return { total: null, reference: null };
  return { total: Math.ceil(usage.input_text_tokens * 5 + usage.input_image_tokens * 8 + usage.output_tokens * 30), reference: usage.input_image_tokens * 8 };
}
export function summarize(events: GenerationEvent[]) {
  const active = events.filter((event) => event.status !== "cancelled");
  const attempts = active.filter((event) => event.started_at != null);
  const planned = active.filter((event) => event.status === "planned");
  return {
    image_calls: attempts.filter((event) => event.stage === "image").length,
    image_slots_reserved: planned.filter((event) => event.stage === "image").length,
    script_calls: attempts.filter((event) => event.stage === "script").length,
    script_slots_reserved: planned.filter((event) => event.stage === "script").length,
    estimated_micro_usd: active.reduce((sum, event) => sum + (event.estimated_micro_usd ?? 0), 0),
    held_micro_usd: active.reduce((sum, event) => sum + (event.estimated_micro_usd == null ? event.reserved_micro_usd ?? 0 : 0), 0),
    reference_input_micro_usd: active.reduce((sum, event) => sum + (event.reference_input_micro_usd ?? 0), 0),
    unknown_cost_attempts: attempts.filter((event) => event.estimated_micro_usd == null && event.status !== "running").length,
    unpriced_reservations: active.filter((event) => event.reserved_micro_usd == null && event.estimated_micro_usd == null).length,
    measured_input_tokens: attempts.reduce((sum, event) => sum + (event.metrics?.usage?.input_tokens ?? 0), 0),
    measured_output_tokens: attempts.reduce((sum, event) => sum + (event.metrics?.usage?.output_tokens ?? 0), 0),
    measured_reference_input_tokens: attempts.filter((event) => event.stage === "image").reduce((sum, event) => sum + (event.metrics?.usage?.input_image_tokens ?? 0), 0),
  };
}
