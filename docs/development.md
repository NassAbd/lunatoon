# Local development and operations

This is the current setup and operating guide. The [project README](../README.md) introduces the product; the [POC archive](archive/poc/README.md) preserves historical investigations, measurements and decisions. Earlier reports describe their own checkpoints, not necessarily today's interface. [SPECS.md](../SPECS.md) is the broader product vision rather than an implementation checklist.

## Setup

Use **Node.js 24.14.0** from [`.node-version`](../.node-version). `package.json` requires Node 24; the application uses its built-in `node:sqlite` API, which is experimental in the pinned runtime. npm dependencies stay local to the project.

```sh
npm ci
test -f .env.local || cp .env.example .env.local
```

Set `OPENAI_API_KEY` in ignored `.env.local`, then run:

```sh
npm run dev
```

Open the loopback URL printed by Next.js, normally `http://127.0.0.1:3000`. If that port is occupied, use the alternate port printed by the server. The interface loads without credentials; generation reports a configuration error until a key is supplied. API access and billing are separate from a ChatGPT subscription. Restart after changing environment variables.

For a local production build:

```sh
npm run build
npm start
```

Both npm server commands bind to `127.0.0.1`. This is a local, unauthenticated, single-user application; do not expose its generation endpoints or private data directory as a public service.

## Server configuration

[`.env.example`](../.env.example) contains safe settings and an empty key placeholder. Keys stay server-side. Never commit `.env.local`, database files, uploaded references, generated private artwork or local diagnostics.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Empty | OpenAI API project key; required for live generation |
| `OPENAI_STORY_MODEL` | `gpt-4.1-mini` | Narrative and Creator foundation model |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | Images generation/editing model |
| `OPENAI_IMAGE_QUALITY` | `low` | `low`, `medium` or `high` |
| `LUNATOON_DATA_DIR` | `./data` | Local databases, images and references |
| `LUNATOON_MAX_STEPS` | `2` | Decisions in a new reading; the final decision ends it |
| `LUNATOON_MAX_IMAGE_CALLS` | `6` | Attempted/reserved reading image calls, including retries and replays |
| `LUNATOON_MAX_SCRIPT_CALLS` | `3` | Attempted/reserved reading narrative calls |
| `LUNATOON_RUN_BUDGET_USD` | `0.30` | Estimated budget for a new reading |
| `LUNATOON_OPENING_MAX_IMAGE_CALLS` | `8` | Opening image attempts per new illustrated Creator version |
| `LUNATOON_OPENING_BUDGET_USD` | `1.00` | Estimated opening budget per new illustrated Creator version |

Reader settings are captured when a run is created; opening settings are captured per version. Editing environment values does not rewrite existing saved limits, model choices or artwork. Creator foundations have separate persisted defaults of **three attempts and a $0.05 estimated budget per draft**; those are not environment variables in the current configuration.

Model names above are the repository defaults, not a promise of project access. Overrides must support the exact implemented request parameters and strict schemas. The reference-edit path accepts only models whose support is explicitly recorded in the implementation. The app never substitutes a model, raises quality, changes reference mode or performs a second paid request automatically after failure. An unavailable model remains an actionable error.

Reference edits can cost more than text-only generation because input images are billable. Three-reference stories may need an explicitly higher budget for **new** runs; `.env.example` gives `0.50` as an illustrative adjustment, not a guaranteed sufficient amount. See the [cost model](api-cost-model.md) for versioned prices, reference-input accounting, reservations and expiry behavior.

## Current routes and workflows

| Route | Behavior |
| --- | --- |
| `/` | Three playable bundled stories, six Coming soon previews and ready local Creator stories |
| `/story/<story-id>` | Story presentation; **Begin the story** explicitly creates a reading |
| `/run/<uuid>` | Persistent reader; bookmark this local URL |
| `/saved` | Resume, reread or delete local reading sessions |
| `/studio` | Create a foundation, edit, upload references and illustrate a story |
| `/studio?draft=<uuid>` | Reopen a saved Creator draft |
| `/about` | Product introduction and local-demo boundaries |
| `/experiment` | Preserved POC 01/02 single-continuation experiment |

