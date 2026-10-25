# POC 02 — visual consistency, storytelling and latency

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: **2026-10-24**. Branch: `feat/visual-consistency`. Baseline commit: `7a6df63c29bd45d58f8df4e8433529307cb0d109`. Scope: one English, desktop-first, two-panel continuation. No library, studio, accounts, additional story nodes, sharing, database or deployment changes.

## Decision

**Continue with reference mode B for the next demo.** In this one controlled pair it looked closer to the actual flat SVG opening, preserved Kael's angular face/amber eye and kept the square device recognizable. B is preselected only for the documented GPT Image 2.5 model IDs; A stays available. B uses the same two image calls but adds reference-input tokens and costs more. This is a demo choice from one pair, not a representative quality, cost or speed benchmark.

Keep strict narrative parsing, dialogue before images, concurrent per-panel requests, independent display and partial failure behavior. The <3s text target remains unmet in the new full run; the <30s full-completion target was met once. Do not add product scope before further evidence.

## Baseline and before/after examples

The initial source, tests, `SPECS.md`, `README.md` and `POC_RESULTS.md` were inspected. Local `main` matched remote `main`; implementation proceeded from the local tree on the dedicated branch. The historical POC report lacked credentials during its original test session; the user subsequently confirmed real generation and dialogue-first rendering.

The user-observed POC 01 run was approximately **5.58s text-ready / 18.66s both complete**. It has no supplied raw per-stage measurements, request IDs, token counts, or matching input record. It is one observation, not a baseline distribution or evidence of a particular bottleneck. Its generated images were not available for this review, so the earlier style mismatch remains a user observation supported by the old prompt/static-art inconsistency, not a fabricated image rating.

| Concern | Before | After |
| --- | --- | --- |
| Art language | Static opening uses simple angular SVG forms; image prompt asks for “detailed hand-inked linework” | Flat shapes, dark contours, two-tone shadows, named palette, explicit exclusion of realism/microtexture; opening coat/skin aligned to those swatches |
| Identity | Broad character description repeated by the narrative model in every image prompt | Canonical adult face, anatomical left eye/scar, costume and prop anchors appended by the image server; original enlarged face/full-body/reference scene supplied in B |
| Framing | No enforced wide/close distinction | First panel establishes action/consequence; second uses expressive close-up or tight action and a new clue/reaction |
| Script size | Model instructed to regenerate fixed identity/style prose | Short scene-specific directions; server supplies common constraints once per illustration. No lower output cap or new word-count rejection |
| Dialogue | Absolute overlays could collide within the same horizontal band | Preserve text and supported positions; relocate a conflicting second balloon to the opposite band. Prompt quiet zones match resolved positions; desktop text minimum increased to 15px |
| Timing | Narrative, image, total and text-ready counters | Additional SDK/validation, browser request/validation/decode, and concurrent image-phase timing; replays explicitly exclude narrative work |

The live script placed Kael and the cat in a wide station view, then used a close-up with the cat/device data reflection. It followed the framing request. It still repeated some character descriptors and exceeded the requested image-prompt word guidance. Those are soft prompt budgets; the strict two-panel contract correctly remained valid. The origin clue was “hidden message/decryption,” which is causally readable but not a concrete source reveal.

## Exact test protocol and evidence

The user explicitly authorized one live comparison, capped at **one narrative + four images**, with no automatic retries. No initial-scene generation or extra baseline generation was purchased. Both configured model IDs passed non-generating metadata checks first.

- Choice: **Investigate its origin**.
- Twist: **A mysterious cyborg cat suddenly appears.**
- Narrative: configured `gpt-4.1-mini`, returned `gpt-4.1-mini-2025-04-14`.
- Images: requested `gpt-image-2.5-flare`, quality `low`, portrait `1024x1536`, JPEG/compression 85. Image responses do not identify a resolved snapshot.
- A: two independent generation requests with improved common text constraints, concurrently dispatched after dialogue DOM commit.
- B: reused the **identical script and both panel descriptions**, then made two concurrent image-edit requests with the same authored PNG. Neither depended on the other panel. B added reference-preservation instructions, the intentional experimental difference.
- Actual local request counts: **story 1, text images 2, reference edits 2**. All five succeeded. A and B ran sequentially; within each approach both panels ran concurrently.

The live browser harness used actual local Route Handlers and OpenAI responses, with no intercepted API fixtures. It checked identical panel payloads and saved the actual images, reader screenshots and diagnostics. The structured, credential-free evidence is [POC_02_RUN_2026-10-24.json](POC_02_RUN_2026-10-24.json), including request IDs, token counts, shared script, timings and the reference PNG SHA-256. Original images/screenshots/raw exports are retained only under ignored `test-results-live/poc-02-live/`; they are not committed. Review used the four full-resolution image files and the reader overlays. The original B reader capture caught part of the decorative fade; image quality ratings use the completed JPEGs, not their temporary fade opacity. The harness now waits for the fade before future screenshots; no extra paid run was made for that capture-only change.

## Observed performance — one pair only

| Measurement | A: text, fresh script | B: authored reference, script reused |
| --- | ---: | ---: |
| Server narrative | 4.771s | No new narrative request |
| Browser narrative request | 4.790s | Reused |
| Browser text-ready | 4.810s | Reused; not a comparable new text measurement |
| Panel 1 server | 11.969s | 10.479s |
| Panel 2 server | 10.591s | 11.362s |
| Concurrent image phase, including transfer/decode | 12.002s | 11.381s |
| Full submit-to-both-complete | 16.823s | Not measured as a full pipeline |
| Replay submit-to-both-complete | Not applicable | 11.410s, illustration-only |

