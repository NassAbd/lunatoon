# POC 05.1 — narrative robustness and live streaming

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-24. Corrective branch: `fix/narrative-robustness`, based on `5d7d8c9ed344aca60ab43be566cec017656795b1`.

Before implementation, the clean POC 05 branch was scanned, pushed without force, and verified against [origin/feat/seamless-reading](https://github.com/NassAbd/lunatoon/tree/feat/seamless-reading). The corrective branch is for a local commit only; no merge or corrective-branch push is authorized.

## Historical failure and evidence limits

Read-only SQLite inspection confirmed a first-step **Activate the device**, empty instruction, with two failed narrative attempts. Both were `invalid_story_state` at `state_validation`, using prompt `persistent-neon-04.1-state-first`. Returned usage was retained; no images were requested:

| Historical attempt | Server narrative | Input / output tokens | Usage-based estimate |
| --- | ---: | ---: | ---: |
| First | 5.248s | 2,913 / 663 | $0.002226 |
| Explicit retry | 6.104s | 2,913 / 728 | $0.002330 |
| Total | — | — | **$0.004556** |

These are the user's earlier tests, not new POC 05.1 calls. The rejected chapters were not retained. The single message combined three predicates: at least two distinct references, at least one newly introduced reference, and all references known. Its diagnostics had an empty issue list, so the exact historical subcondition cannot be recovered.

The confirmed implementation defect is an arbitrary two-reference gate that rejects a causally valid single-consequence choice. A synthetic activation response reproduces the exact original error before the fix, while retaining two added facts to isolate the next-choice predicate. This is a regression reproduction, not a recovered historical model response. The strict provider schema previously had only a maximum on option references; it did not encode the prompt's reference minimum.

## Correction

- Each next option must reference a fact introduced by the current chapter. Every referenced ID must exist in that run's merged state. A single genuine consequence is sufficient.
- The second chapter must use a saved consequence from the first chapter. The request schema restricts those references to known post-opening IDs. There is no arbitrary two-fact quota.
- New facts have a minimum of one and the existing maximum of four. The prompt requests concrete depicted consequences, without padding facts to meet a count.
- Prompt `persistent-neon-05.1-causal`, request schema, context precondition and local validation agree. Activation, destruction and investigation receive distinct action guidance; optional twists cannot replace the selected action.
- Safe diagnostics distinguish `unknown_fact_reference`, `missing_new_fact_reference` and `missing_saved_consequence`, with a static field path/option index and no model text or credential values.

Identity anchors, object names, ownership/inventory agreement, irreversible destruction, chronology, unique IDs, strict JSON, two panels, ending topology and unresolved-thread closure remain enforced. No chapter is silently rewritten. Existing records remain readable without migration; failed calls still retain usage and require explicit retry. Persistence, cost reservations, image generation and reader layout are unchanged.

Reference checks establish links between records. They cannot prove that prose or pictures semantically depict those records; narrative and visual quality require separate review.

## Mocked regression matrix

| Initial input | Distinct consequence in fixture | Saved continuation / ending |
| --- | --- | --- |
| Activate; no twist | Device becomes active and opens the escape gate | Uses the opened gate and reaches safety |
| Destroy; “Destroy it with a hammer.” | Device destroyed, released from inventory; cameras stop | Leaves through blind surveillance without restoring the device |
| Investigate; cyborg-cat twist | Cat reads a maker seal and opens a maintenance route | Uses the saved route; retains cat identity and Kael's appearance |

All three mocked paths persist two decisions/four images, read saved SQLite state, preserve previous dialogue and appearance, and finish without new options or unresolved required actions. Additional checks reject unknown, empty and opening-only causal references; reject object/identity/chronology violations; retain failed narrative usage with zero image work; deduplicate repeated operations; and recover only through an explicit retry. The original streaming and scroll tests remain intact. These fixtures test behavior, not model reliability statistics.

## Live experiment

Authorized limits: two fresh runs, six narrative calls, eight image calls, sequential full-story attempts, no unrelated A/B work or automatic retries. Start with activation without a twist. A separate private local ledger enforces those limits before forwarding requests and stops new work on an uncertain outcome. The proxy forwards SSE chunks as they arrive, records event metadata/usage/request IDs, and never persists previews as completed assets. Existing per-run limits and quality/reference settings remain unchanged.

**One complete live run succeeded on 2026-10-24:** activation without a twist → “Destroy the device to disrupt surveillance,” also without a twist → ending. Two narrative requests and four reference-image edits succeeded, with no retries, substitution or quality changes. Testing stopped at this point: one of two authorized runs, two of six narrative calls and four of eight image calls used. Models were `gpt-4.1-mini-2025-04-14` (resolved Responses model) and requested `gpt-image-2.5-flare`, reference mode, existing `low` quality, JPEG 1024×1536, `stream:true`, `partial_images:1`.

The actual first chapter added one fact: activation brightens the device and causes surveillance cameras to react. All three generated next choices cited that single new fact. This is direct live evidence that one consequence can support valid choices; the former two-fact/two-reference quotas would reject this response. The second chapter used that saved fact, destroyed the device, removed it from Kael's inventory, set its holder to null, stopped surveillance and returned `is_ending:true` without further choices. All four illustrations were saved and decoded.

### Streaming and observed timings

All four upstream streams returned `image_edit.completed`. **Zero `image_edit.partial_image` events arrived.** Browser first-preview receipt/display are therefore null, not zero seconds. The app never simulated a preview. Real streaming endpoint access, final-event handling and final persistence succeeded; preview-to-final replacement remains covered by mocks, not demonstrated live. No further paid work was done merely to obtain a preview.

| Continuation | Server narrative | Browser text ready | Request flow complete | All images decoded | All fades complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| Activation | 5.491s | 5.526s | 17.217s | 17.224s | 17.902s |
| Destruction / ending | 4.380s | 4.409s | 15.312s | 15.318s | 15.998s |

Browser times start at that continuation's submission; server time includes SDK/network/parsing through the local observation proxy. These are single observations, not representative benchmarks or evidence of a speedup. The three-second text target remains unmet. Narrative validation itself took 2.051ms and 0.445ms respectively.

| Generated panel | Server image duration | Browser image request duration | Final decoded, from submit | First preview |
| --- | ---: | ---: | ---: | --- |
| 1 — activation, wider shot | 11.663s | 11.686s | 17.224s | None delivered |
| 2 — activation, close-up | 11.086s | 11.117s | 16.655s | None delivered |
| 3 — destruction action | 10.346s | 10.376s | 14.799s | None delivered |
| 4 — resolution | 10.868s | 10.896s | 15.318s | None delivered |

The first pair finished out of order: panel 2 decoded approximately 569ms before panel 1. Image dispatches were 0.2ms apart for the first pair and 0.3ms apart for the second. Dialogue was visible before either image request completed. Both observed submissions retained the same reader, decision and prior panel DOM nodes, with no forced scroll movement or new-panel dimension change. Developer details remained collapsed. No reader code was changed in this correction.

### Measured usage and estimated cost

| Request | Input tokens | Output tokens | Of input: reference tokens | Estimated USD | Provider request ID |
| --- | ---: | ---: | ---: | ---: | --- |
| Narrative 1 | 2,990 | 721 | — | $0.002350 | `req_6db48f8bd9054939a82b567ef7edff47` |
| Image 1 | 2,461 | 158 | 1,440 | $0.021365 | `req_0daa08cd3e5347f1901414f68a03bd44` |
| Image 2 | 2,451 | 158 | 1,440 | $0.021315 | `req_7172fe3e149d4d63926930320dd922ca` |
| Narrative 2 | 3,520 | 604 | — | $0.002375 | `req_4b4dd0c09f71444788e6429fc344fed6` |
| Image 3 | 2,416 | 158 | 1,440 | $0.021140 | `req_77f21c88866a48d78508d01e8692cdc3` |
| Image 4 | 2,444 | 158 | 1,440 | $0.021280 | `req_e10cf348b4734ccea049e1eeaeff63e5` |
| Total | **16,282** | **1,957** | **5,760** | **$0.089825** | Six successful attempts |

Input/output counts are returned usage; prices and micro-dollar rounding yield estimates, not provider invoices. Narratives total $0.004725; images total $0.085100, including $0.046080 of reference-input cost. The latter is a component, not an additional charge. Cached narrative input was zero. No separate partial surcharge was added to returned usage; requesting a preview alone does not establish that a partial was delivered or billed. Final reservations were zero, with zero unknown-cost attempts and zero unpriced reservations. Existing per-run guards remained three scripts, six images, two steps and a $0.30 estimated budget. An application reservation is not an absolute provider billing cap.

### Narrative and visual review

Manual review of the dialogue, saved state and four actual JPEGs found a readable causal sequence: activation changes surveillance; choosing destruction breaks the device and stops the cameras. The saved condition/custody agrees with visible floor fragments. The second chapter directly uses the first chapter's consequence. The optional-twist paths were tested with mocks, not additional live runs.

Subjective scores for this one sequence: causal progression **4/5**, narrative closure **3/5**, shared visual style **4/5**, character continuity **3/5**, framing variety **4/5**. Kael's coat, skin, hair and amber eye remain recognizable. The initial wider shot, close-up, destruction action and concluding close-up communicate distinct beats. Overlay dialogue is readable and no duplicate lettering appears in the artwork.

Limitations are visible: panel 1 places the scar over the opposite eyebrow from panels 2/4; the final fragments retain cyan highlights and repeated square core shapes. The generated art is more detailed than the flat opening. The sender/name mystery is abandoned rather than answered, despite the model returning an empty unresolved-thread list. The selected immediate conflict ends, but empty JSON does not prove every narrative promise was fulfilled. No chapter or illustration was rewritten to hide these limitations.

### Persistence and local evidence

Reloading the saved URL and then actually stopping/restarting the private production Next server preserved both chapters, all six generation records and the four JPEG hashes, with **zero additional narrative/image calls**. The first chapter was also loaded from its saved URL before submitting the second. Hash verification of pre-existing document payloads and files found all **129 older records and 29 older assets unchanged**.

The fresh saved run is `287f01ed-1299-499f-90e5-07adcf4f5c97`, available at `/run/287f01ed-1299-499f-90e5-07adcf4f5c97` with the original local data directory. Exactly four completed JPEGs exist for this run; no transient previews were saved. Because none arrived, live inspection cannot independently demonstrate that an intermediate preview stays off disk. Mocked streaming tests cover that behavior, interrupted streams, explicit image retry and reservation/accounting recovery.

Private evidence remains under ignored `test-results-live/poc-05-1/`; generated images stay under ignored `data/images/287f01ed-1299-499f-90e5-07adcf4f5c97/`. These local artifacts are intentionally absent from Git:

- `run-1/first-2026-10-24T14-42-11.538Z-*`: first chapter screenshot, diagnostics, browser observations and hashes.
- `run-1/second-2026-10-24T14-45-48.350Z-*`: complete story screenshot, diagnostics, usage and browser observations.
- `run-1/reload-2026-10-24T14-46-15.863Z-verification.json` and `run-1/verify-2026-10-24T14-46-43.766Z-verification.json`: unchanged call counts, event records and image hashes.
- `preexisting-integrity-verification.json`: previous stories/assets preserved.
- Desktop screenshots: first chapter — local-only `test-results-live/poc-05-1/run-1/live-first-chapter-1440.png` and ending — local-only `test-results-live/poc-05-1/run-1/live-ending-1440.png`, both 1440×1000, local only. Read-only capture left generation counts unchanged. The full vertical reader is in `run-1/second-2026-10-24T14-45-48.350Z-reader.png`.

## Remaining limitations and recommendation

**Go for a further local product iteration:** the formerly failing activation case now completes a real two-decision story, while three distinct paths pass mocked continuity regressions. **No-go for claiming live preview delivery or statistical narrative reliability:** this experiment received only finals and exercised one live path. Keep previews optional, retain the final-only fallback within the same stream, and assess additional paths only under separate bounded authorization.

The exact historical rejected chapter remains unavailable. Fact references verify record links, not semantic truth or visual accuracy. SDK request timeout does not establish a whole-stream deadline after response headers; the private investigation proxy used a 180-second whole-request deadline, but the application itself still relies on leases/fencing and explicit recovery for an interrupted/stalled stream. No paid interruption/retry was deliberately induced. These limits remain visible rather than adding unrelated orchestration changes here.

## Verification

All checks passed: `npm run typecheck`, `npm run lint`, `npm test` (**96 unit/SDK tests**, 15 files), `npm run test:engine:build` (production webpack build), `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` (**9 persistent-reader browser tests**) and the original `npm run test:e2e` suite (**8 browser tests**) against an isolated local server. **17 browser tests total.** The original experiment server had a dummy credential and unreachable local provider URL. These automated suites used mocks and made no paid requests. An additional eight offline tests verified the private live proxy's call caps, uncertain-outcome guard and streaming deadline. Independent source/test review found no blocking issue.

Official documentation rechecked 2026-10-24: [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [streaming](https://developers.openai.com/api/docs/guides/image-generation#streaming), [edit events](https://developers.openai.com/api/reference/resources/images/edit-streaming-events), [pricing](https://developers.openai.com/api/docs/pricing). Existing rates remain $0.40/M input and $1.60/M output for GPT-4.1 mini; Flare $5/M text input, $8/M reference-image input and $30/M image output. A partial adds 100 output tokens; reservations hold $0.003 and reconciliation uses returned usage without adding that allowance twice. Prices produce estimates, not invoices.