Library cards open **About this story** without creating a run or making a generation request. **Begin the story** snapshots the selected template and references, then opens the saved reader; creation itself makes no AI call.

### Reading

1. Read the illustrated opening, select one of three actions and optionally add a natural-language twist.
2. **Continue the story** makes a narrative request. Its validated chapter and state changes are saved before the browser starts two separate concurrent image requests.
3. Dialogue appears first. Each illustration completes independently in its reserved panel space. Genuine partial previews are transient; only final images become durable assets.
4. The second decision becomes available after both first-chapter final images are saved, decoded and displayed. It uses the run's saved facts, appearance and previous dialogue. The ending waits for all required final illustrations.
5. Reopen the saved URL to reuse its dialogue and artwork without new generation. A completed story offers **Download story**, a self-contained offline HTML reading copy.

Submitted choices remain in the timeline. Offscreen, unfocused decisions compact into saved recaps without moving the visible chapter. The final recap retains actual choices and twists. Developer details are collapsed by default.

Saved scenery can provide clearly labeled atmosphere while images are pending. Only owned, suitable scenery from the story's references or verified authored opening metadata is eligible. Missing or ambiguous scenery keeps the decorative placeholder. This is not new generation or a prediction of the result. Real provider previews take priority; reduced motion keeps atmospheric artwork still.

### Creating

1. Describe a story and optionally supply title, genre, protagonist, visual style and atmosphere. **Create story foundation** makes one explicit paid narrative request.
2. Edit the validated foundation, including opening scenes and initial choices. Upload zero to three owned PNG, JPEG or WebP references. Inputs must be still images, at most 5 MiB, 4,096 pixels per edge and 16 million pixels. The server validates actual bytes, fully decodes, applies orientation, strips metadata and stores normalized PNGs. SVG uploads, animation, corrupt data and caller-supplied paths are rejected.
3. Choose each reference's **Use for** role: Main character, Other character, Setting, Style or Unspecified. Only one can be the main character; the first upload is never inferred to be an identity reference. These roles are saved explicitly and frozen into illustrated versions.
4. **Save draft** persists foundation edits and reference roles without image calls. **Save & Illustrate** prepares a version and explicitly generates its opening scenes. Successful scenes remain saved if another fails; a retry affects only the requested failed scene.
5. After every opening scene is saved, the version is ready to play. With no references, the UI explicitly uses the story's written visual guide in text-only mode. It never borrows another world's protagonist image.

Draft URLs survive restart. Unsaved manual edits are not durable; save them before leaving. Existing readings retain their immutable template, opening and reference bytes. Removing a draft reference does not remove it from older versions or readings. A new version may reuse completed opening artwork only when its visual inputs are proven identical. Foundation generation is text-only; references are sent to OpenAI during explicit image requests, not uploads or foundation creation.

### Local deletion and export

Deleting a reading removes that session and exclusive generated assets, preserving its source story and sibling readings. Deleting a created story removes its versions and associated readings; confirmation uses fresh cascade counts. Built-in templates cannot be deleted. Active work blocks deletion, and incomplete filesystem cleanup stays visible for explicit continuation. Shared owned assets remain when another record needs them. See [content management and recovery](creator-content-management.md).

HTML export makes no AI request. It includes saved visible text, choices, twists and final images, but excludes reference uploads, credentials, internal state and local file paths. Review personal story content before distributing an export. It is a portable reading copy, not a public interactive URL or editable run. Incomplete or unavailable artwork must be resolved before export.

## Storage, backups and recovery

The configured data directory is ignored by Git. Its main contents are:

```text
data/
  stories.sqlite               # reading state and generation events
  creator.sqlite               # drafts, versions, references and opening attempts
  references/                  # immutable references and saved opening artwork
  creator/assets/              # owned normalized uploads
  images/<run-id>/              # final continuation illustrations
```

