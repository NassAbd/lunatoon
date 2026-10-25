# POC 04.1 — live end-to-end reliability

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-24. Branch: `feat/platform-experience`, based on verified clean checkpoint `0de4659fe74e5e35c83d0d7ad93e4a512e5648df`. No push or merge. No UI redesign, library, new service, dependency or database migration.

**Outcome: one fresh, complete real OpenAI journey succeeded with two decisions, four reference-generated illustrations and an ending, without retries.** Refresh and an actual server-process restart returned identical saved state and image bytes, with zero generation calls. This demonstrates a working journey; it is not a measured reliability rate or a guarantee for arbitrary prompts.

## Diagnosis: observed causes versus historical unknown

The old `stage_failed` records do not contain the discarded exception or rejected chapter. Their exact original cause remains unknown. POC 04 instrumentation was used to identify these **new, reproduced live failures**, not to infer a historical diagnosis:

| Attempt / stage | Exact rejection | Observed response / cause | Billable evidence |
| --- | --- | --- | --- |
| 1 / second narrative | `invalid_story_state`, `state_validation`, continuity / `EngineError`: “The final decision must end the short story, and earlier decisions must offer a next choice.” | The response repeated the first chapter, reused its fact IDs and returned `is_ending:false` with three choices. The provider schema allowed a non-ending at the final step, although local validation correctly rejected it. | 3,315 input / 760 output tokens; 5.197s; $0.002542 estimate; `req_b58e838957ba4f94a0378245d9a68371` |
| 2 / first narrative | `invalid_story_state`, `state_validation`: “Each next decision must use two newly established facts.” | Choices connected one new consequence with one known opening fact. Requiring both references to be new was an overly prescriptive creative rule. The same rejected response also contained a real holder/inventory mismatch; that invariant remains enforced. | 2,951 input / 802 output; 5.651s; $0.002464; `req_9bdebcce62e242e9af75fb371865c514` |
| 2 / second narrative | `invalid_story_state`, `state_validation`: “The second continuation must use at least two facts established by the first decision.” | Output cited one new fact and one opening fact. The prompt asked for two saved facts, while validation required two post-opening facts: a concrete prompt/validator mismatch. | 3,500 input / 641 output; 4.692s; $0.002426; `req_4c1f41ae23fd46679c740d53a10f977c` |

These requests returned parsed chapters and usage before failing local state validation. Their usage/request IDs were retained, no rejected state was applied, and their unused image reservations were cancelled. No database or accounting failure was observed. Why the model repeated history in attempt 1 is an inference; the invalid response and insufficient request constraint are directly observed.

Manual review also rejected two technical completions as clean quality passes: attempt 1 ended with unexplained command-center coordinates; attempt 2 depicted an abandoned device while saved memory retained it in Kael's inventory. Those original results remain saved and unmodified.

## Targeted changes

- `src/lib/story-engine/contracts.ts`: add a provider-only strict schema for the current step. Final chapters require `is_ending:true`, no next choices and no unresolved threads; earlier chapters require a next decision. Second-chapter fact references use an enum of this run's post-opening fact IDs with at least two entries. The stored chapter schema stays compatible with existing runs.
- `src/lib/story-engine/provider.ts`: label history as completed events, put the current choice/twist after context, supply the eligible continuity IDs explicitly, and align prompt requirements with validation. Request concrete action/consequence and final closure. Generate event/state fields before panel prose and explicitly cross-check custody, appearance and destruction against panel descriptions. Final prompt version: `persistent-neon-04.1-state-first`.
- `src/lib/story-engine/state.ts`: each next option must cite two distinct known facts, including at least one new consequence. An established motive can be its second reference. Unknown IDs and options disconnected from the current consequence still fail. The actual second continuation still requires two distinct post-opening facts.
- No generated response is silently repaired. Identity, object names, holder/inventory agreement, irreversible destruction, chronology, state isolation, panel ordering, strict JSON parsing, transactions, idempotency and cost controls remain enforced.
- Image endpoint, reference bytes, concurrent independent calls, image prompts' shared art direction, model and quality configuration are unchanged. No fallback to text-only generation or quality downgrade.

