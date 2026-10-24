# POC 05 — continuous reading and progressive images

Date: 2026-10-24. Branch: `feat/seamless-reading`, created from `706bb4a6938851b3c0f93e0582b7507b08dd74eb` after confirming it matched `origin/feat/platform-experience`. Local implementation only; no push or merge. Existing narratives, references, saved runs and prior evidence were preserved.

**Evidence boundary:** all new generation tests use synthetic local providers. No paid OpenAI call was made. Official documentation supports the implemented preview path, but actual account streaming access and performance remain unverified. POC 04.1's live story and its approximately 87-second image request are historical observations, not a POC 05 benchmark.

## Root cause and correction

The baseline browser reproduction retained both `performance.timeOrigin` and the exact `.saved-reader` DOM element: no full document navigation or whole-reader remount occurred. Instead:

- Loading feedback was inserted above the decision, moving its document position by 120.78px.
- Completed narrative panels were inserted before the single reused decision form, moving it by 2,344.53px from its original position.
- `scrollIntoView()` explicitly moved the viewport by 228px.
- Replacing the selected options with the next question also changed the form's height.

`ReaderDecision` now owns a stable keyed decision for each step. It remains before its associated chapter and keeps the selected action and instruction as read-only history. Its status area is reserved from the start. Panels append below that decision; the next decision follows the pair. There is no automatic navigation or scrolling. Stable panel IDs and fixed aspect ratios preserve earlier illustrations and panel geometry through partials/finals. Existing serialized authoritative status reads remain to prevent concurrent snapshots rolling the UI backward.

The original three options stay visible after submission, with the selected one marked. This intentionally preserves the decision's dimensions; compacting history would need a separate layout/scroll strategy. English copy, warm light theme, independent requests, explicit recovery and collapsed Developer details remain.

## Verified streaming and cost

Official sources checked **2026-10-24**:

