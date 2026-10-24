import { isReferenceModelSupported } from "../art-direction";
import type { ImageApproach, Metrics } from "../contracts";
import { GenerationError } from "../server/ai";
import { stageError } from "./failure-diagnostics";
import { EngineError } from "./errors";
import { providerFailure, type StoryProvider } from "./provider";
import { StoryStore } from "./store";

export class StoryEngine {
  constructor(readonly store: StoryStore, private provider: StoryProvider) {}
  snapshot(runId: string) { this.store.recoverExpired(runId); return this.store.snapshot(runId); }
  private supports(approach: ImageApproach, model: string) {
    if (approach === "reference" && !isReferenceModelSupported(model)) throw new EngineError("reference_unsupported", "Select text mode or a documented accessible GPT Image 2.5 model. No alternate paid mode will be used.", 400);
  }
  async decide(runId: string, input: { operation_id: string; choice_id: string; instruction: string }, signal?: AbortSignal) {
    const saved = this.snapshot(runId);
    this.supports(saved.run.approach, saved.run.models.image);
    const node = this.store.createNode(runId, input);
    return this.script(runId, node.id, { operation_id: node.operation_id, retry: false }, signal);
  }
  async script(runId: string, nodeId: string, input: { operation_id: string; retry: boolean }, signal?: AbortSignal) {
    const snapshot = this.snapshot(runId); const node = snapshot.nodes.find((node) => node.id === nodeId);
    if (!node) throw new EngineError("not_found", "This node does not belong to the saved run.", 404);
    const existing = snapshot.events.find(event => event.operation_id === input.operation_id);
    if (existing && (existing.node_id !== nodeId || existing.stage !== "script")) throw new EngineError("operation_conflict", "Operation ID belongs to another stage.");
    if (node.chapter || snapshot.events.some((event) => event.operation_id === input.operation_id && event.status !== "planned")) return snapshot;
    this.provider.prepare();
    const claim = this.store.claimScript(runId, nodeId, input); if (!claim) return this.snapshot(runId);
    let metrics: Metrics | null = null; let responseReceived = false;
    try {
      const context = { bible: snapshot.bible, state: node.before, step: node.step, max_steps: snapshot.run.limits.max_steps, choice: node.choice, instruction: node.instruction, recent_panels: snapshot.panels.filter((panel) => snapshot.nodes.some((old) => old.id === panel.node_id && old.step < node.step)).map((panel) => panel.script).slice(-4) };
      const result = await this.provider.script(context, snapshot.run.models, signal); metrics = result.metrics; responseReceived = true;
      this.store.finishScript(claim, result.chapter, result.metrics);
    } catch (error: unknown) {
      if (error instanceof GenerationError) metrics ??= error.metrics;
      const failure = responseReceived ? stageError(error, "script_commit") : error;
      this.store.fail(claim, failure instanceof EngineError ? { code: failure.code, message: failure.message, request_id: metrics?.request_id ?? null, diagnostics: failure.diagnostics } : providerFailure(failure), metrics);
    }
    return this.snapshot(runId);
  }
  async image(runId: string, panelId: string, input: { operation_id: string; retry: boolean }, signal?: AbortSignal) {
    const snapshot = this.snapshot(runId); const panel = snapshot.panels.find((panel) => panel.id === panelId);
    if (!panel) throw new EngineError("not_found", "This panel does not belong to the saved run.", 404);
    const existing = snapshot.events.find((event) => event.operation_id === input.operation_id);
    if (existing && (existing.panel_id !== panelId || existing.stage !== "image")) throw new EngineError("operation_conflict", "Operation ID belongs to another stage.");
    if (existing && existing.status !== "planned") return snapshot;
    const planned = existing ?? snapshot.events.filter((event) => event.panel_id === panelId).at(-1);
    this.supports(planned?.approach ?? snapshot.run.approach, planned?.model ?? snapshot.run.models.image);
    const reference = planned?.approach === "reference" ? this.store.readAsset(runId, "kael_reference").bytes : Buffer.alloc(0);
    this.provider.prepare();
    const claim = this.store.claimImage(runId, panelId, input); if (!claim) return this.snapshot(runId);
    let metrics: Metrics | null = null;
    try {
      const result = await this.provider.image(panel, snapshot, claim, reference, signal); metrics = result.metrics;
      if (result.panel_id !== panel.script.panel_id) throw new EngineError("panel_mismatch", "The image result belongs to another panel.", 502);
      const relative = this.store.recordImageReceipt(claim, metrics);
      if (relative) { this.store.writeImage(relative, Buffer.from(result.image_url.split(",")[1], "base64")); this.store.finishImage(claim); }
    } catch (error: unknown) { if (error instanceof GenerationError) metrics ??= error.metrics; this.store.fail(claim, providerFailure(error), metrics); }
    return this.snapshot(runId);
  }
  replay(runId: string, nodeId: string, input: { operation_id: string; approach: ImageApproach }) {
    const snapshot = this.snapshot(runId); this.supports(input.approach, snapshot.run.models.image);
    this.store.replay(runId, nodeId, input); return this.snapshot(runId);
  }
}