Structured Outputs documents output key ordering and supported schema constraints. Ordering state before prose is generation guidance, not proof of semantic consistency. Official sources rechecked on 2026-10-24: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [API pricing](https://developers.openai.com/api/docs/pricing).

## Regression coverage and verification

Tests were reproduced failing before the corresponding fixes:

- `tests/engine-provider.test.ts`: official SDK with mocked HTTP transport; step-specific ending constraints for 1/2, 2/2 and 1/1, post-opening fact enum, current choice/twist versus history, and state-before-panel output order.
- `tests/engine-state.test.ts`: accept a new consequence plus an opening motive; reject unknown/opening-only choice references; preserve rejection of a dropped object still retained in inventory.
- `tests/engine-service.test.ts`: replayed first chapter at step two fails with retained usage and request ID; changing only the ending flag still fails duplicate facts. State and successful images remain unchanged; duplicate submissions/reloads make no calls; an explicit corrected retry completes only the new pair.

Final checks:

| Check | Result | Evidence type |
| --- | --- | --- |
| `npm run typecheck` | Pass | Static |
| `npm run lint` | Pass | Static |
| `npm test` | **62 passed**, 11 files (baseline 55) | Unit / mocked SDK |
| `npm run test:engine:build` | Pass | Production webpack build in isolated `.next-engine` |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` | **6 passed** | Mocked provider over real HTTP, temporary SQLite/files, real process restart |
| Original `npm run test:e2e` with Chrome and test-server URL | **8 passed** | Intercepted browser APIs, no paid generation |
| Live browser journey and persistence checks | Pass for final fresh run | Real OpenAI, normal local `data/`, desktop Chrome |

Browser coverage includes dialogue-first rendering, out-of-order images, light theme, collapsed diagnostics, two decisions/ending, refresh/restart, duplicate operation IDs, partial failure, isolated image retry, budget/call limits, and explicit narrative recovery. The expected Node 24 experimental SQLite warning remains. Mock delays/usage are not live benchmarks.

## Authorized live investigation

Three fresh runs; **9 narrative and 12 image requests actually forwarded to OpenAI**, within authorization of 3 runs / 9 narratives / 18 images. Experiments were sequential, with no overlapping full stories and no automatic paid retries. All forwarded calls returned usage. Paid work stopped after the final complete story.

Models: `gpt-4.1-mini` for narrative and `gpt-image-2.5-flare` for reference edits; existing quality `low`, unchanged. Each image received the same original Kael reference. All generated images and diagnostic artifacts remain local and ignored by Git.

| Run | Narrative calls | OpenAI image calls | Outcome | Usage-based estimated cost |
| --- | ---: | ---: | --- | ---: |
| 1 — `deb61ad2-1f0f-441c-ad0d-02bbef05058e` | 3 | 4 | Stage failure, explicit recovery, 4 images; weak ending rejected in review | $0.092792 |
| 2 — `125ba08c-7d97-4d5a-ab5f-ba3d8f01ae48` | 4 | 4 | Two validation failures, explicit recovery, 4 images; semantic custody mismatch rejected in review | $0.094157 |
| 3 — `50316ee8-dc67-425a-b61f-1a9fee358159` | 2 | 4 | Complete fresh journey, no retries; manually reviewed | **$0.088545** |
| Total | **9** | **12** | All returned usage, including rejected narratives | **$0.275494** |

**Test-limit adjustment:** only newly created run 2 had its saved narrative-call limit explicitly increased from 3 to 4 after the documented second failure. The change used an atomic transaction after preserving its prior record. Image limit 6, budget $0.30, step limit 2 and all accounting remained intact. Global authorization was independently enforced. Application defaults and historical runs were not changed; final run used the unchanged defaults (3 scripts / 6 images / $0.30).

**Harness incident:** the initial local request-count guard incorrectly treated any in-flight call as uncertain and blocked one sibling image before forwarding it to OpenAI. The guard was corrected, then only that image was explicitly retried. Run 1 conservatively retains five application image attempts, including this local non-provider failure, with one unknown-cost record and $0.071 held. The external forwarding ledger establishes four actual provider image calls; no application accounting record was erased or falsely marked free. This is separate from the narrative failures.

## Final reader journey and continuity review

Saved URL: `/run/50316ee8-dc67-425a-b61f-1a9fee358159`.

1. First choice: **Destroy the device**. Instruction: **“Destroy it with a hammer.”** The first image shows the impact and fragments; the close-up shows Kael reacting as cameras reactivate. New facts record hammer destruction and renewed surveillance.
2. Second generated choice: **“Attempt to disable the surveillance cameras manually.”** Instruction: **“Leave the broken device on the floor. Cut power to the cameras and walk away untracked.”** Kael cuts the control-hub wiring, leaves the broken device and departs into the city. The ending uses both first-chapter facts and retains the wet yellow coat and established identity.
3. Final memory: device remains `destroyed`, holder `null`, Kael's inventory empty, camera shutdown and abandoned fragments recorded, no next options, `is_ending:true`, run `ended`, both nodes and all four panels `complete`.

The ending resolves the selected escape action; it deliberately does not reveal the original sender. A mandatory source revelation would conflict with that chosen path. Final dialogue's “ask new questions” is weaker than ideal closure, but introduces no new task needed to finish this story.

**Subjective manual assessment:** recognizable Kael, yellow coat, brown skin, swept-back hair, amber left eye and matching flat noir palette; varied wide/action/close-up/departure shots; readable dialogue overlays; no duplicate drawn lettering in this final run. The scar is more pronounced in close-up, and the broken device's exposed core is rounder and brighter in panel 3 than its original square housing. These are visible fidelity limitations, not a restoration of the device or a saved-custody contradiction. The last view is from behind, so eye/scar fidelity cannot be assessed there. This is a working demo sequence, not perfect visual identity.

## Measured final-run performance and cost

Times below are the actual final run, not averages. Saved server durations include SDK/parsing/response handling. Browser request-flow totals end after persistence/status settlement, not guaranteed full raster decoding. A separate DOM observer confirmed dialogue present with zero new images, then one and two images independently. Separate post-run checks decoded all four JPEGs.

| Chapter | Server narrative | Browser text-ready | Panel 1 server image | Panel 2 server image | Browser request-flow total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7.595s | 7.619s | 12.071s | 11.653s | 19.720s |
| 2 | 4.854s | 4.881s | **87.338s** | 8.749s | **92.252s** |

Panel 2 arrived first in both chapters. In chapter 2 it displayed while panel 1 remained pending for about 79 more seconds; no retry or fabricated progress was used. The two generation intervals sum to 111.972s, excluding reading, manual inspection and time between decisions. The <3s text target remains unmet; no speedup is claimed. The slow image is a real observed request, not explained away as browser time.

| Request | Returned input / output tokens | Reference tokens (included in input) | Estimated USD | Provider request ID |
| --- | ---: | ---: | ---: | --- |
| Chapter 1 narrative | 2918 / 676 | — | 0.002249 | `req_d652d711c105423ebdedce14e2328e8d` |
| Chapter 1 image 1 | 2372 / 158 | 1440 | 0.020920 | `req_1b399f747116496e9c0312df93e2974b` |
| Chapter 1 image 2 | 2362 / 158 | 1440 | 0.020870 | `req_34def13b2e704527af354b142c7a6436` |
| Chapter 2 narrative | 3436 / 607 | — | 0.002346 | `req_fb57c394c6e14cadadf43ee69db67d79` |
| Chapter 2 image 1 | 2404 / 158 | 1440 | 0.021080 | `req_f6ece6b09770463c8e50aa153d8cfef8` |
| Chapter 2 image 2 | 2404 / 158 | 1440 | 0.021080 | `req_c5e5678c40c04e5395d1109148dacea4` |

Final-run totals: 15,896 measured input tokens, 1,915 output tokens, 5,760 reference-input tokens included in input. Narrative estimate **$0.004595**; image estimate **$0.083950**, including **$0.046080** reference input. No unknown costs or held reservations remain for this run.

Rates verified 2026-10-24: narrative $0.40/M uncached input, $0.10/M cached input, $1.60/M output; images $5/M text input, $8/M image input, $30/M output. Narrative cache counts were zero. Reference cost is not added twice. Each event rounds upward to integer micro-USD. These are usage-based estimates, not invoices or a provider billing cap; see [cost model](../../api-cost-model.md).

## Persistence, recovery and evidence

The final live run was loaded again and then loaded after stopping/restarting the isolated production Next.js process against the same normal local data directory. Both checks asserted:

- Full API snapshot deep equality, including dialogues, memory, events, costs and asset paths.
- Identical SHA-256 hashes for all four saved JPEGs; all decode to 1024×1536 in Chrome.
- Unchanged provider forwarding ledger and **zero generation POSTs** from the browser.
- Visible ending and Developer details collapsed by default.

The second decision itself was submitted from a newly loaded saved URL, exercising continuation from persisted first-chapter state. Earlier complete runs were also reloaded across actual server restarts without additional provider calls. Explicit image recovery was exercised live for the harness-blocked sibling; interrupted leases, duplicate claims, late completions, cross-run isolation and budget/call guards remain covered by mocked unit/browser tests. No paid timeout or forced in-flight crash was induced.

Ignored local evidence is preserved under `test-results-live/poc-04-1/`: bounded forwarding ledger, raw returned narrative output for this authorized investigation, per-attempt browser observations, snapshots, downloaded diagnostics and desktop screenshots. No authorization headers or key values are recorded. Final-run files are under `attempt-3/`, including `first-diagnostics.json`, `second-diagnostics.json`, `persistence-verification.json`, `reload-verified-reader.png`, `restart-verified-reader.png`, `completed-reader.png` and `ending-chapter.png`. The last two screenshots were taken with the existing fade animation completed (all image opacity values 1). Images live under `data/images/<run-id>/`; immutable references remain under `data/references/`. These files are intentionally not committed.

## Remaining limits and recommendation

Continue with the working saved demo and retain human review. The historical generic exception remains unknowable. The final run establishes a successful real journey, not a success percentage; no additional evaluation batch is authorized or performed. Strong schemas and recorded invariants cannot prove semantic agreement among prose, images and memory. Earlier live attempts exposed that gap; state-first prompting mitigates it without pretending to solve it formally. Visual prop/scar drift and highly variable image latency remain. Pricing and model access are dated observations; incomplete/unknown usage remains conservatively accounted for.

All nine authorized narrative calls have been used. Further paid narrative experiments require new authorization. No platform/library work, public deployment, push or merge was performed.
