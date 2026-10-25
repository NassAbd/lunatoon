# Creator openings and local content management

POC 08.1 extends the existing local SQLite engine. It does not introduce a worker, hosted store, authentication system or alternate image provider. The user’s original databases and assets were backed up before implementation; development and destructive tests use isolated directories.

## Explicit creation stages

The browser saves an edited foundation with **Save draft** without making image calls. **Save & Illustrate** first saves a version and its opening-scene plan, then submits independent image requests for that version. A page load, status read or restart never submits generation. A failed or interrupted scene requires an explicit retry; successful siblings stay saved.

Each scene has a stable ID, original caption and scene description, composition direction, immutable creative context and a durable attempt ledger. Its prompt uses the saved character and visual bibles, environment and zero to three owned reference images. Scene count follows the actual foundation; the system does not pad a short opening with invented scenes.

Opening generation reuses the reader’s `generateIllustration` implementation, SDK configuration, usage parsing and preview transport. A partial preview is transient provider output. Only a validated final image becomes a canonical local asset. Zero references use the existing explicit text-image workflow; one to three references use editing. There is no automatic paid fallback or alternate model.

New illustrated versions stay nonplayable until all opening finals are persisted. The first completed scene in narrative order supplies the cover. Publication freezes the ready template before any reader can snapshot it. Historical POC 08 placeholder versions remain unchanged, including existing runs. Editing a story creates a new version; previous reading snapshots and artwork remain intact.

Reuse requires an exact visual-context fingerprint, including the scene, identity, art direction, ordered reference contents and image settings. A reused image is verified from disk and costs no new request. The current prompt includes the whole opening sequence and initial state, so editing a scene conservatively invalidates all opening images; title, genre and choice-only edits can reuse them. Missing or corrupt reusable artwork leaves a new explicitly requested version pending rather than modifying the original version. Opening JPEGs live at content-addressed `references/<sha256>.jpg` paths and can be used by multiple versions and runs without making duplicate files.

## Cost and recovery

Opening-image accounting is separate from the small foundation-generation budget. Version settings capture image-call and estimated-spend limits. Claims reserve cost before provider work and reconcile returned usage afterward; concurrent requests cannot independently consume the same remaining allowance. Failed and interrupted attempts remain in the ledger, including unknown costs. Application limits are not provider billing caps.

Requests are awaited through final persistence, as in the reader. Leases fence abandoned stages; refresh can report an interruption but cannot retry it. A late response cannot replace a newer successful scene. Request IDs, measured usage, estimated costs, reference-input costs and timings remain in collapsed Developer details.

## Deletion boundaries

Deleting a **reading** removes only its run, chapters, choices, state, generation events and exclusive image files. It preserves templates, opening artwork, shared references and sibling readings.

Deleting a **created story** removes its draft, saved versions, creation attempts, owned assets and associated reading sessions. The confirmation uses a fresh dependency count. Built-in catalog templates are not valid targets. A revision token prevents a stale confirmation from deleting newly added versions or readings without reconfirmation.

Active generation blocks deletion. Tombstones fence expired work and all later reads, claims and commits. Deleted creation-operation IDs are retained so replaying an old creation request cannot resurrect content.

## Database and filesystem ordering

Creator schema version 2 adds opening versions, attempts and draft-save receipts to the existing version 1 database. Existing records are preserved. The reader schema retains version 1 with additive deletion-journal tables. Both stores share a short SQLite write gate in `stories.sqlite`. Creator writes acquire it before their own database transaction; provider awaits never hold it. The lock serializes ownership changes with deletion. It does **not** make two WAL databases and the filesystem one atomic transaction.

Deletion therefore records a durable plan and tombstones before removing business records or files. Each later phase is idempotent and resumable. A private, fsynced `content-write-intents.jsonl` records exact owned final and temporary paths before file writes, surviving a subsequent database rollback. It contains identifiers and hashes, not image bytes or story text. Cleanup checks surviving ownership again while holding the write gate, retaining shared files. It unlinks only validated paths under the private data directory, rejects symlinks and traversal, and never recursively removes an arbitrary directory. Missing files are already-cleaned successes. Unknown historical temporary files are not guessed or swept.

Status reads do not perform destructive cleanup. A pending or failed cleanup remains visible with an explicit continuation action. “Deleted” is shown only after server-confirmed completion. The retained completion receipt contains minimal identifiers and counts, not story prose or prompts. Business-row deletion uses SQLite secure deletion and a best-effort nonblocking WAL checkpoint. Concurrent readers can defer checkpoint completion; separately created backups remain intact, and forensic erasure is not promised.

These are local integrity and request-origin defenses. They are not multi-user authorization. The unauthenticated app and private data directory must remain local.

## Official API references

Checked 2026-10-24. The current `gpt-image-2.5-flare`, configured quality, JPEG output and reference-edit workflow remain unchanged.

- [Image editing parameters](https://developers.openai.com/api/reference/resources/images/methods/edit): multiple reference inputs, supported image settings. The Markdown fetch failed; the official HTML page was available.
- [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare): configured model reference.
- [Image streaming](https://developers.openai.com/api/docs/guides/image-generation#streaming) and [edit events](https://developers.openai.com/api/reference/resources/images/edit-streaming-events): optional partial-image events followed by final output. A requested preview is not a delivery guarantee.
- [Cost and latency](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency): verified text input $5/M, image input $8/M and image output $30/M tokens; a partial adds 100 output tokens. Returned usage determines the estimate; reservations are planning allowances.

This iteration makes no paid OpenAI calls and establishes no live illustration quality or latency result. Automated images and timing delays are synthetic fixtures.
