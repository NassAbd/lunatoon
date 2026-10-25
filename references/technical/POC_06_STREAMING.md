# POC 06 — streaming and latency audit

Checked **2026-10-24**, approximately 15:24–15:30 UTC. This audit used official documentation, installed source, and existing POC 05.1 evidence. **No new OpenAI generation or account-access requests were made.** POC 06 retains reference editing, the configured Flare model, low quality, concurrent independent images, strict narrative validation, and existing cost controls.

## Verified sources and retrieval limits

| Official source | Checked result |
| --- | --- |
| [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) and [streaming](https://developers.openai.com/api/docs/guides/image-generation#streaming) | Images and Responses APIs support streaming; requesting partials does not guarantee their delivery. |
| [Flare model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | Exact alias `gpt-image-2.5-flare`; current documented snapshot `gpt-image-2.5-flare-2026-09-08`; image input and editing supported. |
| [Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit) | HTML page opened successfully. Official documentation tool's `.md` fetch returned **404**; the official OpenAPI endpoint specification was also retrieved. It includes multipart SDK examples and an SSE response. The Markdown failure is a retrieval limitation, not evidence that editing is unavailable. |
| [Image edit streaming events](https://developers.openai.com/api/reference/resources/images/edit-streaming-events) | Exact edit event names, renderable base64 payloads, output settings, and completed-event usage verified. |
| [Customize image output](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output) | Existing JPEG, compression and portrait size supported. JPEG is recommended when latency matters. |
| [Image cost and latency](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) | Flare token rates, partial-image surcharge and direct Images API cache limitation verified. |
| [Latency: output tokens](https://developers.openai.com/api/docs/guides/latency-optimization#generate-fewer-tokens) and [input tokens](https://developers.openai.com/api/docs/guides/latency-optimization#use-fewer-input-tokens) | Shorter outputs can reduce generation time; input trimming usually offers a smaller benefit. These are general recommendations, not Lunatoon measurements. |

## Support matrix

| Setting or behavior | Documentation | Existing implementation / evidence |
| --- | --- | --- |
| Flare alias and dated snapshot | Both support reference editing | App explicitly allows both; POC 05.1 requested the alias. Image events do not prove the resolved model snapshot. |
| `stream:true`, `partial_images:1` | Supported; allowed partial count is 0–3 | App sends these on the reference-edit path when the browser accepts its streaming contract. |
| Low quality, JPEG, 1024×1536, compression 85 | Supported | Same settings succeeded in all four POC 05.1 edits. No setting change is proposed to chase previews. |
| `image_edit.partial_image` | May contain a renderable intermediate image; indexed from zero | Runtime validates the JPEG and forwards a transient NDJSON preview. Mocked tests cover receipt/display/replacement. No POC 05.1 live partial arrived. |
| `image_edit.completed` | Contains final image and usage with text/image input breakdown | App validates it, accounts usage, saves only the final image and returns a settled snapshot. Four live finals succeeded. |
| Guaranteed early preview / deadline | No such guarantee found | The UI must remain useful when only a final arrives. First-preview timings remain null when absent. |

The requested partial count is an upper delivery expectation, not a promise. The guide allows the final image to finish before requested partials. It does **not** establish a Flare-specific low-quality threshold, a JPEG restriction, a guaranteed preview time, or that increasing quality/count will produce an earlier useful preview. Pinning the documented snapshot has no documented preview advantage over its alias.

Flare Standard rates remain $5/M text-input, $8/M image-input and $30/M image-output tokens. Each delivered partial adds 100 image-output tokens, corresponding to $0.003 at this rate. The application reserves a conservative 100-token allowance and reconciles against returned usage without adding it twice. A request for a preview alone is not evidence of delivered or billed preview tokens. Direct `/v1/images/edits` requests do not receive the guide's Responses-tool cached-input pricing.

## What the missing previews establish

The ignored POC 05.1 ledger, `test-results-live/poc-05-1/ledger.json`, records **four SSE responses, each containing one completed event and zero partial events**. This observation is upstream of the OpenAI SDK and the app's browser stream. The proxy records event metadata while forwarding received chunks immediately; it does not wait for the whole image response before forwarding. Its offline tests demonstrated incremental forwarding and deadline handling.

Consequently, app-side buffering cannot explain the absent partial events in that sample. The evidence does not distinguish provider scheduling, low-quality execution characteristics or another provider-side reason. Describing the run as proof of live preview delivery would be incorrect. Endpoint access and final-only streamed completion were demonstrated on that account then; account access was not rechecked during POC 06.

## SDK, application and persistence audit

Inspected Node 24.14.0, OpenAI SDK 6.49.0 and Next.js 16.4.3:

- `src/lib/server/ai.ts` uses the official `images.edit` streaming iterator, captures the HTTP request ID and handles the documented edit event names. The installed SDK yields decoded SSE events as they arrive. Automatic SDK retries remain disabled.
- `src/lib/story-engine/service.ts` passes previews only while the original claim remains current. Preview bytes are not written to the database or filesystem. Final receipt/accounting and image persistence remain fenced against expired claims.
- The image route keeps its response body open, enqueues one NDJSON record per preview and emits a final settled snapshot. `Cache-Control: no-store, no-transform` is set. A disconnect aborts the provider request; no replacement paid request is started.
- `src/lib/image-stream-client.ts` parses records incrementally and rejects a stream without a settled result. `saved-reader.tsx` starts both image requests after dialogue paint, handles each completion separately, and serializes authoritative snapshot refreshes to prevent stale sibling responses rolling back the UI. Those reads can perform existing lease/asset recovery, but never schedule new generation.
- Successful final bytes are validated and decoded before display. Existing cached-image hydration handling avoids waiting for an `onLoad` event that occurred before React attached it.

This code audit and mocked transport coverage support an incremental local path. They are not proof about arbitrary deployment proxies; deployment is outside scope. The SDK timeout is cleared once response headers arrive, so the app still has no explicit whole-SSE-body timer. Leases/fences protect saved state but cannot alone terminate a silent open stream. POC 05.1's private observation proxy imposed a 180-second forwarding deadline. This remains an application reliability limitation, not an explanation for its four successful final-only streams.

## Existing phase measurements

All values below come from the **single POC 05.1 story**, not a fresh POC 06 benchmark. Full evidence and cost accounting are in [POC_05_1_RESULTS.md](../../docs/archive/poc/POC_05_1_RESULTS.md).

| Phase | Activation | Destruction / ending |
| --- | ---: | ---: |
| Server narrative (SDK/network/parsing) | 5.491s | 4.380s |
| Local narrative validation | 2.051ms | 0.445ms |
| Browser dialogue ready, from submission | 5.526s | 4.409s |
| Image 1 server duration | 11.663s | 10.346s |
| Image 2 server duration | 11.086s | 10.868s |
| Browser request flow complete | 17.217s | 15.312s |
| Both final images decoded | 17.224s | 15.318s |
| Both fades complete | 17.902s | 15.998s |
| First preview received / displayed | Not delivered | Not delivered |

The two image dispatches were 0.2ms and 0.3ms apart. In the first pair, the second panel decoded about 569ms before the first. The browser/server narrative differences of 35ms and 29ms combine several local/network/presentation phases; they are not isolated network or paint measurements. Provider queue time, time to first narrative token and model-only generation time were not measured separately. Validation was small in these observations; removing validation would neither justify the risk nor explain several seconds of waiting.

## POC 06 recommendations and limits

1. Retain optional genuine previews and the same-request final-only path. Present accurate writing/illustrating/saved states immediately, without percentages, simulated previews or time estimates. Keep dialogue, completed sibling images and prior chapters readable while waiting.
2. Shorten the existing 650ms image reveal to a subtle 220ms transition as a presentation refinement, with reduced-motion support. This removes deliberate display delay; it does not make OpenAI, text readiness or final image generation faster. POC 06 must report browser verification separately from historical live timing.
3. Preserve the existing two-request concurrency and dialogue-paint boundary. The baseline has no evidence of a meaningful serialization gap to remove. Keep serial authoritative refreshes unless a tested monotonic merge can replace them; removing them casually risks stale state.
4. Keep the validated narrative contract and current successful prompt in this iteration. Concise panel prose and omission of non-narrative asset metadata are possible future prompt experiments, but require quality/continuity evaluation. Lowering `max_output_tokens` below a safe margin risks an incomplete JSON response rather than guaranteeing faster complete output.
5. Do not add a second image request, switch to text-only, increase quality/count, shrink reference artwork or adopt another model merely to obtain previews. None is established as an improvement here. A Responses image-tool alternative can retain image input, but adds another model's usage and orchestration changes without a preview guarantee; it is not warranted by this evidence.

No additional provider or SDK optimization is justified by the current measurements. Client reuse alone does not establish a connection/latency improvement; local serialization/validation costs do not support a backend rewrite. Any later speedup claim requires separately authorized comparable live observations. The three-second text target remains unmet, and this documentation makes no new live performance claim.

## Browser completion reporting investigation

During the POC 06 mocked browser gate, Chrome reported `net::ERR_ABORTED` for completed image POSTs although all final images were saved and displayed. A separate synthetic loopback HTTP probe reproduced the discrepancy without Next.js, application code, credentials or OpenAI: all 12 raw-reader responses per arm reached EOF with the final record, while Playwright reported 7 failures with ordinary `releaseLock()`, 7 when response/reader references remained alive, 10 when only the response remained alive, 9 with `cancel()` after EOF, and 7 with a declared content length. A native `response.text()` diagnostic control completed 12/12 without reported failures. These are finite observations, not reliability rates; the result does not justify treating arbitrary request failures as success.

The independently opened [Playwright issue #42742](https://github.com/microsoft/playwright/issues/42742) describes this `no-store` streaming discrepancy. A maintainer linked a [Chromium fix](https://chromium-review.googlesource.com/c/chromium/src/+/8508456) and reported it available in canary on October 21, 2026. This source corroborates the diagnosis; it does not establish which installed browser builds contain the fix.

The probe and exact observed counts are retained locally under ignored `test-results-live/poc-06/chrome-stream-eof-probe.mjs` and `chrome-stream-eof-probe-result.json`. The contemporaneous app trace identified Chrome 156.0.8078.4; the isolated probe used the `chrome` channel without independently printing its version. Application response handling and cache policy remain unchanged. Browser verification should retain terminal-network diagnostics and separately require actual reader EOF, a validated settled record, saved completion, no unresolved streams and genuine truncated/error-stream rejection. Removing successful-EOF cleanup or buffering the entire response is not supported as a fix by this probe.
