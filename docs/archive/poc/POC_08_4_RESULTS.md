# POC 08.4 — Final reader UX and authorized historical cleanup

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-25. Branch: `feat/final-reader-ux-polish`, based on POC 08.3 `6bd1d3f8729a29ec013fcbaafa23703a7ba88fbc`. No paid OpenAI calls, new models, database migrations or narrative-engine changes.

## Historical cleanup and protection

The latest user request explicitly authorized ten listed historical reading IDs. Fresh read-only inspection reconciled all ten against the actual SQLite databases. Timestamps are stored as Unix epoch milliseconds; the authorized Europe/Paris calendar day was the half-open UTC interval **2026-10-23 22:00 through 2026-10-24 22:00**. All ten matched October 24 locally. There were no additional readings on that date, no ambiguous ownership and no pending/running generation for the selected readings.

Both databases were backed up using SQLite's backup API, including committed WAL content, and passed integrity checks and record comparisons. All 50 private files were copied and SHA-256 checked. The fresh baseline contained 272 records and 15 readings; it included newer activity absent from the earlier POC 08.3 inventory. No older backup was restored over that activity.

Deletion used the existing local HTTP preview, confirmation revision, tombstone and resumable-cleanup API. A durable private journal recorded each operation ID before its POST. All ten operations completed on their first request; no uncertain request was retried and no direct filesystem sweep was used.

| Verified result | Count |
| --- | ---: |
| Authorized readings removed | 10 |
| Associated chapter/decision records removed | 16 |
| Panel records removed | 24 |
| Generation accounting records removed | 73 |
| Exclusively owned JPEGs removed | 24 |
| October 25 readings preserved | 5 |
| Other pre-existing records unchanged | 149 |
| Remaining private files unchanged | 26 |
| New scoped deletion-ledger records | 54 |
| Unrelated changes or concurrent additions during cleanup | 0 |

At the authorized cleanup's verification, all Creator tables, immutable story records, uploaded references and shared artwork were unchanged. The five preserved later readings included completed Running Hell and a newer completed Neon Protocol. Read-only listing and `GET /saved` excluded all ten deleted IDs. Both completed surviving stories returned their saved HTML exports with embedded artwork and endings. Those checks used no generation/recovery endpoints. Logical deletion does not erase the protected backups or the audit ledger.

**Separate concurrent user action:** preservation checks passed at 07:16 and 07:26 UTC. A later check detected five additional completed deletion receipts at 07:31:17–07:31:28 UTC, outside our ten-operation journal. The user explicitly confirmed in this conversation that they intentionally deleted those remaining October 25 readings themselves. Their deletions were left in place, without restoration or further cleanup. The table above describes our authorized ten-reading cleanup at its verification point; it is not a claim that the five later readings still exist. Automated browser tests used a separate temporary directory and port 3110, not the live installation on port 3001. The protected pre-cleanup backup remains available.

After those user deletions, there are no saved readings. All 12 Creator records, three immutable story bibles and 18 remaining private files/shared references are unchanged. The full backup was reverified: both databases, all 272 records and all 50 file hashes remain valid. The separate user-action chronology is retained in the ignored `final-concurrent-deletion-audit.json`.

Private evidence stays ignored under `test-results-live/poc-08-4/`: `CLEANUP_REVIEW.md`, `cleanup-inventory.json`, `exact-deletion-plans.json`, `cleanup-http-journal.json`, `postcleanup-verification.json` and `saved-after-check.json`. The verified backup is `baseline-backup-B9SuRD/`. Exact reading IDs, private asset paths, narrative data and artwork are not copied into this committed report.

## Git checkpoint

After cleanup, the clean POC 08.3 branch was scanned: 14 commits and 425 unique historical file blobs, with no credential findings; the index was empty. The scan checks credential patterns, configured secret values without printing them, and safe `.env.example` placeholders. Ignore rules cover credentials, databases/WAL files, private data, images/uploads, backups and test output.

