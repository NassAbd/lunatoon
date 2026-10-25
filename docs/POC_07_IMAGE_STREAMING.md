# POC 07 — image streaming decision

Checked **2026-10-24, 16:50–16:53 UTC**, on `feat/reader-finale`. This is a fresh documentation check and read-only audit of the installed SDK, provider, browser path and existing POC 05.1 observation proxy. **No paid OpenAI experiments, account-access requests or new live latency measurements were performed.**

**Decision:** retain the existing Flare reference-edit request, `low` quality, JPEG, compression 85, portrait 1024×1536, `stream:true` and one requested partial. Render genuine previews when delivered; remain useful when the same request returns only its final image. None of the checked documentation establishes a setting that guarantees an early preview.

## Six requested official sources

All links were checked again for this iteration, rather than inferred from earlier notes.

| Source | Retrieval and relevant finding |
| --- | --- |
| [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) | Official Markdown fetched. Direct Images API fits a single edit from a prompt; references and image outputs are supported. The guide distinguishes the faster everyday Flare model from Sunburst's editing emphasis. |
| [Image streaming](https://developers.openai.com/api/docs/guides/image-generation#streaming) | Official section fetched. `partial_images` accepts 0–3. A positive value does not guarantee the requested number: the final may finish before partials. No preview deadline is stated. |
| [Image edit streaming events](https://developers.openai.com/api/reference/resources/images/edit-streaming-events) | Official Markdown fetched. `image_edit.partial_image` has renderable `b64_json`, a zero-based index and output metadata. `image_edit.completed` supplies final bytes and usage with separate text/image input tokens. These are edit events, distinct from generation and Responses-tool event names. |
| [Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit) | Official documentation tool's `.md` fetch returned **404** again. The official HTML page opened successfully and lists Flare, its dated snapshot, references, `stream`, `partial_images`, output settings and quality options. This is a Markdown retrieval limitation, not an unavailable endpoint. |
| [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | Official Markdown fetched. Alias `gpt-image-2.5-flare`; current documented snapshot `gpt-image-2.5-flare-2026-09-08`. Text/image inputs, image outputs and editing are supported. |
| [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) | Official Markdown fetched. Standard Flare rates remain $5/M text-input, $8/M image-input and $30/M image-output tokens. The cached-input discount applies to Responses image generation, not direct Images edits. |

Documentation establishes API support, not current access for a particular account. POC 05.1 established this project's access at that time. POC 07 did not recheck account permissions or the resolved snapshot behind the alias.

## Supported behavior versus promises

| Question | Established | Not established |
| --- | --- | --- |
| Can the existing model edit a character reference and stream? | The edit endpoint supports the exact alias and dated snapshot. The installed SDK supports multipart `images.edit` with streaming. | That every successful stream includes a partial image. |
| Are low quality, JPEG and portrait output compatible? | Yes. The [output guide](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output) supports the current settings and recommends JPEG when latency matters. | A documented incompatibility between low quality/JPEG/reference inputs and partials. |
| Does requesting more partials force earlier delivery? | Up to three can be requested. | Minimum count, first-preview deadline, or earlier useful delivery from a larger count. |
| Do alias and snapshot differ in preview reliability? | The current model page names both. | Any preview advantage from pinning the snapshot; completed image events do not identify a resolved model snapshot. |
| Does a reference guarantee identical characters? | References provide visual input. | Perfect consistency; the guide expressly lists recurring-character consistency and exact composition as limitations. |
| Does stream completion provide cost evidence? | The final edit event documents token usage, including reference input. | An invoice, a hard dollar cap, or known usage for a response that ends before usage arrives. |

Partial images are individual renderable images delivered in events. The API does not promise continuous scanline rendering or a smooth succession of frames. The application must not manufacture progress from elapsed time, sharpen a placeholder and call it a generated preview, or interpret absent preview timing as zero seconds.

## What the existing live evidence says

The existing ignored `test-results-live/poc-05-1/ledger.json` was re-read using only call counts, statuses and event types. It contains **two narrative calls and four image calls**; each image response contains exactly one `image_edit.completed` event and no `image_edit.partial_image` event. These are **historical POC 05.1 observations**, not new POC 07 experiments.

The observation proxy records events before they reach the SDK or application. Consequently, application/browser buffering cannot account for the missing partial events in that sample. The docs permit this final-only outcome. They do not identify why those four requests omitted partials, so explanations such as low quality, JPEG, reference editing or provider scheduling remain hypotheses.

The prior [live report](archive/poc/POC_05_1_RESULTS.md) records browser dialogue readiness of 5.526s and 4.409s, with both final images decoded at 17.224s and 15.318s from their respective submissions. The four server image durations were 11.663s, 11.086s, 10.346s and 10.868s. One story is not a latency distribution; there is no new POC 07 speedup claim. Genuine preview display/replacement is covered by mocked tests, not demonstrated by that live run.

## Current local path, inspected directly

Installed versions are OpenAI SDK **6.49.0**, Next.js **16.4.3**, Node **24.14.0**.

1. **SDK and request:** `node_modules/openai/src/resources/images.ts` exposes the streaming edit overload and multipart transport. `src/lib/server/ai.ts` calls `images.edit(...).withResponse()`, saves the request ID, then iterates events. It requests one partial only for an explicitly supported Flare alias/snapshot with reference input and a preview callback. `maxRetries:0` prevents automatic SDK retries. The reference bytes, prompt, size, quality and compression are the same as the final image request; there is no separate preview call.
2. **Event validation/accounting:** `ai.ts` checks event type, JPEG/base64 boundaries and final usage. It forwards a partial immediately after validation, records its first receipt, and rejects truncated streams, duplicate finals and a partial after a final. Final usage is retained even if subsequent byte validation fails. The iterator is consumed through completion; a preview is never promoted to a final image. Nonstreaming/text-only or unsupported-preview configurations use their original single request, not an automatic alternate paid request after failure.
3. **Persistent stage:** `src/lib/story-engine/provider.ts` passes the saved visual memory/reference to the request. `src/lib/story-engine/service.ts` checks the active claim before forwarding a partial. Only final bytes are recorded/written and committed; expired claims cannot replace current state. Preview callbacks do perform a synchronous snapshot/claim check. There is no measurement showing this check delays previews materially, and removing it would sacrifice the late-result fence.
4. **Application transport:** `src/app/api/runs/[runId]/panels/[panelId]/image/route.ts` returns `application/x-ndjson` with `Cache-Control: no-store, no-transform`. Each callback enqueues a preview record, then the route emits a settled snapshot after persistence. Browser disconnect cancellation is propagated to the provider; it does not start a replacement call. No whole-response buffering is present. The route does not implement explicit slow-consumer backpressure; requested partial count and payload limits bound ordinary preview volume.
5. **Browser:** `src/lib/image-stream-client.ts` decodes chunks incrementally, validates every record with `src/lib/story-engine/image-stream.ts`, and rejects EOF without a settled result. `src/components/saved-reader.tsx` starts both image requests concurrently after dialogue paint; previews are keyed by persistent panel ID. Completed siblings display independently. Serialized authoritative reads after completion protect against stale sibling snapshots. `src/components/reader-illustration.tsx` decodes images before revealing them and handles assets that loaded before hydration. The UI uses actual receipt/decode/display observations, not invented progress.
6. **Private observation proxy:** ignored `test-results-live/poc-05-1/proxy-core.mjs` forwards each upstream chunk before parsing its diagnostic copy, handles socket backpressure and imposes a 180-second deadline. It records event metadata/usage, not preview artwork. Its existence does not establish that an arbitrary deployment proxy streams correctly; deployment is outside this iteration.

The application SDK's 180-second timeout is cleared when `fetch()` returns response headers (`node_modules/openai/src/client.ts`, `fetchWithTimeout`). It is **not a whole-stream-body deadline**. The app has claim leases/fencing and explicit recovery, but a silent open SSE body remains a known reliability limitation. Route `maxDuration` is not a portable local-server body timer. The private proxy's deadline did not become production application behavior. Adding a tested whole-stream abort could address stalls later; it would not create missing preview events or prove lower generation latency.

The POC 06 Chrome investigation also found raw Fetch-body EOF could coexist with a browser `net::ERR_ABORTED` report. Its [retained audit](../references/technical/POC_06_STREAMING.md#browser-completion-reporting-investigation) records the isolated no-provider reproduction and upstream issue. Verification therefore separately requires actual EOF, a validated settled result, persisted images and no unresolved streams, while retaining failure diagnostics. It does not excuse genuine truncated streams or justify buffering the response.

## Pricing and option decision table

The [cost guide](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) states that each partial adds **100 image-output tokens**, or **$0.003** at the verified Standard rate. `src/lib/story-engine/cost.ts` conservatively reserves 100 extra output tokens for supported reference streaming and calculates estimated actual cost from returned usage, without adding the allowance again. Requesting a partial alone does not establish delivery or a separately billable partial. Reference-input cost remains separately visible as a component of total cost. No direct-edit cache savings are assumed.

| Option | Benefit / tradeoff supported by evidence | POC 07 decision |
| --- | --- | --- |
| Keep Flare, reference edit, low/JPEG/portrait, one partial | Existing complete live story succeeded; optional streaming preserves visual inputs and concurrency. Early previews remain optional. | **Keep.** Honest final-only waiting must work well. |
| Request two or three partials | More possible intermediate events; each delivered partial adds 100 output tokens. No earlier-delivery guarantee. | Do not change without a separately authorized comparison. |
| Increase quality to medium/high/xhigh/max | Officially supported; may improve detail. Token consumption and latency can differ. No preview guarantee. App currently exposes only low/medium/high, and installed SDK quality types predate xhigh/max. | Keep existing quality; neither raise nor lower it merely to chase previews. |
| Change JPEG to PNG/WebP or alter compression | Formats supported; JPEG already has the guide's latency recommendation. Different payload/appearance tradeoffs need measurement. | Keep JPEG/compression 85. |
| Shrink dimensions or reference artwork | May change composition, readability, identity detail and token use. The old GPT Image 2 square-speed statement is not a Flare-specific guarantee. | Keep portrait size and immutable reference. |
| Pin the documented Flare snapshot | Can make the requested version explicit. Does not establish different streaming behavior or account access. | Keep configured alias; do not claim a preview fix. |
| Switch to Sunburst | Guide favors its editing precision; equal token rates do not mean equal token consumption or latency. It is a different model, not this tested path. | No model substitution. |
| Move image work to the Responses image tool | Supports image inputs and multi-turn edits; adds mainline-model usage/orchestration. Cached image-input prices are Responses-only, and cache counts are not exposed in usage. Still no preview deadline. | No backend migration for speculative preview benefits. |
| Text-only or separate cheap preview request | Changes the reference approach or adds paid work and a second image to reconcile. | Reject for this iteration. |

No tiny SDK/provider optimization is justified by the measured evidence. Concurrent dispatch already occurs within milliseconds; historical local narrative validation was below 3ms. Removing validation, changing model settings, eagerly starting images before validated dialogue, or eliminating safe snapshot ordering would trade reliability for unmeasured gains. Keep truthful immediate stage feedback and previously available content visible; any cosmetic reveal/scroll refinement must be reported separately from provider or text-ready latency.

This research changes documentation only. Existing tests were inspected for partial/final, truncation, usage, retry, independent completion and reload coverage; no new test result or live generation is claimed here. POC 07's implementation validation is reported separately by the main iteration.
