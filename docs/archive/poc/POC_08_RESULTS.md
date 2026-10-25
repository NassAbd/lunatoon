# POC #8 — Creator platform

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-24. Work branch: `feat/creator-platform`. Baseline: POC #7 `a0e9354e939691e723a048340e1f71e88a29679f`, pushed and verified before application changes. This iteration uses mocked providers only; no paid OpenAI generation or live quality results are claimed.

## Architecture and data protection

See [the pre-implementation assessment](../../story-template-architecture.md). The existing SQLite reading engine is reused. New immutable story-template snapshots parameterize initial choices/state, opening facts, protagonist, visual references, visual briefs and narrative prompts. Old Neon bibles without template metadata retain their original behavior. No reader database migration is required.

The original database and reference/image files were backed up before storage changes using SQLite's backup API. Development uses an isolated copy; automated tests use temporary directories. All 209 original records and 53 assets matched their pre-change hashes at the Gate A checkpoint. Eleven historical completed Neon stories and 44 final images loaded through the new HTTP reader routes against that isolated copy, creating zero generation events.

## Implementation gates

- **Gate A passed:** 113 unit/SDK tests, typecheck, lint, production build and eight mocked-provider browser tests. Neon and Lightkeeper completed two decisions/four images with their own references. Tests cover dialogue-first delivery, independent completion, immutable versions, saved context, restart/reload, explicit retries, duplicate claims, call limits and failure diagnostics.
- **Gate B passed:** all three story journeys and library tests passed before Creator implementation. Each new world reached an ending with its own exact reference bytes, saved state and restart/reload behavior. Six preview cards have no generation action.
- **Gate C passed:** 151 unit/SDK tests and six Creator browser tests. All zero/one/three-reference creation-to-ending journeys passed, including remove/replace, template-version isolation, restart, no regeneration, lost-response recovery, explicit retries and upload defenses.
- **Gate D passed:** six export unit tests and the completed-story download/offline browser test. Saved artwork and text read with network disabled; no new generation calls or record changes occurred.

## Evidence and limitations

Browser checks use installed Chrome because the Playwright-managed browser revision is not installed. An initial launch attempt failed before browser execution; it was rerun with the configured `PLAYWRIGHT_CHANNEL=chrome`. Mock delays are test fixtures, never API latency measurements. New-world live narrative and image quality remains unverified.

Reference editing keeps the configured image model/quality and supplies the story's owned reference array. Zero references cannot silently use Kael. Planning estimates scale by reference count; three references can require a higher explicitly configured run budget than the default $0.30. Reservations remain estimates, not provider billing caps.

## Playable worlds and preview catalog

| Story | Foundation and visual identity | Evidence |
| --- | --- | --- |
| Neon Protocol | Existing Kael, device, New Kyoto and cyberpunk opening | Legacy behavior and saved runs preserved |
| The Last Lightkeeper | Mara, seafoam cape, brass tide lantern, a coast whose tide has stalled | Complete mocked two-decision story with Mara reference |
| The Glass Orchard | Ivo, copper spectacles, seed compass, terracotta/plum solarpunk orchard | Complete mocked two-decision story with Ivo reference |

Coming soon: **Velvet Signal**, **Cloudbreak Express**, **The Quiet Giant**, **Salt & Stardust**, **Paper Kingdom**, and **Blue Hour Society**. These are original title/genre/description/cover previews, not playable engines. Their cards offer no reading or paid-generation action.

New artwork is authored original SVG. Mara and Ivo reference PNGs are rasterizations of those original sheets. Provenance and identity notes are under `references/visual/` and `references/narrative/`. No WEBTOON artwork was downloaded or bundled.

## Creator Studio

`/studio` supports Describe → Configure → Generate → edit → Save → Play. Generation is one explicit GPT-4.1 mini Structured Outputs request using the configured narrative model; the strict foundation carries world, protagonist, motivation, art direction, initial state, short opening and exactly three choices. JSON, identity, ownership and irreversible state checks apply before saving.

Creators can edit the title, genre, synopsis, world, premise, character/visual guidance, opening captions, first decision and continuity notes. Editing a choice clears only that choice's inferred forced object effects, so a revised action cannot retain an obsolete destruction requirement. Lost-response recovery reads the durable result and adopts the successful requested foundation without paying again or replacing later manual edits.

Zero, one and three references are supported. Server-side validation checks actual bytes, fully decodes still PNG/JPEG/WebP, limits size/dimensions, strips metadata and stores canonical PNGs outside `public/`. Draft/template membership gates all asset reads. Removal affects the draft, not already saved versions or runs. Cross-site Creator requests are rejected, but this remains a local single-user application without authentication.

The cover and opening use explicitly labeled authored placeholders; alt text also describes them honestly. There is no hidden artwork generation during creation. Ready templates appear in the local library and use the same two-decision reader. A separate `creator.sqlite` ledger records foundation attempts, usage, estimated/unknown costs, leases and immutable versions without migrating `stories.sqlite`.

## Corrections found during verification

- Copy `FileList` into an array before resetting the upload input, so asynchronous uploads receive the selected files.
- Explicitly associate editable textarea labels; preserve accessible names after values change or reload.
- Invalidate stale choice effects on edited actions, with regression tests.
- Recover a successful foundation after a lost HTTP response without duplicate provider work.
- Identify decorative placeholders accurately for assistive technology; improve text/focus contrast.
- Test upload replacement only after the removal response enables the UI; `setInputFiles` can bypass a disabled control.

One 1440px full-page Chrome capture repeated compositor tiles. It was rejected as evidence and replaced with real viewport/section screenshots. Synthetic provider outputs and delays are clearly separated from live evidence.

## Sharing decision

