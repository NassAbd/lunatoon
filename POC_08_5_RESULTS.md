# POC 08.5 — Creator waiting artwork and final navigation polish

Date: 2026-10-25. Branch: `fix/final-ui-creator-waiting`. No paid OpenAI calls, narrative-engine changes, new product features, database migrations or destructive data operations.

## Git baseline and preservation

The initial working tree was clean on `feat/final-reader-ux-polish` at `f5e2c69d991725455f92deb8d20f19fb9a96a615`. A scan of 15 commits and 445 unique historical blobs found no credentials; the index was empty. The checks include credential patterns, configured secret values compared without printing them, placeholder-only `.env.example` and ignored private-file probes.

POC 08.4 was pushed normally to [its remote branch](https://github.com/NassAbd/lunatoon/tree/feat/final-reader-ux-polish). `git ls-remote` confirmed that exact SHA before this new branch was created and again during final verification. No force push, history rewrite or merge into `main` occurred. POC 08.5 remains local until separately authorized for push.

Fresh SQLite backups captured both databases, including committed WAL content. Integrity checks and record comparisons verified **250 records and 25 private files**; files were SHA-256 checked. Investigation used read-only queries and a separate audit copy. All original records and files remain unchanged at verification. Previously confirmed user deletions were not restored. Automated tests use temporary stores and an isolated mock server, not the user's running app.

Private backups and audit evidence remain ignored in `test-results-live/poc-08-5/`. Prior browser artifacts were preserved in `prior-artifacts/pre-browser-artifacts.tar.gz` before the suite. Credentials, SQLite/WAL files, `data/`, uploads, generated artwork, backups, diagnostic artifacts and test output remain excluded by existing ignore rules. No private content or generated images are added to Git.

## Verified cause and compatibility decision

POC 08.4 deliberately accepted only a bundled scenery allowlist or references explicitly designated **Setting** (`environment`) in the frozen template. It did not inspect completed Creator opening records. This was a conservative selection limitation, not a rendering failure.

Read-only inspection of the affected legacy Creator version found three completed opening illustrations and an unassigned reference, but no Setting role. Its frozen bible matched its saved template; the owned opening files existed and matched their hashes. Therefore the old selector correctly returned no scenery under its original rules. The existing opening ledger additionally retained server-authored composition metadata: the first panel was a wide establishing scene, followed by a character-focused medium shot and a detail close-up. Visual inspection of the protected first-panel copy confirmed a broad city setting containing the protagonist. It is suitable atmospheric context, not character-free landscape art. The private artwork is not reproduced in this report.

| Case | POC 08.4 behavior | POC 08.5 behavior |
| --- | --- | --- |
| Built-in story | Owned authored scenery allowlist | Unchanged |
| Legacy Creator with no Setting, but a verified completed establishing opening | Decorative placeholder | Reuse only the qualifying first opening |
| New Creator with explicit Setting and matching completed opening | Reuse Setting reference | Setting first, then qualifying opening; duplicate IDs removed |
| Legacy placeholder version, missing ledger or uncertain composition | Decorative placeholder | Unchanged fallback |
| Missing, corrupt, deleted or foreign asset | Excluded or local fallback | Excluded or local fallback; no generation or ownership bypass |

The new server-side `src/lib/creator/waiting-artwork.ts` adapter reads the exact saved template version. It requires matching normalized immutable template content, draft/version ownership, a complete ordered opening ledger matching the saved beats, and the exact existing code-authored first wide-shot classification. Medium shots, close-ups, arbitrary captions, filenames and keyword-rich custom directions cannot establish eligibility.

The chosen asset must belong to that draft and the run's frozen bible, have the expected opening kind, MIME type and dimensions, use the canonical saved reference path, match its SHA-256 checksum, and pass existing safe-file and deletion checks. The adapter uses read-only SQLite and does not open a mutating Creator store, migrate storage, recover stages or change saved data. An optional metadata/file failure returns no additional scenery rather than breaking the reading.

Only eligible asset IDs reach the reader. The existing selector intersects them again with frozen opening beats and bible assets, then produces the existing run-scoped asset URLs. The owned asset route remains unchanged. Explicit Setting references keep their priority; the current four-image maximum remains. The same adapter on a copy of the actual legacy bible returned exactly its first opening ID without changing records.

An additional regression verifies an empty `LUNATOON_DATA_DIR`: the adapter uses the same `./data` default as the application runtimes, while an explicit supplied test directory still takes precedence.

Waiting rendering is unchanged: saved-atmosphere labeling, genuine-preview priority, independent final decoding/reveal, fixed geometry, reduced-motion behavior and both-final chapter/ending gates remain in place. A failed scenery GET drops only that decorative image and keeps the fallback; it never starts or retries an API request.

## Navigation and About spacing

The shared header now uses CSS `position: sticky`, `top: 0` and a modest stacking level, with the existing warm off-white canvas, lime brand mark and subtle border. It stays in normal layout flow at 72px desktop height. Narrow screens use a 104px two-row layout with all four links visible. Library, Saved stories, Studio, About, story presentations and active readings share this header; `/experiment` now reuses it as well, preserving its existing generation controls.

Root `scroll-padding-top` follows the responsive header height plus 16px, so native anchor and `scrollIntoView` targets clear the header. There are no new scroll listeners, page-navigation handlers or reader remounts. Existing chapter margins and offscreen decision compaction are preserved.

The new Back-navigation test exposed a pre-existing stale client-history snapshot: after generating both illustrations, visiting About and pressing Back showed the initial empty reader despite complete persisted data. The trace confirmed no fresh run request on return; generation, image anchoring and compaction had already passed. `SavedReader` now refreshes its route cache after explicit reader work, guarded to the current run URL. Next's installed `use-router` documentation specifies that `router.refresh()` merges fresh server props while retaining current client state and scroll. It reads saved state without scheduling generation, adding a small local route request. The regression still requires both restored images, the same document and the original panel position; its assertions were not relaxed.

After the product fix, a diagnostic run separated a test-driver effect from application behavior: Playwright's automatic locator-click scroll moved the page by 508px before the sticky link's pointerdown. Back correctly restored that test-imposed position. The regression now verifies the visible link's hitbox and clicks its center with a normal pointer. The corrected targeted test restored the exact recorded panel coordinate; no application scroll workaround was added.

Two existing continuity tests also counted same-URL `history.replaceState` events from Next's cache refresh as navigation. Traces showed a single initial document request followed by RSC fetches; their position and identity checks passed. Their guards now require zero subsequent document navigation requests and zero URL-changing frame events, alongside final document time-origin and reader/decision/panel identity checks. A reload or actual automatic route change still fails these tests.

About section action links are inline-flex elements with 16px top spacing. The rule is scoped to direct section actions; paragraph typography, destinations and the editorial layout remain unchanged.

## Automated verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **255 tests across 33 files passed** (25 new unit regressions).
- `LUNATOON_DATA_DIR=<isolated directory> npm run test:engine:build`: passed, using the production optimizer in `.next-engine`.
- Combined original and persistent/Creator Playwright suites: **all 72 checks verified**, with no test retries. The last full sweep passed 70 and flagged only the two same-URL event-counter checks described above. After correcting that test instrumentation, both passed, together with the Back-navigation regression, in a final three-test run (21.3 seconds). Application code and its production build were unchanged between these runs.

Browser commands used `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config=test-results-engine/poc08-5-all.config.ts --output=test-results-engine/poc08-5-verified`, followed by the same combined config with output `poc08-5-continuity-verified` and `--grep 'completed decisions compact only|both decisions append in place|sticky navigation preserves'`. The ignored combined config includes both `tests/e2e` and `tests/engine-e2e`, using the existing temporary-data mock harness on port 3110. Earlier failed-run traces remain available alongside the final evidence.

The 24 new adapter regressions cover exact frozen versions, read-only storage/file hashes, missing ledgers, shot/status/version/owner mismatches, canonical paths, dimensions, checksums, symlinks, tombstones, foreign assets and the empty data-directory setting. One selector regression checks that derived IDs cannot bypass frozen opening membership.

Ten new browser tests exercise actual isolated Creator save/opening routes through the SDK against a local fake provider, legacy/new/unknown/missing scenery cases, no extra generation, foreign-asset rejection, immutable records, independent finals, completion gates, sticky navigation across eight routes, client navigation, About spacing, hash clearance, decision compaction and back-navigation scroll restoration. Existing suites retain real-preview priority, reduced motion, retry/recovery, persistence/restart, call limits and two-decision coverage.

All generation evidence in this iteration is mocked. Test delays establish ordering and visibility only, not real API latency or new image quality. No provider configuration, pricing, model or API capability has changed. Node's existing experimental SQLite warning remains.

## Screenshots

Actual browser screenshots were reviewed at 1440px, 1024px and 390px. Navigation remains visible and usable without horizontal overflow; About actions have consistent spacing and reader targets clear the header. The captures are local, ignored artifacts under `test-results-live/poc-08-5/screenshots/`. Creator test artwork is synthetic fixture imagery; it does not represent live visual quality or the user's private story.

| View | File |
| --- | --- |
| Sticky Library | `sticky-library-1440.png`, `sticky-library-1024.png`, `sticky-library-390.png` |
| Sticky Studio | `sticky-studio-1440.png`, `sticky-studio-1024.png`, `sticky-studio-390.png` |
| About action spacing | `about-spacing-1440.png`, `about-spacing-1024.png`, `about-spacing-390.png` |
| Reader after independent final reveal | `sticky-reader-1440.png` |
| Legacy Creator waiting atmosphere | `legacy-creator-waiting-1440.png`, `legacy-creator-waiting-390.png` |
| Existing experiment navigation | `sticky-experiment-1440.png`, `sticky-experiment-1024.png`, `sticky-experiment-390.png` |

## Manual validation and remaining limits

Use the isolated mocked-provider harness for generation checks; it is free and keeps valuable saved stories untouched. After the isolated build, `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e -- navigation-polish creator-waiting-compatibility chapter-completion` exercises these cases. For interactive inspection, start `node tests/support/engine-test-server.mjs` and use its local port 3110. Do not run generation on the normal configured app without separate paid-call authorization.

1. Open a built-in story, begin a test reading and submit its first choice. Confirm dialogue arrives first, labeled saved scenery appears while waiting, and both final images reveal independently without moving the visible panel.
2. Open an existing Creator reading. A saved Setting reference is eligible; otherwise only a matching complete first establishing opening can qualify. Inspect without regenerating or editing historical artwork. Legacy placeholder/unknown metadata correctly retains the decorative fallback.
3. In the isolated Studio, create a disposable story and generate its mocked foundation, then upload an owned image, explicitly assign Setting and Save & Illustrate. Start that version and check Setting/opening atmosphere. The browser regression also checks a no-role legacy version and missing metadata.
4. Confirm the next decision stays hidden until both final images are visible. A partial preview or waiting scenery must not unlock it. Try the mocked missing-asset/failure case and explicit recovery; reload completed content without new calls.
5. Scroll Library, Saved, Studio, About, story presentation and active reader at 1440px, 1024px and 390px. Use each header link; check no horizontal overflow or obscured anchor targets. Scroll beyond a completed decision, then navigate away and back; the same visible chapter should remain anchored.
6. Check both About action links for equal paragraph spacing and correct destinations. Enable reduced motion and confirm scenery remains still and final completion still unlocks progression.

Scene classifications establish authored intent, not pixel-level recognition. A setting can contain characters, and generated art can deviate from its requested shot. Conservative fallback is retained whenever provenance is insufficient. The adapter supports the currently verified Creator schema version (2); it does not upgrade older databases. Missing legacy metadata is not reconstructed or written back. No additional live-provider test or subjective improvement in live art is claimed.
