# POC 08.1 — Illustrated creation and local content management

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-24. Branch: `feat/illustrated-creator-management`. Provider tests in this iteration are mocked; no paid OpenAI calls were authorized or made.

## Baseline and data protection

Approved POC 08 commit `16854ca36af1f61a8a611da882ec34a7b08ca4c9` was verified on `feat/creator-platform`. Before application changes, the credential audit scanned 11 commits and 324 unique historical blobs with no findings. Ignore checks covered both SQLite databases and WAL files, uploaded/generated artwork, environment secrets, private stories and test artifacts. The branch was pushed without force and its remote SHA was verified. POC 08 remains the fallback; this new branch is local only.

Both original databases were backed up with SQLite's backup API, alongside all original assets. The snapshot contains **249 records and 76 assets**, with database integrity `ok` and matching row/content hashes. Development uses a separate copy. All deletion and generation tests use temporary stores; no test deletes user content. Backup locations and hashes remain in ignored local artifacts.

## Opening architecture and UI

**Save draft** persists creative edits without making image calls. **Save & Illustrate** explicitly prepares a saved version and submits its independent scene requests. The foundation supplies the scene count and captions. Each opening scene has a stable ID, description, composition, saved visual context, status, attempt receipts and final asset association.

The existing reader image generator is reused with its configured model and quality. Zero references use its text-image path; one to three references use the owned reference-edit workflow. No second preview pipeline, automatic paid retry, model substitution or hidden fallback is added. Genuine provider previews remain transient; final JPEGs are durable and content-addressed.

Opening stages survive reload/restart. A duplicate operation cannot start another paid request. Failed or interrupted scenes require explicit action and preserve successful siblings. New versions publish only after all final scenes are stored; earlier ready versions and reading snapshots remain immutable. Exact visual-input fingerprints permit verified reuse without new calls. Changes to character, scene, references or art direction invalidate reuse.

The Studio shows individual scene states and makes **Play your story** available only when ready. Developer details retains usage, estimated/unknown cost and timing information. The opening budget is separate from the foundation and reading budgets: default 8 image attempts and $1 estimated spend per version, configurable within bounded limits. These are application safeguards, not provider billing caps.

Official compatibility and pricing were checked on 2026-10-24; direct citations and implementation details are in [the architecture note](../../creator-content-management.md). Partial delivery remains optional. Live quality and preview delivery for Creator openings remain unverified.

## Deletion and ownership

Saved-reading deletion removes its chapters, choices, state, attempts and exclusively owned files, preserving templates and sibling readings. Creator-story deletion covers its draft, all saved versions, owned artwork and associated readings, with a fresh cascade count and explicit confirmation. Built-in catalog templates are never deletion targets.

Both SQLite stores share a short write gate. Deletion first persists tombstones and an exact cleanup plan; later database and filesystem phases can be resumed. Shared files are retained if any surviving owner references them. Active generation blocks deletion. Claims, final writes and reads are fenced so a late provider response cannot recreate deleted content. File cleanup rejects traversal and symlinks and uses exact ownership records, not broad directory deletion.

A concrete pre-existing race was found during implementation: reader image receipt persistence and file writing were separate, and the write did not recheck the claim. The correction checks the active claim while holding the shared write gate around the actual file write. Regression coverage releases a late provider result after deletion and verifies that neither records nor files return.

Review also caught a cleanup honesty edge case: filesystem access errors must not be treated as missing files. Cleanup now suppresses only `ENOENT`; other access failures remain resumable failures. Creator asset directories are created only through the path-validated writer, so a symlinked parent is rejected before any outside directory can be created.

The UI uses accessible confirmation dialogs with Cancel and **Delete permanently**. It displays pending/failed cleanup honestly and removes rows only after server-confirmed completion. Pending jobs remain available for explicit recovery after reload. Deletion does not erase separately created backups or promise forensic storage erasure.

## Validation record

All generation and destructive tests use isolated data, a dummy credential and a loopback mocked provider. Synthetic provider images, usage and delays are test fixtures, not live API observations.

The regression suite covers explicit draft saving, zero/one/three references, three/four actual opening scenes, concurrent out-of-order completion, real mock stream previews and final-only fallback, independent failure/retry, duplicate operation receipts, refresh and server restart during generation, uncertain-call acknowledgement, completed asset reuse across readings, version isolation, corruption checks, cost reservations and hard limits. Existing Creator journeys still complete both decisions and their four continuation images.

Deletion coverage verifies sibling and built-in preservation, shared references and content-addressed opening images, creator cascades, invalid ownership, stale confirmation, traversal/symlink rejection, interrupted cleanup recovery, duplicate requests, tombstoned operation replay, late responses and exact temporary-file ownership. Browser tests verify Cancel/Escape, keyboard focus, the cascade count, honest pending cleanup and list updates without a document reload.

An isolated copy of historical data was also loaded with the provider disabled: **22 saved readings, 56 completed panel images, 110 reference-asset reads and one legacy Creator draft** remained accessible, with **zero new generation events**. Both original databases still report integrity `ok`; their **249 original records and 76 assets are unchanged**.