Narrative SDK request plus parsing took 4.770s; local cross-field validation took 0.313ms. Browser request-minus-server remainder was about 18.8ms, and browser validation took 4.9ms. In **this run**, most text-ready time was inside the SDK round trip and parsing, not local cross-field validation. This does not isolate provider compute from network/SDK processing and cannot explain the earlier 5.58s run retrospectively.

The narrative returned **630 input / 412 output / 1,042 total tokens**, zero cached input, and 1,855 JSON characters. The earlier run's output size is unknown, so there is no measured token-reduction or causal speedup claim. A's 4.81s vs the earlier 5.58s is not a controlled before/after benchmark. Likewise B's shorter image phase in one pair does not establish that reference edits are faster.

## Visual and narrative review

Subjective engineering review, **1–5**, from this actual pair. 1 means materially broken, 3 usable with visible drift, 5 convincing. These are human-style visual judgments, not automated scores or a population estimate.

| Criterion | A | B | Observation |
| --- | ---: | ---: | --- |
| Opening-to-continuation style | 2 | 4 | A keeps a more detailed, textured station and modeled face; B is visibly more angular and flat, especially the close-up. B's background still has more detail than the opening. |
| Kael face, hair, coat and silhouette | 3 | 4 | Both retain brown skin/black hair/yellow coat; B's geometric hair, jaw and collar resemble the authored reference more closely. Not pixel-identical. |
| Eye/scar side continuity | 2 | 4 | A's close-up puts a scar on the opposite brow while eye detail drifts; B preserves the reference's viewer-right amber eye/scar in the frontal close-up. |
| Device continuity | 2 | 4 | A changes from a rounded device to an oblong object. B uses a square cyan-faced device in both frames, closer to the opening. |
| Framing diversity | 5 | 5 | Both clearly change from wide station/crouching figure to an expressive close-up. |
| Dialogue legibility | 5 | 5 | Short high-contrast HTML balloons, no duplicate generated speech lettering, faces remain readable. Separate tests cover two-bubble collision handling. |
| Choice/twist coherence and causal progression | 3 | 3 | The cat appears and participates in a decryption clue; the device's origin remains vague. A stronger source-specific clue is a future narrative refinement. |

Thus the visual result supports using B for the next demo, but does not prove universal identity consistency or fully solve story specificity. No additional samples were purchased after reviewing the pair.

## Usage and estimated cost

[Standard pricing checked 2026-10-24](https://developers.openai.com/api/docs/pricing): GPT-4.1 Mini $0.40/M input, $0.10/M cached input, $1.60/M output; Flare $5/M text input, $8/M image input, $30/M image output. Image edits returned separate text/image input counts. Images API input caching discounts were not assumed. No batch discounts, credits, taxes or invoice reconciliation are included.

| Request | Input text | Input image | Output | Estimated USD |
| --- | ---: | ---: | ---: | ---: |
| Shared narrative | 630 | — | 412 | $0.0009112 |
| A panel 1 | 494 | 0 | 158 | $0.007210 |
| A panel 2 | 511 | 0 | 158 | $0.007295 |
| B panel 1 | 542 | 1,440 | 158 | $0.018970 |
| B panel 2 | 559 | 1,440 | 158 | $0.019055 |
| **All five calls** | | | | **$0.0534412** |

A image cost estimate: **$0.014505**. B image cost estimate: **$0.038025**, about 2.62× A for this pair, principally from reference-image inputs. B did not incur another narrative charge. Formula for each image: `(text_input × 5 + image_input × 8 + image_output × 30) / 1,000,000`. These are usage-based estimates, not verified charges or fixed prices for future images. The general UI reports usage without maintaining a pricing engine for arbitrary models.

## Automated verification

The initial 15 POC 01 unit/SDK tests passed before changes. The updated free suite passed **23 unit/SDK tests** and **8 browser tests**. Fixtures and their arbitrary timings are not live results.

```sh
npm run typecheck
npm run lint
npm test
npm run build
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Checks cover strict contracts and refusals; correct multipart reference PNG; no unsupported model request or hidden paid fallback; image usage detail retention; text-before-images, concurrency and out-of-order arrival; partial failure; same-script replay without a second narrative call; background-tab paint fallback; bubble separation; real route validation; and no horizontal overflow at 1440/1024/390px.

The separately authorized live command was run **once**, passed, and made exactly the five calls above:

```sh
LUNATOON_RUN_PAID_COMPARISON=1 PLAYWRIGHT_CHANNEL=chrome \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run experiment:live
```

Default test commands never run it. Metadata requests are not generation benchmarks. The paid harness has one worker, no test retries, and stops before B if A fails. OpenAI SDK automatic retries remain disabled.

## Follow-up options

Retain B's authored-reference demo preference while keeping A explicit for lower input cost and comparison. Next, with a separately bounded budget, assess whether a more concrete source clue improves storytelling and repeat a small sample to determine if the observed visual advantage persists. Do not claim the 3s narrative target is solved. More compact scene prose, measured prompt changes and immediate feedback are lower-risk next options than switching models or streaming unvalidated JSON. Image partial streaming remains documented but deliberately unimplemented; this task preserves the valuable progressive text-first flow.
