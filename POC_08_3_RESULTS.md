# POC 08.3 — Visual identity and historical-reading review

Date: 2026-10-25. Branch: `fix/visual-consistency-legacy-cleanup`. No paid OpenAI calls or real-data deletions were made.

## Baseline and protection

POC 08.2 `5614785dcc165ffbf2513aa28cfaf3e2c4c028a5` was verified on its clean approved branch. A credential scan covered 13 commits and 398 unique historical blobs without findings. The branch was pushed normally to `origin/fix/creator-reliability-legacy-deletion`, and the remote SHA matched before the corrective branch was created. No force push, history rewrite or main merge was used. The corrective branch is committed locally only.

Before persistence investigation, both SQLite databases were backed up with SQLite's backup API and their records checked against the original; private files were copied and hashed. The protected baseline contains **245 records and 46 private files/assets**, including completed Running Hell. Original data is read-only throughout this task. Destructive tests use separate copies or temporary stores. Credentials, databases/WAL files, artwork, uploads, inventories and browser artifacts remain ignored.

## Visual investigation

The saved Running Hell evidence confirms a complete two-decision story with four continuation illustrations. Its immutable template has one uploaded raster reference, reused across both panels and decisions. Visual inspection shows that this reference depicts a setting, not a person. It supplies no canonical face. The three saved opening JPEGs are available as local assets but were not included in the continuation reference inputs. No evidence suggests that different uploads were being selected for adjacent panels.

There is also a verified prompt omission: openings receive the full character bible, while continuation images previously received only the short `visual_anchor`. In this case that anchor identifies the jacket and hairstyle but omits age and ethnicity. The fuller saved bible records age 15, ethnicity, ponytail and red jacket; the requested dark skin tone is user-specified and visually established by the opening, rather than literally present in that saved bible. Comparing the existing opening and first continuation pair confirms visible skin/face drift. No original image or saved description was rewritten.

These findings establish application-level contributors, not a deterministic explanation of the model's internal choice. References and stronger prompts cannot guarantee visual identity.

## Implemented correction

- Every persistent image prompt now receives the full saved character bible and the protagonist's named anchor. It distinguishes stable skin tone, face, age and characteristic hair from current injuries, clothing condition and object possession. Camera distance, expression and lighting must not redesign the character. Current saved state takes precedence over old accessories or object conditions.
- Each uploaded reference has an explicit **Use for** choice: Main character, Other character, Setting, Style or Unspecified. All begin Unspecified; selecting Main character replaces the previous designation. No upload or opening is automatically declared a portrait.
- Optional `visual_references` metadata is frozen into new templates, opening configurations and run bibles. Selection follows protagonist → other characters → environment → style → unassigned, preserving order within each role. Metadata must name unique selected owned references and at most one protagonist. The same selection and bytes are used by both concurrent continuation requests and later decisions.
- Historical versions without roles preserve their original input order and use the full written identity as the conservative fallback. No new input images are added. Opening art is not silently promoted to a reference, and no extra generation constructs a character sheet.
- Opening reuse fingerprints include effective role instructions, reference order and the visual prompt version. A changed role cannot reuse artwork generated under different visual instructions. Refresh/restart still reads completed assets without generation; only explicit saves or retry actions can initiate new work.
- Developer details show saved reference IDs/roles and per-attempt prompt versions. Image bytes, local file paths and raw uploads are not exposed there. Versions are `story-visual-08.3-identity` and `creator-opening-08.3-identity`.

The three-upload cap, model, low quality, JPEG dimensions/compression, reference-edit endpoint, optional streaming previews, parallel independent images, strict narrative invariants, reservations, call caps, idempotency and explicit retries are unchanged. Role selection changes neither reference count nor image-call count. Full-bible inclusion adds text input; no measured cost or latency improvement is claimed.

## Official API verification

The configured Flare model supports image inputs and editing. Numbered input roles and explicit preservation instructions are supported prompting techniques; there is no documented API canonical-character switch or numeric per-reference weighting. We retain the existing endpoint/settings and do not add an unverified `input_fidelity` parameter. The documentation warns that recurring-character consistency can still vary. See the dated source review and API limitations in [Visual reference research](docs/POC_08_3_VISUAL_REFERENCES.md), with direct official citations.

## Historical-reading inventory and deletion diagnosis

The initial read-only inventory contained **ten pre-template Neon Protocol readings** (five unfinished, five completed) and **one newer completed Running Hell reading**. All eleven passed read-only deletion eligibility checks, had no active generation or surviving tombstone, and had valid owned asset paths. The reader schema is 1 and Creator schema is 2. Existing cleanup receipts were complete: fourteen run deletions and one Creator deletion.

Using the unchanged POC 08.2 build against a separate copy, all ten historical Neon rows displayed the correct UUID-specific Delete reading action. Each confirmation was opened and cancelled before a successful deletion on the disposable copy. There were no document reloads, page errors or provider calls. All 24 exclusively owned Neon images were removed from that copy, while its completed Running Hell record/four images, 22 other non-database files and 28 unrelated business records remained unchanged.

