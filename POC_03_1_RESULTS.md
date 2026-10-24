# POC 03.1 — narrative reliability and reader refinement

Implemented on top of POC 03 commit `819449e`, on `feat/persistent-story-engine`. No push, main merge, data reset or paid OpenAI calls were performed.

## Failure diagnosis

Read the existing local SQLite database in **read-only mode**, selecting only the reported choice/instruction, status, error and usage. One matching node contains two failed narrative attempts for **Destroy the device** / **Destroy it with a hammer.** Both stored `invalid_story_state: A new fact must record the concrete source clue.` Token usage was retained; all four planned image records were cancelled before a call. The live database was not edited.

The rejected chapter bodies were not saved by POC 03. We therefore cannot claim to reconstruct their wording or assess their creative quality. The code, stored error and a reconstructed regression fixture establish the failing rule: every chapter needed a concrete source clue, and some new fact had to contain its source string verbatim. That conflated an origin-revelation preference with a continuity invariant. A coherent hammer destruction/blackout consequence could be rejected even though its state was consistent.

A regression fixture first failed with the **same error** under the previous validator, then passed after the correction. This fixture is reconstructed test data, not a recovered live response.

## Corrected contract

- `event.source_clue` is still a required key, but now allows `null`. Existing non-null saved chapters remain valid. No SQL schema/data migration is needed.
- Removed the exact substring match and mandatory named-origin rejection. The prompt encourages relevant evidence for investigation and consequences for destruction/activation, without forcing an origin revelation. It explicitly honors the selected action and requested method. Prompt version: `persistent-neon-03.1`.
- Strict JSON shape, two ordered panels, unique IDs, known fact references, two-decision chronology/ending, character identity, object identity/ownership and appearance continuity remain hard checks. Destroying the device must record it as destroyed. A destroyed object cannot use an intermediate “missing” condition to become restorable.
- Creative quality, elegant prose, source reveals and whether a physical method is convincingly depicted remain prompt/reader evaluation concerns. They do not use brittle lexical gates. State validation is not semantic proof against every contradiction under a newly invented fact ID.
- Existing failed runs keep their usage, operations and attempt limits. Loading them does not retry or refund calls. An explicit retry uses the remaining allowance; no script, image mode or paid fallback is silently scheduled.

[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) was fetched for this change: strict fields remain required, with null used for an optional value. The SDK-derived schema regression asserts strict mode, required `source_clue`, and its nullable branch. No model, endpoint, pricing table or retry policy changed.

## Reader changes

`/` is now the light introduction; **Begin the story** creates a saved run without a generation call. `/run/<uuid>` uses a central 680px reading column, warm off-white `#FAFAF7`, white surfaces, charcoal text, lunar lime `#D9F77C` and subtle `#E8E9E5` borders. The original cyberpunk illustration/reference assets and prompt art direction are unchanged.

The header has the brand and a simple navigation action. Choices follow their relevant panels, with an optional creative invitation and **Continue the story**. Loading text reflects actual writing/illustration work; no simulated progress or decorative loading animation was added. Dialogue still commits before two concurrent, independent images. Image/story failures use friendly copy, preserve earlier work and explain that explicit retries may incur charges. Retry buttons still target the failed stage only.

**Developer details** is collapsed on initial load/reload. It retains usage/cost/unknown amounts, hard limits, latency measurements, request/error metadata, saved memory, status reload, diagnostic download and same-script A/B replay. Initial image mode selection is also tucked into the home page's Developer details. The original dark POC 02 reader and all its behavior remain at `/experiment`; its browser tests and opted-in paid harness were updated to that route. The paid harness was **not run**.

## Verification

- **Pass:** `npm run typecheck`, `npm run lint`, `npm test` (**51 tests**), `npm run test:engine:build` (isolated production webpack build), `PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e` (**5 tests**), and `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e` (**8 original tests**). All 45 existing unit/SDK tests remain passing; six regression cases were added.
- New regression coverage: exact hammer failure trigger, absent origin clue, old non-null chapters, malformed/missing JSON field rejection, nullable strict SDK schema, irreversible destroyed state, chapter bounds, destruction outcome, usage retention and operation deduplication.
- Browser coverage: light theme, choices after panels, no sidebar, closed diagnostics, creative input, dialogue-first/independent images, hammer destruction through a second coherent ending, refresh/restart with no duplicate calls, friendly failure, explicit retry, preserved accounting/limits and narrow-screen overflow.
- Integration uses the official SDK with a local fake provider and temporary SQLite/files. Its delays and token counts are synthetic. No new live latency, illustration quality score or billing amount is claimed.

## Screenshots

These show the actual desktop UI with original owned opening artwork. Request outcomes are mocked; no paid artwork was generated for screenshots.

- [Reader and hammer choice](docs/screenshots/poc-03-1-reader.png)
- [Friendly narrative recovery](docs/screenshots/poc-03-1-recovery.png)

The integration suite also produces local screenshots of the home page and dialogue-before-image state under ignored `test-results-engine/`. Its completed-image fixture is a one-pixel JPEG and is not evidence of generated-art quality.

## Remaining limitations

A live rerun of the reported choice is still unperformed because paid testing was not authorized. The specific invalid origin gate is removed and covered by regression tests; model writing/visual adherence still needs a separately authorized live review. Existing POC 03 limits remain: experimental Node 24.14 SQLite API, request-driven lease recovery after interruptions, local backups needed for disk loss, and application cost guards rather than an absolute provider billing cap.
