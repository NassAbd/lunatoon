# POC 08.2 — Creator narrative reliability and legacy deletion

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-25. Branch: `fix/creator-reliability-legacy-deletion`. No paid OpenAI calls were made in this iteration.

## Baseline and safety

Approved POC 08.1 commit `70af9a20366f8a375e29c49b9f0f6c85d4a181ea` was verified on a clean `feat/illustrated-creator-management` branch. A credential scan covered 12 commits and 380 unique historical blobs with no findings. Environment secrets, both SQLite stores and WAL files, uploaded/generated images, private story data and local test artifacts remain ignored. The approved branch was pushed normally and the remote SHA matched exactly before this corrective branch was created. No history rewrite or main-branch merge was performed.

A fresh SQLite backup and asset copy preserve **240 existing records and 52 private files/assets**. Both backup databases passed integrity checks. Test servers, migrations and destructive checks use isolated copies or temporary directories. The original failed reading is never retried or modified by this work.

## Narrative diagnosis: established evidence and uncertainty

Read-only inspection confirms two failed narrative events matching the reported Running Hell failure: `invalid_story_state`, phase `state_validation`, kind `continuity`, model `gpt-4.1-mini`, prompt `persistent-story-08`. Their combined returned usage is **6,296 input tokens and 1,248 output tokens**, with a recorded **$0.004516 estimate**. No continuation images were generated. These are historical user-test observations, not new performance measurements.

The error is raised after applying a chapter's state updates when an object has a non-null `holder` but that character's `carried_objects` no longer includes its ID. The saved initial Kai/SpeedCore relationship is consistent. The rejected chapters were not retained, and the old diagnostics have no indexed rule detail. Consequently, the exact generated transition, object or prose cannot be reconstructed. The deterministic regression fixture reproduces this validation class; it is **not** presented as the original provider response.

The model contract had two redundant representations of physical custody: object `holder`, and character inventory changes. The prompt described pickup/drop but did not explain whether wearing or using an already held device changes custody. The correction defines this representation explicitly in narrative/foundation instructions and schema descriptions. Worn or used objects remain in the character's inventory while physical custody remains unchanged. A transfer or drop must update both sides. Object condition is separate from custody; destruction cannot silently restore an object or imply an invented transfer.

No automatic normalization is introduced. A missing inventory entry cannot safely establish whether the intended action was removal, transfer or continued possession. Genuine contradictions still fail, and no raw chapter is silently rewritten. New privacy-safe indexed rule identifiers identify the inconsistent field without persisting private object IDs, story prose or raw provider output. Returned usage and provider request IDs retain the existing accounting behavior. Foundations and templates continue to be checked before a version becomes playable; existing immutable versions are not rewritten.

The new rules are `held_object_missing_from_inventory`, `carried_object_holder_mismatch`, and `unknown_object_holder`. Narrative prompt metadata is now `persistent-story-08.2-ownership` (or `persistent-neon-08.2-ownership` for pre-template Neon readings); foundation metadata is `creator-foundation-08.2-ownership`. JSON field shapes, identity/chronology predicates, reservations, stage claims, image workflows and retry behavior are unchanged.

## Legacy deletion diagnosis

Every current saved-reading deletion preview succeeded in the read-only audit: **11 pre-template Neon readings and one Creator reading**. Both Creator previews also succeeded without active work. The stores use supported reader schema 1 and Creator schema 2; the legacy Creator still has its original authored artwork and reference. The original ledger already contains 12 completed reading-deletion receipts. No unsupported historical ID or metadata rejection was observed.

Destructive verification then used a separate copy of the real backup: all **11 legacy readings and their 28 exclusive images** were deleted successfully, followed by the legacy Creator's **one version and three exclusive authored assets**. Its uploaded reference is shared with the newer Creator and was correctly retained. Including three exclusively owned bible copies, 34 files were removed; all 17 surviving assets and the file-intent journal retained their hashes. After each operation, unrelated database records were identical. The newer Creator story and its failed reading survived. No production deletion guard needed weakening or broad data migration.

The verified UI gap was in **Made by you**: library cards offered reading actions but no deletion or management action. Deletion was available only through the Studio draft list. A server-verified template-to-draft projection now lets those existing cards reuse the confirmation and resumable-cleanup UI. Built-in stories receive no template-delete action. The Saved stories list already exposes deletion for every listed reading, including old records; its reported historical failure could not be reproduced in the copied data or isolated regression flow.

