# POC 04 — P0 diagnostic checkpoint; platform gate blocked

**Status: partial implementation. The observed live second-decision defect is not claimed fixed. P1/P2 are deferred.**

Branch `feat/platform-experience` was created from verified clean POC 03.1 commit `0ba638144c2701cbd6ebb6edd163107afcd3d86d`. No main merge, force push, paid generation, data reset or modification of existing saved runs occurred.

## Evidence from the latest local tests

SQLite was opened read-only. Two saved runs have a completed first chapter with two images, followed by a failed second narrative chapter. Each second chapter has two failed narrative attempts; its reserved image stages were cancelled without calls. Both use prompt version `persistent-neon-03.1`, so the old source-clue gate is not assumed to explain them.

| Second-chapter attempts, grouped by run | Input tokens | Output tokens | Stored error |
| --- | ---: | ---: | --- |
| A, first attempt | 3,316 | 729 | `stage_failed` |
| A, explicit retry | 3,316 | 769 | `stage_failed` |
| B, first attempt | 3,416 | 857 | `stage_failed` |
| B, explicit retry | 3,416 | 806 | `stage_failed` |

These are **retained usage from the user's earlier live requests**, not calls executed in this iteration or representative benchmarks. Usage-based costs already stored by the engine were preserved; no new invoice or latency estimate is made. Provider request IDs remain in event metrics, but the failure's `error.request_id` was null. Neither the underlying exception nor rejected chapter was retained. Private run IDs, narrative text, asset paths and provider request IDs are intentionally omitted here.

Source inspection narrows the failures to **after the narrative provider returned a parsed chapter and metrics, during local chapter/state validation or persistence**: the service assigns `metrics` after awaiting the provider and passes them to `store.fail` if `finishScript` throws. Ordinary continuity checks throw `EngineError` and keep `invalid_story_state`; non-EngineError exceptions were instead flattened to `providerFailure(...).stage_failed`. Thus a cross-field Zod error, database exception or unexpected local exception can become indistinguishable in these historical records.

This identifies the **diagnostic-loss bug**, not the exact historical second-decision cause. Successful first chapters and retained state do not reveal what the rejected ending contained. No new origin rule, relaxed invariant, deterministic content rewrite or speculative paid retry was introduced.

## Implemented, verified correction

- Add backward-compatible, optional `error.diagnostics` with stage phase, error kind/type, bounded field paths and stable validation-rule codes, plus numeric SQLite code where available.
- Distinguish provider parsing, chapter validation, state validation, node commit, panel commit, usage commit and otherwise unclassified script commit errors. Preserve inner phases rather than replacing them with the outer catch location.
- Preserve the returned request ID and token usage for failures after a narrative response. Refusal and incomplete-response classifications stay intact. SDK parsing failures without returned metrics remain explicitly unpriced/unknown instead of inventing usage or request IDs.
- Give existing panel order/ID/dialogue uniqueness errors field paths. Their acceptance/rejection rules are unchanged.
- Replace a non-null assertion on an image reservation with an explicit missing-reservation error; it still rolls back the chapter and cannot issue a paid image request.
- Expose attempt error code, phase, type, field rules and SQLite code inside the existing collapsed **Developer details → Request accounting details**. Downloads retain this metadata. Old errors remain readable without inventing a historical phase or requiring a migration.
- Do not log or persist new raw exception messages, input values, arbitrary keys, stacks, provider bodies, credentials or rejected narrative payloads. Field names are allowlisted; unknown path components are replaced with `field`; rules use static identifiers. Existing local story data keeps its original privacy/backup scope.

No narrative validation criteria, strict output schema, model, prompt, pricing table, budget, paid retry policy, image mode, state-transition semantics or persistent asset behavior changed.

## Regression evidence and limits

A **controlled** second chapter with duplicate dialogue IDs reproduced the pre-change loss: `stage_failed`, null error request ID, but known usage. After the change it reports `invalid_chapter_contract`, `phase=chapter_validation`, `panels.1.dialogues: dialogue_ids_unique`, and the returned request ID. The test proves that error propagation/accounting defect. **It does not prove that duplicate IDs caused the user's historical failures.**

Tests also cover safe omission of arbitrary private text from errors, schema versus continuity/database/unexpected classifications, inner-phase preservation, SDK parsing errors and old saved error compatibility. The browser scenario keeps the first two images/state and known spend when the second script fails; refresh does not retry, and an explicit corrected mock retry completes only the second pair. The complete story survives an actual test app-process restart without new generation. The original successful-path browser test now also restarts/reloads after its ending.

### Executed checks

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — **55 pass**, preserving all original 51 and adding four diagnostic regression cases.
- `npm run test:engine:build` — pass; regular production webpack build isolated in `.next-engine/`.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` — **6 pass**, official SDK against the local fake provider and isolated temporary SQLite/files.
- `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e` — **8 original reader tests pass**.

The suites retain text-before-images, independently arriving/out-of-order images, isolated image retry, duplicate-submission protection, budget/call guards, immutable references, saved state, no calls on refresh and process restart. Synthetic delays/tokens and mocked success are not live quality/latency/access evidence. The separate paid harness was not run.

## P0 gate and deferred deliverables

The live completion problem remains **unresolved** because the actual exception/response was discarded, and the user confirmed no additional logs exist. The successful mocked story and fixed diagnostic-loss bug are insufficient to claim the observed live cause was identified. A reproducible failure with the new safe phase/rule metadata, or a captured underlying exception from another source, is needed before a targeted root-cause correction can be verified.

Both affected runs have consumed their snapshotted three-script allowance (first chapter plus two failed second-chapter attempts). Their history and limits were not rewritten or silently increased. Existing runs never regenerate completed assets on load. Any future paid reproduction must be separately authorized and bounded; no paid test is assumed authorized by this checkpoint.

Per the user's P0 gate, no new opening sequence, two-story library, preview card, wordmark/favicon, benchmark research package or platform UX screenshots are shipped. The existing light reader and POC 03.1 screenshots remain unchanged. There is no new preview-only story to misrepresent as playable.

**Recommendation:** review this diagnostic checkpoint, then use newly available failure metadata to identify the actual cause. Only after that fix and its P0 regressions pass should P1/P2 and their UI research/brand documents proceed. No claim is made that a live four-panel story or POC 04 platform experience has been verified.