SQLite WAL/SHM and temporary write files can also exist. **Stop the application and back up the entire configured directory**, not just one database. Preserve it when reinstalling or updating. No automatic database reset or repair is provided.

Every paid stage is awaited by its own request; the app does not depend on a Next.js handler continuing after its response. Atomic claims and operation IDs prevent duplicate submissions. Model-proposed state is validated before being applied, and immutable identity, object custody and irreversible changes remain enforced.

| Situation | Expected recovery |
| --- | --- |
| Completed dialogue and images | Reload existing records/files; no generation |
| Reserved work never started | Explicit resume action; opening a page does not start it |
| Lost response or interrupted server | Inspect saved status first; no automatic paid retry |
| Unresolved claimed request | Four-minute lease before interrupted recovery; unknown usage remains accounted for |
| Failed image | Explicit isolated retry; preserve script and completed sibling |
| Local image GET/decode failure | **Load saved illustration again** retries the local asset request, not AI generation |
| Missing final file | Recovery can mark the panel failed; restore a backup or explicitly retry |
| Missing or changed immutable reference | Restore from backup; do not silently replace it |
| Pending deletion cleanup | Resume the existing deletion receipt explicitly |

The SDK timeout is 180 seconds; automatic SDK retries are disabled. A provider can bill an interrupted call even when the app has no usable result. Unknown outcomes require care and, where prompted, explicit acknowledgement before another paid attempt. Claim fencing prevents a late old response from overwriting a newer accepted result. A preview never becomes a saved final image merely because a stream ended.

Detailed design and historical changes are in the [engine architecture](story-engine-architecture.md), [template architecture](story-template-architecture.md), [Creator recovery guide](creator-content-management.md) and [visual-reference notes](POC_08_3_VISUAL_REFERENCES.md).

## Costs and diagnostics

Developer details separate three concepts:

- **Measured usage:** tokens and metadata actually returned by the provider.
- **Estimated spend:** valid usage multiplied by the captured, versioned price table; not an invoice.
- **Unknown cost:** a call lacks trustworthy usage or a verified rate. Its attempted-call count and applicable reservation remain visible.

Reader runs, Creator foundations and opening versions have separate ledgers and limits. Reservations are atomic so concurrent panel requests cannot independently spend the same application allowance. Reference-input usage is included in image totals and broken out separately, never added twice. Proven asset reuse makes no generation call and does not duplicate its originating charge.

These budgets are **not absolute provider billing caps**. In-flight requests can exceed planning allowances, usage can be incomplete, and other API activity is outside this app's accounting. Unknown or expired pricing stays unpriced while hard call-count limits still apply. The [cost model](api-cost-model.md) records the price version, verification date and expiry; no pricing refresh or paid fallback occurs silently during generation.

Diagnostics expose request IDs when returned, requested/resolved models as available, narrative validation/server timings, text-ready time, per-panel request timings, preview receipt/display and final transfer/decode/reveal. These intervals have different endpoints. A reload is not a new generation benchmark; missing preview timing is absent rather than zero. Downloaded diagnostics should be reviewed before publishing alongside any local test artifacts.

Historical successful live Neon runs are recorded in [POC 04.1](archive/poc/POC_04_1_RESULTS.md) and [POC 05.1](archive/poc/POC_05_1_RESULTS.md). These are individual observations, not representative latency, quality or reliability guarantees. The POC 05.1 streams returned finals without partials. Later mocked checks do not establish new live visual quality or preview performance.

## Free validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest covers contracts, SDK requests, narrative validation, persistence, costs, ownership, Creator work and recovery. It does not use a real API key for generation.

For the original browser suite:

```sh
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration starts or reuses the local development server and intercepts generation requests. To use installed Google Chrome, set `PLAYWRIGHT_CHANNEL=chrome`. To target an already running server at a different port, set its actual `PLAYWRIGHT_BASE_URL`:

```sh
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