Tombstones, stale-confirmation protection, accurate cascade counts, explicit confirmation, active-work guards, shared-reference retention, exact-path cleanup, symlink/traversal protection, idempotent operations and late-response fencing remain in place. Ambiguous historical files are preserved rather than guessed from names.

## Verification

Typecheck, ESLint, **207 unit/SDK tests across 28 files**, and the production build pass. The build uses an isolated copy through `LUNATOON_DATA_DIR`; the browser harness uses a temporary store, a loopback mock provider and a dummy test key. Automated providers are mocked. No live reliability improvement, latency reduction or new API cost result is claimed.

Before rebuilding, the new Made by you regression failed against the existing POC 08.1 build at the missing **Delete story** button, confirming the UI defect independently. After rebuilding, **all 50 Playwright browser tests passed**, including the eight original reader tests and 42 persistent-engine/Creator tests. The four new browser cases cover the reconstructed Kai journey, old reading deletion, old Creator deletion and durable interrupted cleanup. Thirteen additional unit/SDK tests bring the baseline from 194 to 207. The ten ownership tests were also rerun after refining the synthetic ending's clothing description to match the dropped device.

Executed checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:engine:build` with the isolated data directory, and Playwright's Chromium project using local Chrome and the combined mocked-provider configuration. Existing persistence tests include actual test-server restarts, no regeneration, independent image completion, explicit retries and budget limits. Browser timings are synthetic test execution, not OpenAI performance measurements. Node's existing experimental SQLite warning remains; there were no failing checks.

After the full suite, read-only hashes of every original database table and all private assets still match the pre-work manifest: **240 records across two databases and 52 files/assets unchanged**, with database integrity checks passing. Backups, copied deletion evidence and browser traces remain ignored local artifacts. The staged source and documentation were checked for credentials before the local commit; no private stores or artwork were staged.

The regression scope includes Kai holding, wearing and using SpeedCore, valid transfer/drop, irreversible destruction, contradictory custody, arbitrary Creator object IDs, two decisions and an ending, retained usage on validation failure, built-in compatibility, schema-1 Creator deletion without an opening ledger, pre-template reading deletion without write intents, sibling/shared-reference preservation, confirmation/cancellation, no document reload and resumable cleanup.

## Remaining limitations

- The exact historical model output is unavailable. Clearer instructions reduce an identified ambiguity but do not guarantee every future model response passes validation.
- Valid ownership checks remain strict; an inconsistent response still requires explicit recovery and may have consumed tokens.
- The reported old-reading deletion failure was not reproduced. This iteration establishes compatibility on copies of the actual remaining historical data and improves the verified missing Creator-card action.
- Deletion manages this unauthenticated local installation. It preserves separately created backups and minimal cleanup/tombstone receipts; it does not promise forensic erasure or multi-user authorization.

## Manual validation

### A — Narrative reliability

1. Keep the original failed reading for comparison. Open a new Creator Studio draft, optionally using the Kai/SpeedCore premise and an owned reference.
2. Generate its foundation, inspect initial holder/inventory consistency, then explicitly choose **Save & Illustrate**. These actions can incur API charges; no live run was performed for this report.
3. Choose “Use the speed to stop NEXUS and save the city,” with the supplied HQ instruction where applicable. Check that dialogue appears before the two independent illustrations.
4. Choose a contextually offered second decision. Verify a coherent ending, unchanged identity, and matching object custody/appearance.
5. Reload and restart the local app. Check that saved dialogue/images persist and generation counts do not increase.
6. If validation fails, retain the safe indexed rule and request ID from Developer details. Do not repeatedly retry an uncertain paid request.

### B — Legacy deletion

Use disposable copied data first. Delete valuable original items only if you explicitly choose those items and have an appropriate backup.

1. In **Saved stories**, choose an older reading. Open **Delete this reading?**, cancel once, then confirm deletion of the intended disposable reading.
2. Verify the row disappears without reloading the document; another reading of the same story and its original template remain available.
3. In **Made by you**, choose an older Creator story's delete action. Inspect its title and exact associated-reading/version counts in **Delete this story?** before confirming.
4. Verify that its associated readings and exclusive assets are removed while other Creator and built-in stories remain available.
5. If cleanup reports pending or failed, use the existing status/retry cleanup action. Do not interpret a pending receipt as completed erasure.

## Recommendation

The automated acceptance gate passes. A separately authorized live Creator journey remains necessary to assess generation reliability empirically. Keep the pushed POC 08.1 branch and private backup as the fallback. This corrective branch is committed locally and is not pushed without authorization.