`fix/visual-consistency-legacy-cleanup` was pushed normally to [GitHub](https://github.com/NassAbd/lunatoon/tree/fix/visual-consistency-legacy-cleanup). `git ls-remote` confirmed SHA `6bd1d3f8729a29ec013fcbaafa23703a7ba88fbc`, identical to local HEAD, before creating this branch. No force push, history rewrite or main merge was used. POC 08.4 is committed locally only.

## Approved UX scope

The current [Lunatoon Notion backlog](https://app.notion.com/p/4044f2679622815c9555e35e98114788) was fetched on October 25. Its two items match the supplied request: Library → illustrated presentation → reader, and honest waiting artwork with chapter completion gating. No other backlog features were added.

### Library navigation

Playable built-in and Creator Library cards now have one green **About this story** link. Card-level Developer details and the duplicate secondary link are removed. Next.js `Link` preserves client navigation. The existing presentation retains its illustrated opening, description and **Begin the story** action; merely opening it creates no reading and makes no generation request. Explicit Begin uses the existing idempotent creation route and client router. Saved-reading links, Creator management, Studio play controls and technical diagnostics remain available in their existing places.

### Waiting artwork and final reveal

`reader-waiting-artwork.ts` selects only assets already in the run's frozen bible. Creator references must be explicitly labeled **Setting** (`environment`) and selected by that saved template. Unassigned references, character portraits, styles and unrelated assets are excluded. The three bundled worlds use small allowlists of their authored establishing/setting artwork; the canonical historical Neon opening can reuse its existing public city/surveillance art. Captions and filenames are never used to guess whether an arbitrary upload depicts scenery.

One suitable image remains still. Two or more crossfade every eight seconds, with a restrained 1.4-second opacity transition and a visible **Saved scenery · atmosphere while you wait** label. This is decorative waiting artwork, not a preview or progress estimate. Reduced motion disables rotation and transitions. Missing images are discarded; if none remain, the existing decorative placeholder stays visible. Genuine provider preview events take priority immediately.

Final images still decode and reveal independently with the existing short fade. Absolute layers retain panel geometry, dialogue overlays, DOM identity and scroll position. There is no new provider request, reference transformation, background generation, automatic retry or cross-story asset query.

### Chapter completion gate

The previous UI rendered the next decision when the script existed and rendered the ending when the narrative state was ended. It could therefore reveal both while images were pending or failed.

The new presentation-only gate requires exactly two complete, saved illustrations for the chapter **and** final-image visibility receipts in the current browser document. Receipts are keyed by panel and operation ID. A real preview, scenery, decode alone or an earlier replay's receipt cannot unlock progression. The ending additionally requires all chapters' final illustrations. Reload starts with fresh display receipts and reads existing assets, without generating anything.

Failure preserves the dialogue and successful sibling, exposes explicit recovery and keeps the next decision/ending hidden. A local image-download failure offers its existing local GET retry; an actual generation failure retains its existing explicitly paid retry. Historical readings that already advanced with unfinished artwork retain their submitted history so those earlier images remain recoverable. Backend narrative state, validation, chronology, accounting, reservations, call limits and idempotency are unchanged.

## Verification

TypeScript typecheck, ESLint, all **230 unit/SDK tests across 32 files**, and the production build pass. The final combined Playwright run passed **all 62 browser tests** in 4.4 minutes, with zero retries. The first sweep exposed incorrect fixture expectations/numbered-radio matching, a mock-delay assertion deadline and the reduced-motion cascade issue; those were corrected before the clean final run.

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `LUNATOON_DATA_DIR=<isolated build directory> npm run test:engine:build`, and `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config=test-results-engine/poc08-4-all.config.ts --output=test-results-engine/poc08-4-final`. The ignored combined config runs both original and persistent/Creator suites against the existing mocked-provider harness. Build output is production-optimized in `.next-engine`; no local story data is used by that build.

New unit coverage checks conservative scenery selection, missing/unassigned/foreign references, canonical legacy fallback, both-final requirements, partial/failed states, replay operation identity and reload readiness. Browser additions cover client navigation without document reload, zero creation before Begin, correct Creator template selection, environment ownership, genuine-preview priority, reduced motion, independent arrivals, scroll geometry, explicit recovery and saved-image availability after reload/restart. Existing story, Creator, cost, idempotency, streaming interruption and deletion coverage is retained.

All generation tests use mocked providers, synthetic raster fixtures and isolated temporary stores. Synthetic delays establish behavior only; they are not OpenAI latency measurements. No live visual-quality, preview-delivery or speed improvement is claimed.

Browser checks caught the global reduced-motion rule overriding the scenery's zero-duration transition; a specific reduced-motion override now disables that transition entirely. The final-image reveal retains its existing near-instant reduced-motion animation event so completion diagnostics and progression still work.

### Desktop screenshots

Actual browser captures were reviewed at 1440px and 1024px. Library actions fit without horizontal overflow. Waiting artwork keeps dialogue legible and visibly labels the scenery as atmosphere. These use bundled original artwork and mocked story text, not private uploaded or live-generated images. Screenshots remain ignored local artifacts:

| View | Local screenshot |
| --- | --- |
| Library cards, 1440px | `test-results-live/poc-08-4/screenshots/library-cards-1440.png` |
| Library cards, 1024px | `test-results-live/poc-08-4/screenshots/library-cards-1024.png` |
| Waiting illustration, 1440px | `test-results-live/poc-08-4/screenshots/mocked-waiting-artwork-1440.png` |
| Waiting illustration, 1024px | `test-results-live/poc-08-4/screenshots/mocked-waiting-artwork-1024.png` |

Previous test artifacts/screenshots were preserved before running the new suite. Copied TypeScript test configurations have a `.backup` suffix in the archive so their old relative imports are not compiled as application code; their contents are retained.

## Limitations and manual review

- Older Creator versions without explicit environment roles keep the placeholder. Existing immutable versions and previously generated assets are not retroactively relabeled or regenerated.
- A Setting designation is a creator's statement about their asset, not automatic image-content verification. Choose setting artwork accurately. The current story's imagery is local to this unauthenticated installation.
- Genuine partial images remain optional provider behavior. Scenery does not imply progress or guarantee quicker generation.
- Check the Library at 1440px and 1024px: one primary action per playable card, illustrated presentation, then explicit Begin. Confirm visiting the presentation adds no Saved reading.
- In the mocked demo, observe dialogue first, scenery or a genuine supplied preview, independently arriving finals, then the next decision. Repeat with a failed final and verify only explicit recovery unlocks progression. Reload a completed story and verify no new generation calls.
- For an actual paid demo, use separate authorization and the existing explicit controls. No live generation was performed in this iteration.

The protected POC 08.3 branch remains the source fallback. The pre-cleanup backup remains available for deliberate recovery; do not automatically restore it over newer readings.
