# API capability notes — checked 2026-10-24

## Actual configuration and access

Read only nonsecret model settings from the local environment: narrative `gpt-4.1-mini`, images `gpt-image-2.5-flare`, quality `low`. The key is configured and remains server-only. Non-generating `models.retrieve` calls succeeded for both IDs in this API project. Metadata access alone does not prove a successful image-edit request; live generation evidence is recorded separately in [the POC 02 decision record](../../docs/archive/poc/POC_02_DECISION.md).

## Strict narrative output

[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) and [GPT-4.1 Mini model card](https://developers.openai.com/api/docs/models/gpt-4.1-mini) were fetched. The model card lists Responses and Structured Outputs. The code keeps the official SDK `responses.parse`, `zodTextFormat`, strict `json_schema`, required object fields, and `additionalProperties: false`. Exactly two ordered panels and one or two dialogue bubbles remain required. Cross-field uniqueness/order checks remain local Zod refinements, outside the provider schema. Refusal and incomplete output are errors, not valid story data.

No narrative model change, separate routing call, streaming of unvalidated JSON, or automatic retry is introduced. `store: false` and the existing maximum output cap remain. Prompts request less duplicated output instead of lowering the cap and risking truncation.

## Image generation and reference edits

Read [image generation](https://developers.openai.com/api/docs/guides/image-generation), [Flare's model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), and the [image edits reference](https://developers.openai.com/api/reference/resources/images/methods/edit).

The reference page's Markdown fetch failed with 404; fetching its HTML succeeded. The image guide provides `images.edit({ image: ... })` multipart examples with `toFile`. SDK 6.49.0 exposes this interface. The JSON reference also documents image-reference objects; this experiment uses the documented multipart path and a local PNG instead.

| Approach | Endpoint / SDK | Inputs and invariants |
| --- | --- | --- |
| A: text | `POST /v1/images/generations`, `client.images.generate` | Improved common art/identity constraints plus each panel's action and shot |
| B: reference | `POST /v1/images/edits`, `client.images.edit` | Same panel prompt plus the same authored `kael-reference.png` in each call |

Both request one image per call, portrait `1024x1536` for the narrative's vertical panels, low quality, JPEG output, compression 85. Existing square/banner contracts still work. The returned JPEG is delivered as a browser-memory data URL. No Files API upload, external storage, reference URL fetching, or generated panel dependency is added.

Reference mode is explicitly selected, not an extra hidden call. It is enabled only for the documented GPT Image 2.5 Flare/Sunburst aliases and 2026-09-08 snapshots. Unknown configured models are rejected before a reference call. The code omits `input_fidelity`: the current reference does not establish configurable fidelity support for Flare as clearly as for older models; no unsupported option is assumed. A failed edit does not trigger a fallback generation or model substitution.

## Concurrency, streaming, and cost

The guide and edit reference document streaming and `partial_images` (0–3). They do not establish access or latency for a specific project's streaming requests. Streaming was not implemented in POC 02/03. POC 05 adds the narrow reference-edit preview path documented below; live streaming remains unverified.

[Standard pricing](https://developers.openai.com/api/docs/pricing) was also fetched. Per 1M tokens, GPT-4.1 Mini is $0.40 input / $0.10 cached input / $1.60 output. Flare is $5 text input / $8 image input / $30 image output. The live comparison returned modality details and zero narrative cached tokens, allowing the dated report's estimate. Images API calls do not receive the Responses-only image caching discount. No Batch rates, guessed fixed per-image prices, discounts, taxes or account credits are applied. The UI keeps raw usage for arbitrary configured models instead of maintaining a generalized pricing engine.

A's two calls are concurrent. B's two calls are also concurrent because each references the fixed authored sheet, not panel 1. A and B are run sequentially to cap concurrent spend and retain inspectable results. There is one shared script for the pair. Reference inputs add payload and potentially billable image-input tokens; B is not assumed faster or cheaper. Usage is reported when available. Do not infer full cost from an output-token rate alone; missing verified modality rates must remain unpriced.

## Timing definitions

- Narrative `duration_ms`: server SDK call, SDK parsing and local validation. Optional `sdk_ms` and `validation_ms` split those steps; SDK time is not isolated provider compute time.
- Browser `request_ms`: fetch through JSON response reading, including server work, route startup, serialization and network transfer. `request_ms - duration_ms` is an unattributed remainder, not proof of a network bottleneck.
- Browser `textReady`: submit to committed dialogue DOM; unchanged full-run meaning. Paint is allowed before image dispatch. A 100ms fallback prevents background-tab rAF suspension from stalling requests.
- Per-image server time: request through base64 result; B includes local PNG reading/form construction. Browser image metrics separately record request/validation/decoding.
- `imagePhase`: concurrent image dispatch to both images decoded. This is the fairer A/B timing because the script is shared.
- Full `total`: submit through both images decoded, before decorative fade finishes. Replays are explicitly labeled **illustration-only** and excluded from full-run target comparison. Reused narrative time and tokens are not reported as new work.

The existing <3s text and <30s completion goals remain experimental. A user-observed 5.58s text-ready value cannot be decomposed retrospectively without its server/request measurements.

## POC 03 addendum — 2026-10-24

The Structured Outputs guide, image generation guide and Standard pricing page above were fetched again for the persistent engine. POC 03 retains the same nonstreaming Responses/Images endpoints, A/B allowlist, independent calls and no automatic retries. Its separate chapter schema adds state updates/causal choices and uses a 3,000-token output cap. The original POC 02 contract and 2,200 cap remain unchanged.

POC 03 stores owned references and generated JPEGs locally and adds a narrow expiring, versioned price table; the earlier browser-memory and unpriced-UI notes describe POC 02. See [cost accounting](../../docs/api-cost-model.md) and [local architecture](../../docs/story-engine-architecture.md). No new project access or live performance claim is made by these documentation checks.

## POC 05 streaming addendum — checked 2026-10-24

Fetched official sources:

- [Flare model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare): exact model and dated snapshot accept image input and support image edits.
- [Image streaming guide](https://developers.openai.com/api/docs/guides/image-generation#streaming): `stream:true`, `partial_images` from 0 to 3; final output can arrive before all requested partials.
- [Image edit streaming event schemas](https://developers.openai.com/api/reference/resources/images/edit-streaming-events): `image_edit.partial_image` carries `b64_json`, index and format/settings; `image_edit.completed` carries final bytes and usage with text/image input details.
- [Output controls](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output): JPEG, compression, portrait dimensions and existing quality settings remain supported.
- [Cost and latency](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency): each partial costs 100 additional image-output tokens; direct Images edits receive no cached-input discount. At $30/million, one partial's planning allowance is $0.003.
- [Limitations](https://developers.openai.com/api/docs/guides/image-generation#limitations): previews do not guarantee faster final completion or exact visual consistency.

The [edit endpoint](https://developers.openai.com/api/reference/resources/images/methods/edit) Markdown fetch again returned **404**. The official OpenAPI endpoint spec for `POST https://api.openai.com/v1/images/edits` fetched successfully and supplies `text/event-stream`, multipart streaming examples and final usage. The separate guide/model/event pages also fetched successfully; no missing page content was inferred.

The installed SDK supports the streaming edit overload and `.withResponse()` for response headers/request ID. Its stream iterator throws provider `data.error` failures, but can end silently on abort; the implementation therefore requires an explicit completed event. It retains safe errors and request IDs, suppresses raw provider exceptions, and preserves returned usage before final-byte validation. No automatic SDK retry or alternate request is introduced.

Only the exact Flare alias/snapshot reference path enables previews in this iteration. It requests **one partial** inside each existing independent image call. Legacy JSON clients and other configured modes/models retain their existing final-only provider path. The app-facing NDJSON contract carries transient preview / durable settled snapshot / safe error messages; completed assets alone enter local persistence. See the architecture and cost documents for reservations, old pending-event top-ups and recovery.

**Evidence boundary:** documentation and mocked SDK/HTTP/browser tests establish implemented request/event handling. No paid OpenAI call or live streaming delivery has been verified in POC 05. Historical successful reference edits establish only their dated nonstreaming behavior. Preview timing, actual partial count, final usage and project availability must be observed in a separately authorized bounded live test before claiming them.