The larger persistent-engine integration suite uses a separate production build, local fake OpenAI endpoint, dummy credentials and an isolated temporary data directory:

```sh
npm run test:engine:build
npm run test:engine:e2e
```

Keep port **3110** free and run this suite serially as configured. It covers complete stories, multiple worlds, Creator workflows, generation order, refresh and actual process restart, idempotency, failures, budgets, local asset ownership, deletion, export and reader geometry. The harness cleans up only its own process and temporary data. Its $0.50 reader test budget is an explicit fixture setting, not the normal $0.30 default. Mock usage, solid-color fixture images and delays are not live cost, quality or latency measurements.

`LUNATOON_TEST_BUILD=1` selects ignored `.next-engine/`; normal commands use `.next/`. Browser artifacts go under ignored `test-results-engine/` or `test-results/`; separately opted-in live artifacts use ignored `test-results-live/`. Do not run two engine suites against the shared port/build at once.

## Preserved legacy experiment

`/experiment` retains the original POC 01/02 behavior for technical comparison. It creates one two-panel continuation of the fixed Neon opening. Images remain in page memory; refresh loses that experiment. It does not use saved-run budgets or SQLite persistence.

The narrative endpoint uses strict Structured Outputs and validates two ordered panels with one or two speech bubbles each. After dialogue paints, separate concurrent image requests use either **A · Shared text constraints** or **B · Authored visual reference**. B uses the same original Kael reference independently for each panel. A failed panel leaves its dialogue and successful sibling intact.

To compare manually after explicitly deciding to spend API credits:

1. Choose **Investigate its origin**, add **A mysterious cyborg cat suddenly appears.**, and select A.
2. Generate once: one narrative call and two image calls.
3. Select B and use **Render same script with B / reference · 2 image calls** in diagnostics. This reuses the script and original choice/twist, adding two image calls without another narrative request.
4. Compare image phases and inspect each result. Replay totals cover illustration only and are not full-pipeline comparisons. Download observations before refreshing.

The separately opted-in automated live harness has the same maximum of one narrative and four illustrations, no retries, and stops before B if A fails:

```sh
LUNATOON_RUN_PAID_COMPARISON=1 PLAYWRIGHT_CHANNEL=chrome \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run experiment:live
```

Use the actual local server URL. **This command makes paid OpenAI requests; it is not part of the free validation suite.** Without the opt-in variable, the live test skips. Saved outcomes remain under ignored `test-results-live/poc-02-live/`. See the [POC 02 decision record](archive/poc/POC_02_DECISION.md) for the original comparison and its limits.

`npm run reference:build` locally rasterizes the original authored Kael SVG after a deliberate source edit. It does not call OpenAI; inspect any changed reference before use. Existing saved stories retain their own immutable copies.

## Code and documentation map

| Location | Responsibility |
| --- | --- |
| `src/app/` | Pages, API route boundaries and styles |
| `src/components/` | Library, reader, Creator and local management UI |
| `src/lib/server/ai.ts` | Official SDK configuration and image requests |
| `src/lib/story-engine/` | Strict story contracts, providers, SQLite, costs, recovery and export |
| `src/lib/creator/` | Drafts, foundations, references and opening versions |
| `src/lib/content-management/` | Confirmed local deletion and resumable cleanup |
| `src/lib/story-templates/` | Bundled worlds and owned template resolution |
| `src/lib/contracts.ts`, `src/lib/pipeline.ts` | Preserved original experiment contracts and client pipeline |
| `public/`, `references/` | Original bundled artwork, story/visual guides and research notes |
| `tests/`, `scripts/` | Automated checks, mock provider and local reference tooling |
| `docs/archive/poc/` | Historical findings, tests and limited live evidence |

Read repository `AGENTS.md` and relevant installed Next.js guides before changing code. Keep secrets and local data out of Git, use isolated data for experiments, and preserve passing persistence, cost and recovery tests when modifying orchestration.
