# POC 03 — persistent story engine results

Date: **2026-10-24**. Branch: **`feat/persistent-story-engine`**. Base: synchronized local/origin `feat/visual-consistency`, commit **`0ac736f3598b337201a1e8b532a26cd3ddf1d2b0`**. The working tree was clean before branching. POC 02 was explicitly reviewed/approved by the user before implementation. Main was not merged or modified.

## Implemented result

The original POC 02 reader remains available. Its new **Start a persistent story** control opens a stable local `/run/<uuid>` URL without an AI request. The saved reader generates exactly two panels per continuation, saves validated text/state before images, independently renders two concurrent images, offers causal next choices, then ends after the second decision. Refresh/restart reuses saved dialogue, owned references and JPEGs. Failed image retry only targets that image; same-script A/B replay remains explicit and counted.

SQLite stores immutable bible/reference metadata, evolving facts/appearance/objects, node before/after state, panels, planned work and attempt receipts. Files remain under ignored local data. Transactional reservations/claims and operation UUIDs prevent duplicate calls. A request handler awaits and persists its own work; there is no unreliable post-response background task. Expired claims recover without automatically generating anything.

Developer diagnostics distinguish returned tokens, usage-based estimated spend, reference-image input cost, unknown costs, held planning amounts, hard call counts, server stage timings and current-visit browser request-flow observations. No hard provider billing cap or 3-second text target is promised.

## Executed automated checks

