# Usage, estimated cost and local guards — POC 03–05

Pricing source checked **2026-10-24**: [OpenAI Standard API pricing](https://developers.openai.com/api/docs/pricing). Capability check: [image guide](https://developers.openai.com/api/docs/guides/image-generation), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). POC 02's measured comparison remains historical evidence, not the price table or a representative cost benchmark.

## Versioned prices

`src/lib/story-engine/cost.ts` stores `openai-standard-2026-10-24`. New reservations use it through **2026-11-22 UTC**; on 2026-11-23 it expires. Recheck official pricing and deliberately update/version the table before extending validity. Prices are not fetched silently in a generation request.

| Model, Standard rate per 1M tokens | Text input | Cached text input | Image input | Output |
| --- | ---: | ---: | ---: | ---: |
| GPT-4.1 mini | $0.40 | $0.10 | — | $1.60 text |
| GPT Image 2.5 Flare / Sunburst | $5.00 | not applied | $8.00 | $30.00 image |

Supported known aliases and documented snapshots are explicitly enumerated in code. Other configured models remain **unpriced**. Images API edits/generations do not receive the Responses-only image caching discount. No Batch rate, taxes, credits, tier discount or guessed fixed per-image price is included.

Known usage cost:

- Narrative: `((input − cached_input) × .40 + cached_input × .10 + output × 1.60) / 1e6`.
- Images: `(text_input × 5 + image_input × 8 + image_output × 30) / 1e6`.
- Reference component: `image_input × 8 / 1e6`, reported separately; it is **included** in image total, never added twice.

Amounts are stored as integer **micro-USD**, rounded upward once per request. Aggregation may therefore exceed the unrounded formula by less than one micro-dollar per known call. The event captures the price version when planned, so a valid existing reservation can be reconciled after the table expires. Actual/resolved narrative model lives in returned metrics; image model is the requested model because that response has no resolved snapshot.

## Measured, estimated, and unknown

- **Measured usage** means tokens returned by the provider, with request ID, requested model/quality/mode, duration and optional cached/modality details. Totals with missing usage are not guesses at missing tokens. Failed calls may also return usage; preserve it.
- **Estimated spend** means measured token counts multiplied by the captured verified rates. It is not an invoice or a confirmed charge. Invalid token totals, missing cached narrative detail or image modality split leave cost unknown.
- **Unknown cost** means a claimed attempt lacks valid usage or a verified price. Timeouts, disconnects, provider errors and lease interruptions can be billed even when no result appears. Each is recorded/counts against hard limits. Unpriced reservations and unknown-cost attempts are visible separately.
- **Planning amount held** is an allowance reserved before a call, not measured usage or money charged. Failed attempts without usage retain that allowance. Known usage replaces its allowance even if image persistence or narrative validation fails.

Current planning allowances: narrative 4,000 input + 3,000 output tokens; image 2,000 text input + 2,000 reference-input tokens for B only, plus 1,500/5,000/10,000 output tokens for low/medium/high. POC 05 adds **100 output tokens** to supported Flare reference-image reservations for one requested partial image. This gives $0.0064/script, $0.055/low A image, and **$0.074/low Flare B image** (previously $0.071). Reference models without the implemented preview path retain the $0.071 low allowance. These are deliberately explicit estimates, not measured panel prices, promises of sufficient tokens, or API-enforced limits. The narrative request caps output at 3,000 tokens. Image output sizes/quality are fixed by existing POC 02 parameters; no expensive quality escalation is automatic.

For illustration, a Flare B story initially reserves **$0.1544** for its first script and pair. After settlement it reserves the second chapter against known spend plus remaining held amounts. Defaults give room for four planned story images and up to two explicit image retries/replay calls; existing unknown charges may consume budget sooner.

### POC 05 partial-image allowance

The [official image guide](https://developers.openai.com/api/docs/guides/image-generation#partial-images-cost), checked **2026-10-24**, specifies 100 additional image-output tokens per partial image: **$0.003** at the verified $30/million rate. The implementation requests one partial within each existing independent reference edit; it does not make another generation request. A final image may arrive without a partial. The reservation conservatively holds the allowance even when no preview is delivered or a legacy JSON caller uses the final-only path.

Returned completion usage remains the accounting source. Do **not** add the $0.003 planning estimate again to `usageCost`; this would double-count an allowance as if it were separate measured usage. Optional metrics record requested/received partial counts and first-partial elapsed time separately. If the stream ends before a completion event with usage, cost remains unknown and its reservation remains held. Returned valid usage is retained even if final image bytes fail validation.

Older pending image records can retain the former reservation. `claimImage` checks a larger current verified estimate inside its existing SQLite transaction and tops up the same event before claiming it. If the additional amount exceeds the run budget, the request is blocked before provider work. Completed events and historical usage are not rewritten. This adds no call slot, retry or billing-cap promise.

## Hard limits, atomic reservation and retries

Settings in `.env.example` (new runs snapshot values; editing environment does not rewrite existing runs):

| Setting | Default / supported bounds |
| --- | --- |
| `LUNATOON_MAX_STEPS` | 2 / 1–2; final configured step ends |
| `LUNATOON_MAX_IMAGE_CALLS` | 6 / 2–12 |
| `LUNATOON_MAX_SCRIPT_CALLS` | 3 / 1–6 |
| `LUNATOON_RUN_BUDGET_USD` | $0.30 / greater than 0, at most $10 |
| `OPENAI_IMAGE_QUALITY` | low; medium/high explicit server configuration |
| `LUNATOON_DATA_DIR` | `./data`; persists across restarts |

Before a new continuation, reserve one script and two image slots **together**. Estimated known spend + held allowances + proposed allowances must fit the run's budget. Attempted calls + unstarted reservations must fit hard stage counts. The same SQLite transaction inserts the node/events or rolls everything back. Explicit image retries reserve only one slot; narrative retry reserves a new script and its two still-unstarted images. When a script fails, unused image plans are cancelled and their allowances/slots released. A same-script replay reserves exactly two new image calls, without another narrative call or state update.

Operation IDs, unique DB constraints, a transactional claim and leases prevent concurrent duplicate work. Call attempts are counted when claimed, conservatively including failures/interruptions; a crash immediately after claim can count an attempt that never reached the provider. Retries require an explicit user action/new operation ID, and the official SDK has `maxRetries: 0`. There is no auto-fallback from B to A, alternate model or quality. A failed reference edit remains a failed reference edit.

When pricing is unknown/expired, the UI marks it unpriced and the monetary guard only covers known amounts. **Hard call/step counts remain enforced.** No invented dollar estimate is used to suggest protection that does not exist. To stop all new unpriced provider work operationally, remove/disable the key rather than treating a dollar figure as known.

These are **application controls, not an absolute provider billing cap**. In-flight calls can exceed token allowances, usage can be incomplete, a request can finish after timeout/recovery, and API use outside this run/application is not covered. Actual known usage above its reservation is recorded honestly and blocks later reservations if over budget; it cannot undo a billable request. Configure provider-side billing controls separately as needed. The app does not promise provider billing behavior.

## Timing and comparison

Server event metrics preserve narrative and each image SDK/request duration. `validation_ms` measures local chapter/state application validation, excluding SQLite commit time. For streamed images, duration extends through stream completion; `first_partial_ms` measures time until a real partial reaches the server. Persistent node elapsed time includes scheduling, idle time and recovery waits; it is not provider compute time.

The saved reader reports browser text-ready and per-image/total **request-flow** times only for generation performed in the current visit. Its request total ends after disk/DB settlement/status reads. POC 05 separately records preview receipt/display and final asset transfer, decode and visual completion after its fade. These measures have different endpoints; neither request-flow total nor visual completion should be relabeled as provider compute time. Missing resource timing or preview events remain absent, not zero. A reload has no new generation benchmark. Diagnostic downloads include attempt metadata and current-visit observations.

POC 02's unchanged reader retains its detailed request/validation/decode measurements and same-script comparison. Its one live comparison found 4.810s text-ready and 16.823s total for A, with 12.002s A vs 11.381s B concurrent image phases and higher B cost. These remain one dated sample; no speedup or 3-second target success is inferred for POC 03. This iteration adds immediate loading feedback separately from actual text readiness.

POC 03 automated provider usage and delays are **synthetic fixtures**. No new live latency, image-quality result, price paid or API-access confirmation is claimed. See `POC_03_RESULTS.md`.

POC 05 streaming checks are also **mocked SDK/HTTP and browser tests**. No paid call or live streaming validation has been performed in this iteration. Previous live final-image results do not establish preview availability, latency or billed usage for this project.
