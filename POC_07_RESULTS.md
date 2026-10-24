# POC 07 — reader continuity and finale

Date: **2026-10-24**. Branch: `feat/reader-finale`, based on POC 06 `2b68eb97d99628d0ca2c3549f4a1478611f3c2fb`.

## Baseline and Git safety

The initial working tree was clean. `origin/feat/platform-polish` was already published at the exact local POC 06 SHA, verified against GitHub before branching. No further POC 06 push was needed. This iteration is committed locally only; no push, merge, history rewrite or force push is authorized.

The existing narrative engine, strict validation, prompts, models, reference artwork, quality, stream parameters, SQLite schema, image persistence, idempotency, budgets and paid retry controls are unchanged. The four-beat authored opening, library, saved sessions and `/experiment` remain intact. No dependency or animation framework was added.

**No paid calls were made.** All new generation tests use the isolated mock HTTP provider, official SDK, temporary SQLite/files and production Next server. Existing live data was checked read-only using hashes, without printing keys or story contents.

## Streaming conclusion

See [the source-by-source investigation and decision table](docs/POC_07_IMAGE_STREAMING.md). The six requested official sources were checked again, including the edit endpoint, event schema, Flare alias/snapshot and pricing. The edit-method Markdown URL returned 404; the official HTML reference succeeded.

The current `images.edit` workflow supports reference inputs, `stream: true`, `partial_images: 1`, low quality, JPEG/compression 85 and 1024×1536. A requested partial is **not guaranteed**. There is no documented minimum delivery count, preview deadline or evidence that another supported quality/format/snapshot/endpoint would reliably deliver an earlier preview while preserving this tested reference workflow.

The historical POC 05.1 proxy observed four `image_edit.completed` events and zero `image_edit.partial_image` events upstream. The app/browser could not forward previews that were absent there; this is not evidence of frontend buffering. Mocked streams prove incremental forwarding, decoding and independent preview replacement, not real provider preview delivery. No setting or model was changed to pursue a speculative improvement.

## Reader changes

- **Compact saved choices:** a completed decision keeps its full form and dimensions while visible or keyboard-focused. Once entirely offscreen with a 64px margin, it becomes a compact card. A native disclosure retains the original question, saved choice and exact custom twist. Existing saved chapters start compact on reload.
- **Viewport continuity:** the outer decision and chapter/panel DOM remain mounted. Compaction above the viewport measures the following chapter before/after the synchronous change and compensates only the removed document height, leaving the visible reading position in place. Browser anchoring is suppressed for that frame only, then restored so later error/retry content can anchor normally. There is no animated height collapse or navigation to a new chapter.
- **Honest waiting:** fixed noir placeholders remain decorative. After 20 seconds of the current placeholder's lifetime, the copy acknowledges the wait and saved dialogue without a percentage, ETA or fabricated preview. Final images still decode independently before the existing 220ms reveal. Loading a saved asset is labeled separately from generating one.
- **Download recovery:** a failed saved-image GET/decode offers **Load saved illustration again**. It remounts only that local image request; it never invokes a generation endpoint, changes its saved asset path or replaces the successful sibling.
- **Reading rhythm:** a restrained chapter separator, short opacity-only chapter/finale reveals, a small wordmark hover/focus response and clearer speech-bubble surfaces preserve the original light identity and dialogue positions. Reduced motion disables the new decorative transitions. No panel geometry or artwork crop changed.
- **Ending:** the recap renders the actual saved choices and instructions, with no AI summary or invented narrative consequence. A saved ending with unfinished artwork remains readable and labeled honestly. “Your complete story is saved” requires all expected panels to have completed saved assets, including earlier chapters. **Read another story**, **Saved stories** and **Begin a new run** lead to existing routes and make no generation call themselves.
- **Diagnostics:** collapsed Developer details now expose requested/received upstream preview counts and first-preview timing. They explain the different narrative, paint, asset-transfer, decode and reveal endpoints; missing preview timings are not displayed as zero latency.

The new finale is presentation of saved decisions, not a claim that narrative or character consistency has improved. No narrative prompt or invariant was loosened.

## Latency evidence and limits

The pipeline already dispatches the two image requests concurrently after dialogue paint. Safe claim fencing, validation and serialized authoritative reads were retained. Inspection found no measured local bottleneck justifying their removal. No actual generation-speed improvement is claimed.

| Measurement | Historical observed value | Interpretation |
| --- | --- | --- |
| POC 05.1 browser text-ready | 5.526s / 4.409s | One complete live story, two decisions; the 3s target remains unmet |
| POC 05.1 server image requests | 11.663s, 11.086s, 10.346s, 10.868s | Four successful reference streams, no upstream partials |
| POC 05.1 final images decoded | 17.224s / 15.318s from each submission | Includes narrative and subsequent images; not per-image compute |
| Earlier POC 04.1 image outlier | 87.338s | One server request; sibling finished in 8.749s; not a representative benchmark |
| POC 05.1 estimated story cost | $0.089825 | Historical usage-based estimate, not an invoice or new POC 07 spend |
| POC 07 paid generation | 0 calls | No new live latency, quality, usage or cost observation |