Typecheck (`npm run typecheck`), ESLint (`npm run lint`), all **194 unit/SDK tests in 27 files** (`npm test`), and the isolated production build (`npm run test:engine:build` with the development data directory) passed. The combined browser suite passed **46/46 tests** in Chrome (8 legacy reader tests and 38 persistent-engine/Creator tests), using the production build. All **9/9 new opening/content-management browser checks passed again** after the screenshot-only mock JPEG correction. Desktop captures are checked for overflow, dialog placement and opaque final artwork.

Two existing graceful-restart browser tests exposed open browser-connection waits after successful generation. Completed-visit restart checks now close the old context and reopen a fresh context, following the suite’s existing pattern; the same saved-content and no-generation assertions remain. Active-work interruption coverage still interrupts an actual running request.

Screenshot review found a Chrome compositing artifact in the previous **1 × 1 opaque JPEG fixture**: the loading background remained visible even with final opacity 1 and a topmost image. A standalone probe with the actual CSS reproduced it with animations both allowed and disabled; resizing the identical fixture to **32 × 48** produced uniform opaque pixels. The mocked JPEG now uses that size. This is test-fixture evidence, not a real provider-image defect. Explicit Studio layer ordering and multi-point browser hit-testing also protect final artwork above previews and placeholders. Native deletion dialogs have explicit centered, bounded desktop geometry.

### Desktop screenshots

Screenshots are actual browser captures at **1440 × 1100** and **1024 × 1100**, kept locally in ignored test artifacts. The solid-color illustrations are deliberate mock provider fixtures; they demonstrate image loading and layout, not live art quality.

| View | 1440px | 1024px |
| --- | --- | --- |
| Completed opening and captions | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-illustrated-mock-1440.png` | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-illustrated-mock-1024.png` |
| Ready-to-play action | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-ready-actions-mock-1440.png` | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-ready-actions-mock-1024.png` |
| Partial failure and explicit retry | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-partial-failure-mock-1440.png` | Screenshot — local-only `test-results-live/poc-08-1/screenshots/opening-partial-failure-mock-1024.png` |
| Delete a reading | Screenshot — local-only `test-results-live/poc-08-1/screenshots/reading-delete-confirmation-1440.png` | Screenshot — local-only `test-results-live/poc-08-1/screenshots/reading-delete-confirmation-1024.png` |
| Delete a created story | Screenshot — local-only `test-results-live/poc-08-1/screenshots/creator-delete-confirmation-1440.png` | Screenshot — local-only `test-results-live/poc-08-1/screenshots/creator-delete-confirmation-1024.png` |


## Manual checklist

Use a separate local data directory when testing destructive actions. Live generation requires separate paid-call authorization.

### Creator journey

1. Open `/studio`, describe an original story and attach zero, one or three owned reference images.
2. Generate the foundation, inspect the character/world guidance and edit the opening captions and choices.
3. **Save draft**, refresh and verify edits survived with no image requests.
4. Choose **Save & Illustrate** after reading its charge notice. Verify independent scene completion, readable captions and clear waiting states.
5. If one scene fails, explicitly retry only that scene and verify successful siblings remain unchanged.
6. Choose **Play your story** after every scene is ready. Verify the saved opening, complete both decisions and reach the ending.
7. Reopen the saved run, restart the app and create another reading of the same template version. Confirm the opening assets are reused without new image requests.
8. Edit a material visual detail and save a new version. Confirm earlier readings retain their original artwork.

### Deletion journey

1. Create two readings of the same story in an isolated test directory.
2. Open **Delete this reading?**, cancel with both the button and Escape, and verify nothing changed.
3. Confirm deletion of one reading. Check the other reading, template and opening still load.
4. In Studio, open **Delete this story?**. Check the displayed reading count and cascade warning before confirming.
5. Verify its versions, readings and exclusive files are gone; built-in stories and unrelated shared references remain available.
6. If cleanup is interrupted, reopen the management page and explicitly continue cleanup. Do not interpret a pending state as completed deletion.

## Remaining limitations

- This is a local single-user tool, not an authenticated public service.
- No new live narrative, illustration, latency or cost measurements were made. Visual consistency for arbitrary Creator stories needs a separately authorized live check.
- Provider previews are optional. A successful final-only response is expected and supported.
- Unknown provider charges cannot be reconstructed from missing usage. Explicit retries may incur additional charges within the application limits.
- Historical POC 08 placeholder versions remain preserved rather than being silently regenerated.
- Artwork reuse is deliberately conservative: the prompt includes the whole opening sequence and initial state. Editing a visual beat can invalidate the full opening; display-title, genre and choice-only edits can reuse all unchanged images.
- Deletion retains minimal tombstone/cleanup receipts and does not erase separately created backups. Unknown historical temporary files are not swept without proven ownership.

## Hackathon recommendation

Use the backed-up local installation for a private demo. The implemented flow is covered with mocked end-to-end tests; obtain separate authorization for one bounded live Creator story before presenting its generated visual quality as validated. Keep the approved POC 08 branch available as a fallback. No new branch push, main-branch merge or public deployment is performed.