The remaining reported interface failure is **not reproduced**. The existing Lunatoon process was on port 3001; port 3000 belonged to an unrelated application and was left alone. No existing browser surface was accessible, so the user's actual tab could not be inspected. Stale browser state or a URL mismatch is a possibility, not an established cause. No speculative deletion-engine change or weakened ownership guard was made.

During final checks, the live installation gained **three new empty Neon runs** with distinct operation IDs, bringing the observed total to fourteen. The integrity monitor detected this rather than overwriting it. Read-only comparison showed that every pre-existing record and file remained identical, with no new generation, panel, Creator or deletion records. The source creates these rows only through explicit `POST /api/runs`; the actor cannot be established from the database. Tests used a different temporary directory and loopback server. These concurrent additions are preserved and explicitly excluded from the cleanup proposal; the private inventory records them in an addendum.

## Approval-only cleanup plan

The private human-readable inventory is at `test-results-live/poc-08-3/LEGACY_READING_CLEANUP_REVIEW.md` (ignored, local only). It lists exact UUIDs, UTC dates, status, chapter/panel/accounting counts, exclusive image paths and shared assets. It contains no private narrative text. Nothing is preselected for deletion.

Five unfinished Neon readings are optional review candidates, not automatically disposable. Preserve all completed readings, Running Hell, Creator stories, shared references/openings, built-in templates and backups unless the user explicitly selects exact reading IDs. If later approved, obtain fresh per-ID previews and use the existing `kind: run` confirmation/tombstone/resumable-cleanup path. Do not use a Creator cascade, date cutoff or broad filesystem deletion. Unproven temporary-file ownership is outside scope.

## Verification

Typecheck, lint, production build and the full unit/SDK suite pass: **219 tests across 30 files**. The full combined Playwright suite passes **54 browser tests** (eight original reader tests and 46 persistent-engine/Creator tests). After a final wording clarification distinguishing Save draft from Save & Illustrate, the production build and all four new visual-reference browser cases passed again. All providers in automated tests are mocked; synthetic images/delays do not establish real visual quality or performance.

Final primary-key-level comparison verifies **all 245 pre-existing records and all 46 original file hashes unchanged**, with only the three concurrent empty-run additions and no added assets. A separate SQLite backup preserves those additions without replacing the baseline backup. Private evidence and assets remain outside the staged source and documentation.

UI screenshots are local ignored artifacts at `test-results-live/poc-08-3/screenshots/reference-purposes-1440.png` and `reference-purposes-1024.png`. They use synthetic color references and show explicit purpose selection without horizontal overflow. The copied-data historical control screenshot is `old-reading-controls-copy.png`; confirmation opening/cancellation is verified by browser assertions rather than inferred from that screenshot. No private uploaded or generated artwork is committed.

Added coverage exercises explicit canonical selection with one, two and three references; the same selected bytes across both decisions; two concurrent image requests; full identity text; mutable custody; missing designation fallback; foreign/duplicate/multiple-protagonist rejection; immutable previous versions; changed-role cache invalidation; and refresh/restart without generation. Existing historical deletion, shared ownership, retry and recovery coverage remains in place.

## Manual checks and separately authorized live plan

**Character consistency:** Keep the completed original untouched. In a new draft/version, use an owned character portrait or an opening image that you have personally reviewed and choose Main character for it. Label setting/style images accurately. Verify the written description explicitly includes the intended skin tone, age, facial features, hair and clothing. Save draft first (no calls). After separate paid-test authorization, illustrate that version, complete both decisions and compare all four continuation panels with the approved reference. Check face/skin/hair independently of lighting and confirm wrist-device possession follows the story. Reload and verify call counts do not increase.

For a small controlled A/B check, use one saved valid script and the same owned image set: two baseline panel requests and two improved panel requests, sequential pairs with concurrent panels inside each pair. No additional narrative or reference-creation calls, no automatic retries, four image calls maximum. Run only in an isolated test copy and only after explicit authorization. Record model/quality/reference order, actual latency, returned usage and estimated cost; rate identity manually. This plan is not executed or authorized by this task.

**Legacy interface:** On the known Lunatoon server, open Saved stories and identify a historical reading by the private inventory. Open Delete reading, verify title/scope, then **Cancel**. If it fails, retain the exact URL/port, run ID, visible error and whether the action is absent, disabled or unable to open a dialog. Do not confirm real deletion without explicit approval.

## Readiness and limitations

The changes address the verified missing identity information and ambiguous reference roles without changing the working narrative engine. A separately authorized live visual check remains required before claiming the drift is resolved. Written-only fallback is less informative than an approved character portrait, and a maximal valid free-text bible/state can still exceed provider prompt limits; the system does not silently truncate identity or state. The actual legacy user-tab failure remains unexplained, with copied-data compatibility verified. Keep POC 08.2 and the private backup as the fallback.