Implemented **Download story** for a completed run with all illustrations saved. The result is one portable HTML file containing embedded raster images, dialogue in narrative order, and saved choice/twist recap. It can be transferred and read offline. It contains no generation code, external assets, raw state, references, diagnostics, credentials, IDs or filesystem paths. Visible user-authored twists are deliberately part of the story copy.

The exporter reads a consistent SQLite transaction without invoking engine recovery or creating a database. It verifies exact completed panels, ownership and order; opening assets are checksum-verified. Missing/corrupt images and unsafe SVG/resource declarations are rejected. Re-encoding strips image metadata; all user text is escaped and CSP blocks script/network execution. No new generation or storage mutation is performed. Dialogue is rendered as readable captions beneath the artwork so the portable copy does not cover faces or actions.

Local saved-run URLs remain local. There are no public links, hosting, authentication, cloud sync or transferable editable runs. Older Neon runs export their original saved opening and prose rather than borrowing newer catalog assets. The bounded HTML format rejects exports exceeding its image limits.

## Final verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 157 tests / 23 files passed |
| `LUNATOON_DATA_DIR=<isolated-copy> npm run test:engine:build` | Production build passed |
| Combined legacy + persistent Playwright suites | 37 tests passed using installed Chrome and the isolated mock server |
| Historical compatibility | 11 completed Neon runs / 44 saved final images readable; zero added generation events |
| Original-data integrity | All 209 records and 53 assets match the pre-change manifest; SQLite integrity `ok` |
| Git/secret audit | 89 staged files plus 10 existing commits / 235 unique historical blobs scanned; no findings |

The combined browser invocation used an ignored local config extending `playwright.engine.config.ts` to include both `tests/e2e` and `tests/engine-e2e`. The repository's ordinary `test:e2e` and `test:engine:e2e` scripts cover those same test sets separately. The mock server uses a dummy API key, loopback provider and temporary database. Its three-reference fixture budget is explicitly $0.50; the product default remains $0.30.

The secret audit checked known credential patterns and compared local configured secret values in memory without printing them. `.env.example` contains no secret value. Ignore probes cover environment files, both SQLite databases/WALs, generated images, uploads, private story data and local test artifacts. Only authored public artwork and safe project files are included. POC #7 remains synchronized at `a0e9354`; this new branch is committed locally only, with no push or merge.

Browser coverage includes all three bundled worlds, zero/one/three-reference Creator stories, two decisions/four panels/ending, exact reference ownership, template-version isolation, refresh/process restart, dialogue-first and out-of-order completion, genuine-preview versus final-only fallback, truncated streams, explicit retries, idempotency, cost limits, scroll anchoring, reduced motion, desktop overflow and offline export. Existing tests were preserved; old library selectors were scoped to their updated catalog sections.

**GO for the local multi-story/Creator demo and portable static export.** Live quality for new worlds and arbitrary creator prompts still requires separately authorized testing; this iteration establishes no live quality or latency claim.

## Visual evidence

Actual UI captures are local, ignored test artifacts under `test-results-live/poc-08/screenshots/`; they are not uploaded private story data. Both widths were inspected. The Creator and generated-reader fixtures use synthetic content and demonstrate layout, not live AI illustration quality.

| Screen | 1440 px | 1024 px |
| --- | --- | --- |
| Library | Screenshot — local-only `test-results-live/poc-08/screenshots/library-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/library-1024.png` |
| Six previews | Screenshot — local-only `test-results-live/poc-08/screenshots/previews-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/previews-1024.png` |
| Neon opening | Screenshot — local-only `test-results-live/poc-08/screenshots/neon-protocol-opening-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/neon-protocol-opening-1024.png` |
| Lightkeeper opening | Screenshot — local-only `test-results-live/poc-08/screenshots/last-lightkeeper-opening-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/last-lightkeeper-opening-1024.png` |
| Orchard opening | Screenshot — local-only `test-results-live/poc-08/screenshots/glass-orchard-opening-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/glass-orchard-opening-1024.png` |
| Creator prompt/configuration | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-prompt-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-prompt-1024.png` |
| Editable foundation | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-edit-3-refs-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-edit-3-refs-1024.png` |
| Uploaded references | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-references-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-references-1024.png` |
| Saved creator story | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-saved-story-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-saved-story-1024.png` |
| Completed mock reader | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-completed-reader-mock-1440.png` | Screenshot — local-only `test-results-live/poc-08/screenshots/creator-completed-reader-mock-1024.png` |

## Remaining limitations and demo recommendation

- New worlds and Creator foundations have **mocked end-to-end evidence**, not new live OpenAI quality evidence. No paid calls or new actual latency/cost measurements were made. A separately authorized bounded live check is recommended before presenting new-world image fidelity as proven.
- Structured validation protects recorded state; it cannot prove that every natural-language sentence or generated pixel respects that state. Reference images guide rather than guarantee consistency.
- Creator openings are honest decorative placeholders. This iteration does not generate cover/opening artwork or build a visual editor.
- Manual edits are saved explicitly, not autosaved. Removing a reference retains older-version bytes. Garbage collection/deletion is intentionally deferred to protect saved runs.
- This is a local single-user system. ID membership and same-origin checks are not authentication; no public deployment or cross-device run synchronization is implemented.
- Monetary reservations are estimates. Three-reference stories can need a deliberate higher run budget; hard call counts and explicit retries remain enforced.
- Node's SQLite API remains experimental. No destructive reader migration was introduced, and the POC #7 branch and local backup remain available as fallbacks.

Recommend demonstrating the approved Neon flow plus the locally validated multi-story/Creator workflow, with an explicit distinction between mocked regression evidence and live generation. Preserve the fallback and backup before any future live demo.