All provider generation below was **mocked**. No new paid OpenAI request or model-access probe was made for POC 03.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass, strict TypeScript |
| `npm run lint` | Pass |
| `npm test` | **45 tests pass**, including all original 23 POC 02 unit/SDK tests and 22 added engine tests |
| `npm run test:engine:build` | Pass; runs the regular production webpack build in isolated `.next-engine/` |
| `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e` | **8 original browser tests pass** |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` | **3 production integration/browser tests pass**, official SDK against local fake HTTP provider |

The default bundled Playwright browser was absent on this machine; the first new browser attempt could not launch two UI tests. Using the already-installed Chrome resolved that environment issue; no global tool/browser installation was performed. After the first isolated production build, ESLint initially scanned its generated JS/types. The isolated build/test/data output directories were added to the existing generated-artifact ignore list, then lint passed. No source rule/test was bypassed.

### Engine coverage

- Idempotent run creation copies original owned references, records content hashes/relative metadata, and makes zero provider calls.
- Strict chapter/panel/dialogue parsing, unique facts/IDs, named-source facts, two new causal facts per next option, two first-continuation facts reused by decision two, immutable identity, additive injuries, destroyed-object preservation and matching holder/carried-object records.
- Invalid proposed state never updates run step/state or creates image panels; its narrative usage still counts.
- Atomic node + one script/two image reservations; budget rejection rolls back the node; hard counts include failed/unknown attempts and planned work.
- Duplicate operations and stage ownership; independent SQLite connections cannot both claim a stage. Different payload with the same decision operation is rejected.
- Text is durable before any image request. Independent panels can complete separately. Partial failure preserves its successful sibling and dialogue.
- Individual explicit paid image retry creates one call; no new script/sibling work. Script refusal releases unused image reservations; explicit script retry is separately counted.
- Returned usage retained on refusal/validation failures; absent/malformed usage and unpriced/expired models remain unknown. Reference input tokens/cost are separated from image output cost without double counting.
- Reopened SQLite and actual process restart reuse saved files without new calls. Expired claims require explicit retry; a valid image receipt/file can finish recovery without a new call. Late responses cannot overwrite a newer successful retry and can still reconcile old usage.
- Missing completed image becomes a visible failed stage without regeneration. Asset ownership, traversal, symlink escape and reference integrity checks prevent unrelated file access.
- Explicit A/B replay reuses its saved script/state and reserves two calls idempotently.

### Browser evidence

The integration server uses `OPENAI_API_KEY=test-only`, a loopback fake `/v1/responses` and Images API, isolated temporary SQLite/files, and a production Next process on port 3110. It never forwards to OpenAI. Its restart control belongs only to the **test server**, not the application.

1. Start saved run from the original reader; choose **Investigate its origin** with **A mysterious cyborg cat suddenly appears.** Assert dialogue visible with zero generated images, then one image, then two. Snapshot paths exist on disk. Reload and assert unchanged generation counters. Terminate/restart the suite's own Next process using the same data directory; load the same URL and assert identical paths/counters. Choose the saved Aster Lab/TL-9 option; assert second context includes both first-chapter facts, cut hand/torn cuff and recent dialogue; end with four images.
2. Submit identical narrative operation IDs simultaneously; only one upstream narrative request. Submit identical image operations simultaneously; only one image request. Cross-run asset read is 404, changed decision payload is 409, cross-origin mutation is 403.
3. Inject one image failure; show saved successful sibling and unknown cost. Explicitly retry panel two; counter increases by one only, sibling path and script remain. Explicit text-mode replay adds two image calls; a further two-panel continuation is blocked by the hard six-image limit before another narrative call.

Inspected the saved-reader desktop screenshot at 1440px: original opening artwork, existing speech-bubble overlays, clear two-decision controls and diagnostics remain legible, with no horizontal overflow. The integration image is a **1×1 green JPEG fixture**; this screenshot verifies layout and persistence only, not illustration quality. Screenshot/traces stay in ignored `test-results-engine/`; POC 02 live artifacts were preserved. The suite cleans up only its own temporary data/process.

## Live observations, cost and quality

**No POC 03 live generation, latency benchmark, usage/cost total or visual quality score is reported.** Synthetic usage and injected delays exercise accounting/rendering; they are not measurements of OpenAI performance or charges. Documentation was checked live on 2026-10-24 for strict Structured Outputs, multipart image edits and Standard prices; see [API cost model](docs/api-cost-model.md).

POC 02's single prior controlled comparison remains unchanged in `references/POC_02_DECISION.md` and `references/technical/POC_02_RUN_2026-10-24.json`: GPT-4.1 mini, GPT Image 2.5 Flare/low; A text-ready 4.810s/full 16.823s; A/B image phases 12.002s/11.381s; B's image cost estimate about 2.62× A. B reused A's script. Those are one observed pair, not a representative benchmark or a POC 03 speedup. Prior subjective visual ratings are not re-assigned to this implementation.

The next live check, if separately authorized, should run one two-decision story with the same first choice/twist, inspect the named clue and causal second decision, and verify current appearance across all four images. Bound the number of calls before starting; do not run a large batch or automatic retries. A/B remains optional and costs extra image calls. This implementation did not reuse the already-consumed POC 02 paid-test authorization.

## Remaining limits and recommendation

**Continue to a bounded live demo review**, with these explicit limits:

- Node 24.14.0's built-in SQLite API is experimental. No native dependency/service was added; reevaluate runtime maturity before broader adoption.
- This is request-driven local orchestration. A restart/disconnect may leave a running stage until its four-minute lease expires; reads recover it, never automatically call the provider. There is no worker queue or instant provider-resume guarantee.
- The application budget uses verified expiring rates and token allowances; in-flight tokens, unknown billing and other API use prevent an absolute provider billing cap. Hard call counts remain effective even with unpriced models.
- Causal ID/state validation protects structure and identity, not semantic truth or high-quality writing. New fact IDs can still express a semantic contradiction; live visual/narrative coherence needs human review. Appearance changes apply to the pair rather than separate timestamps within its panels.
- Local disk corruption requires backup/restoration. JPEG checks cover bounded markers, not full decoding/checksum. Old replay/orphan files are retained; no automated garbage collection.
- No accounts, public deployment/share links, platform library, creator studio, cloud persistence or multi-user guarantees were added.

See [architecture](docs/story-engine-architecture.md), [cost model](docs/api-cost-model.md) and the updated [README](README.md) for setup, API/state machine and recovery details. Secrets, `.env.local`, databases, generated images and test artifacts are excluded from Git; the example key remains blank.