| Source | Verified takeaway |
| --- | --- |
| [Flare model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | Exact configured model supports image input/editing; implementation allows its alias and dated snapshot only |
| [Image streaming](https://developers.openai.com/api/docs/guides/image-generation#streaming) | Images edits support `stream:true` and 0–3 partials; final output may arrive without a requested preview |
| [Edit streaming events](https://developers.openai.com/api/reference/resources/images/edit-streaming-events) | `image_edit.partial_image` provides preview bytes; `image_edit.completed` provides the final and usage |
| [Output settings](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output) | Existing portrait size, JPEG/compression and quality settings remain supported; no model/quality downgrade needed |
| [Costs and latency](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) | A partial adds 100 image-output tokens; it is not proof of faster final completion |

The edit reference Markdown fetch returned 404. The official edit endpoint OpenAPI specification and separate guide/model/event pages were available; missing content was not invented. Details and links are recorded in [API references](references/technical/api-references.md).

The saved reader opts into NDJSON from its existing image endpoint. The SDK requests **one real partial within the same reference-edit call**, preserving two independent concurrent calls. The server validates JPEG preview bytes and forwards a transient event; the client displays it inside the existing panel. A final event follows existing validated asset/receipt/database persistence. Only the saved snapshot supplies a canonical local asset URL. Previews are never stored as completed images or reused after refresh.

The legacy JSON endpoint behavior, original experiment, text mode and other configured models retain their existing final-only workflow. There is no paid fallback if streaming fails. Truncated, invalid or aborted streams cannot become a successful image merely because a preview arrived; unknown-cost attempts stay accounted for, and retries remain explicit and isolated. Claim fencing suppresses stale preview/persistence callbacks.

At the verified $30/million image-output rate, one partial's allowance is **$0.003**, or up to $0.012 for four delivered previews. The supported low Flare reference reservation increases from $0.071 to **$0.074**; initial script plus two images reserves **$0.1544**. Older pending events are atomically topped up before claiming; insufficient budget blocks provider work. Completed history is unchanged. Returned completion usage is reconciled normally, without adding the planning amount a second time. Limits and reservations remain application guards, not provider billing caps. See [cost details](docs/api-cost-model.md).

## Latency investigation and changes

No live provider bottleneck or speedup was established. The existing pipeline already dispatches both image requests concurrently after validated dialogue paints. It reuses saved references and final assets. No extra narrative request, lower quality, text-only substitution, or extra image generation was added.

The visible delay is improved by immediate in-place status, an authored noir-palette placeholder and the earliest genuine partial the provider sends. Final JPEGs decode before appearing independently. A cached image that finished loading before React hydration previously risked missing its load callback; the new component also checks already-complete assets on mount and decodes once. Pending generation copy is hidden from assistive technology when a canonical final is available.

The existing 650ms fade is retained and included in visual-completion measurements; reduced-motion preferences shorten it. It is a presentation effect, not claimed generation progress. Status refreshes after settlement remain serialized for consistency; removing them without a snapshot ordering contract would introduce stale-state risk.

New observations distinguish:

| Measurement | Meaning / limitations |
| --- | --- |
| Narrative response | Browser submit through received/validated snapshot, including HTTP and server work |
| Server narrative / validation | Existing SDK duration plus separate local state-validation duration; neither isolates provider compute |
| Browser text-ready | Dialogue DOM committed and a paint opportunity yielded before image dispatch; background-tab fallback remains |
| Image request start | Offset from that continuation's submission, per independent panel |
| First preview | Server receipt, browser receipt and decoded/faded display; absent when no partial arrives |
| Full image request | Server stream duration and browser request duration kept separate |
| Asset transfer | Resource Timing `responseEnd - responseStart`, when available; excludes queueing/TTFB and is not added again to totals |
| Decode after load | Explicit `img.decode()` wait after load or cached-asset detection, not the browser's entire decoder CPU time |
| Visual completion | Both final images decoded and finished fading, measured from submission |
| Total request flow | All image requests and serialized status reads settled; distinct from visual completion |

Observations are keyed by node and paid image operation ID. Retry/replay retains panel IDs but cannot overwrite the original attempt's timing. Current-visit observations export in diagnostics; a saved reload has no new generation latency measurement.

## Before/after browser evidence

Controlled local HTTP fixtures, Chrome at 1440px. Values describe geometry, not OpenAI performance:

| Observation | Baseline `706bb4a` | POC 05 |
| --- | ---: | ---: |
| Main document navigations on decision | 0 | 0 |
| Entire reader replaced | no | no |
| Decision displacement on submission | +120.78px | 0px |
| Decision displacement after first script | +2,344.53px | 0px |
| Viewport movement after first script | +228px | 0px |
| Existing panel position/size change during preview/final | not collected | 0px |
| Second decision through ending | not collected | 0px viewport/decision movement |

The test holds real DOM references and checks both decisions, earlier panels, dialogue-first dispatch, reverse image completion, final ending, explicit script recovery and truncated-preview recovery. At 1024px it checks reduced motion, failure/retry, restored final images and no horizontal overflow. Four image streams finish before the restart check; saved image paths and provider-call counters remain unchanged after reload and process restart.

Raw local evidence is under ignored `test-results-engine/poc05/`: `baseline-decision-movement.json`, `continuous-reader-measurements.json`, `stream-failure-measurements.json`, `narrative-recovery-measurements.json`, and `restart-evidence.json`. These are repeatable functional fixtures, not representative latency statistics.

One final mock run also exercised the diagnostic download (`mocked-browser-timings.json`). Its provider deliberately waits 500ms for narrative, emits partials after 120ms, and completes panel 2 after 1,800ms versus panel 1 after 3,600ms. **These observed browser values validate instrumentation only; they are not OpenAI speed measurements:**

| Browser observation | First continuation | Second continuation |
| --- | ---: | ---: |
| Narrative response | 526.1ms | 523.3ms |
| Text ready | 530.9ms | 528.8ms |
| Panel 1 / 2 dispatch offset | 531.1 / 531.4ms | 528.8 / 529.2ms |
| First preview received | 670.8ms | 668.6ms |
| First preview fully displayed, including fade | 1,347.5ms | 1,323.7ms |
| Panel 1 / 2 request durations | 3,640.4 / 1,838.8ms | 3,641.1 / 1,843.1ms |
| Both requests/status reads settled | 4,174.4ms | 4,176.5ms |
| Both finals visually complete | 4,830.5ms | 4,840.4ms |

Tiny local fixture asset transfer/decode observations were 0–0.3ms and are not representative of generated image payloads. The two image dispatches differed by less than 1ms. The fade contributes about 650ms to fully-visible timestamps; provider performance cannot be inferred from these configured delays. Restart took 210ms in this local run, with four finished image streams, zero failed/active streams, unchanged saved paths and zero new generation calls.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | 82 passed across 15 files; all 62 baseline tests retained |
| `npm run test:engine:build` | Production webpack build passed in isolated `.next-engine/` |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` | 9 passed, including all 6 prior persistent-reader tests |
| `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3113 npm run test:e2e` | All 8 original experiment browser tests passed; isolated production server with test key and unreachable provider |
| Paid OpenAI tests | **0 calls** |

Coverage added: SDK edit event handling and compatibility; truncated/error/final validation with usage retention; cancellation and stale claims; idempotent streamed stages; older reservation top-up and budget rejection; fragmented client streams and terminal events; operation-scoped timing; browser continuity, preview/final geometry, accessibility and reload/restart.

The first full browser run caught the cached-image/hydration issue; the same ready-image assertion passes after the fix. Restart testing also exposed a harness shutdown stall with a completed browser visit still open. A separate Node 24 loopback reproduction showed `server.close()` waiting on a zero-byte speculative connection until the client closed. The harness now consumes its readiness HTTP response, and the new restart test closes the finished browser context **after** verifying all four generation streams finished and reload made no calls, then restores the story in a fresh context after an actual graceful process restart. No active generation is killed, no restart timeout is raised, and no production shutdown code changes. Earlier restart tests remain intact. Node's existing experimental SQLite warning remains.

## Desktop screenshots

Local artifacts are intentionally ignored, not bundled as public product assets:

- `test-results-engine/poc05/first-previews-desktop.png`: genuine streamed **mock** preview events; tiny synthetic fixture images, not generated artwork.
- `test-results-engine/poc05/complete-story-desktop.png` and `complete-story-1024.png`: both decisions and ending with mock images, diagnostics collapsed.
- `test-results-engine/poc05/interrupted-preview-desktop.png`: honest failed-image state, successful sibling retained.
- [Saved choice and continuation, 1440px](test-results-engine/poc05/reused-poc41-decision-1440.png) and [1024px](test-results-engine/poc05/reused-poc41-decision-1024.png).
- [Illustrated reading strip, 1440px](test-results-engine/poc05/reused-poc41-continuation-1440.png) and [1024px](test-results-engine/poc05/reused-poc41-continuation-1024.png).
- [Whole saved story](test-results-engine/poc05/reused-poc41-fullpage-1440.png).

The `reused-poc41-*` screenshots show the updated UI with **existing POC 04.1 live artwork**, read from a temporary database/files copy. Generation was disabled with a test key/unreachable provider and browser mutation blocking. Evidence confirms original DB/WAL hashes, generation events and costs unchanged; these are UI screenshots, not new live generation or streaming evidence. Diagnostics were collapsed and both desktop widths visually inspected. Artifact links are local and unavailable in a source-only Git checkout.

## Remaining limitations and recommendation

- Live preview delivery, account access, partial usage and timing need a separately authorized bounded test. Documentation and mocked streams do not establish these outcomes.
- A provider may finish without a preview. Preview output has a small additional cost and no guaranteed final-latency benefit.
- The request remains active while streaming; process/network interruption still uses existing durable leases and explicit recovery. No background worker or automatic retry was introduced.
- First-preview and visual measurements are browser-local and may be affected by background tabs, scheduling, cache and animation preferences. Missing measurements remain absent.
- Streaming uses a bounded single-preview/terminal-event workload rather than a generalized backpressure pipeline. Proxies may buffer a stream; this is a local app, not a public deployment validation.

Recommend one separately authorized reference-mode live story to verify preview delivery and compare the new phase timings, then decide whether the 650ms fade or serialization overhead is material. Do not infer a three-second text target or improved provider generation speed from synthetic tests. No library, new genre, authentication or platform expansion was added.