Sources: [POC 05.1](POC_05_1_RESULTS.md), [POC 04.1](POC_04_1_RESULTS.md). POC 06 also made no paid calls.

Narrative response timing includes server/provider work, parsing, persistence and transfer; `validation_ms` measures only local chapter/state validation. Text readiness is recorded after browser paint. Image SDK duration includes stream consumption; browser request flow additionally includes persistence/status reads. Asset transfer measures response-start to response-end; it does not isolate request queueing or first-byte latency. Decode and subsequent visibility are separate. The 220ms final fade is unchanged from POC 06 and is not provider latency. Snapshot-read overhead and individual React render time have not been isolated into new comparable benchmarks.

The new long-wait test advances a **browser test clock** and uses synthetic provider delays. Geometry and request-count assertions are behavioral evidence, not API performance measurements.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | **103 passed**, 16 files; all prior unit/SDK coverage retained |
| `npm run test:engine:build` | Passed; production webpack build isolated in `.next-engine` |
| Combined Playwright suite | **27 passed** in one run: 8 original experiment + 19 persistent-reader/library tests |
| Existing private data | **195 records and 49 assets unchanged**; zero mismatches or additions |
| Secret audit | **10 staged files**, nine prior commits / 225 unique blobs; no findings |
| Paid OpenAI requests | **Zero** narrative/image calls in this iteration |

The combined run used ignored `test-results-engine/poc07-all.config.ts` to select both existing test directories with the isolated mocked server. The same suites remain runnable through the repository's browser scripts. New tests are in `tests/engine-e2e/reader-finale.spec.ts`. Expected Node 24 experimental SQLite warnings remain.

Measured browser geometry (mocked content): the selected decision stayed 657.56px tall while visible, then became 155.44px offscreen. The visible panel moved only by the deliberate 1px test scroll plus about 0.13px rounding; reader/panel elements were retained. A separate test confirmed that removing an earlier image-retry block preserved the later panel within 2px through native anchoring. These are layout measurements, not generation-latency benchmarks.

New browser coverage tests visible/focused decision deferral; offscreen compaction with retained DOM and visible-panel coordinates; exact choice/twist recap; completed and unfinished endings; explicit image retry; failure of a saved asset GET without new generation; 20-second feedback without fake progress; reduced motion; and removal of an earlier error block while reading a later chapter. Existing coverage retains actual mocked-server process restart, no regeneration on reload, strict state validation, both decisions/four images, partial/truncated streams, independent out-of-order completion, usage, idempotency and budget/call guards.

The existing seamless test now lets two browser frames settle after its deliberate test scroll before taking the generation baseline. Its original strict scroll, geometry, DOM-identity and navigation assertions remain. The new dedicated test separately measures the intentional offscreen compaction, including the corresponding document-offset correction. Initial new-test failures used an incorrect exact radio name (the existing accessible labels include choice numbers); selectors were corrected without changing the application to fit the tests.

## Screenshots and preserved data

Desktop captures at **1440px and 1024px** use actual rendered UI, original authored assets and mocked story content. The tiny green mock JPEGs are decode fixtures, not generated-art quality evidence. Screenshots and private evidence stay ignored:

- `test-results-live/poc-07/screenshots/mocked-ending-1440.png`, `mocked-ending-1024.png`
- `test-results-live/poc-07/screenshots/mocked-compact-history-1440.png`, `mocked-compact-history-1024.png`
- `test-results-live/poc-07/screenshots/mocked-long-wait-1440.png`, `mocked-long-wait-1024.png`
- `test-results-engine/poc07/decision-compaction.json`, `above-viewport-retry.json`
- `test-results-live/poc-07/preexisting-integrity.json`, `final-integrity.json`

The baseline contains **195 SQLite records and 49 local assets**; the final hash comparison found zero changes or additions. `.env.local`, databases/WAL, private story data, generated artwork and local test evidence remain ignored. Only source, tests and safe documentation belong in the commit. The historical secret scan covered nine existing commits / 225 unique blobs with no findings, including an exact comparison against locally configured credentials without disclosing them.

Manual screenshot review found readable dialogue, concise saved-choice history, clear ending actions and no desktop overflow. Early captures clipped the ending/placeholder because they were taken before the scroll/paint settled; explicit capture framing and paint waits corrected the test artifacts without an application layout workaround.

## Phase 2 decision

**GO for phase 2 reader/demo review:** the complete mocked regression gate passes, saved data is intact and the narrow reader changes are ready to review. **NO-GO for claiming genuine early previews, representative speedups or newly verified live narrative/visual quality.** No further live work is authorized by this iteration. Such claims require separately authorized, bounded live evidence; increasing partial count, quality or changing endpoints is not a demonstrated fix.

Existing limitations remain: model output can drift; references do not guarantee identical characters; the SDK's response-header timeout is not a whole-stream-body deadline; claim leases protect persisted state but a silent open body may still wait indefinitely. No implicit paid retry was added. Chrome desktop is the verified browser; other engines have not been newly evaluated. Local single-user storage and unauthenticated endpoints remain unsuitable for public deployment.
