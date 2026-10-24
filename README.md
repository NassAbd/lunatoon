# Lunatoon — local webtoon POCs

A local, desktop-first experiment in interactive webtoons. Select an action, add an optional twist, and generate one two-panel continuation of **Neon Protocol**. The script appears before two independent illustration requests finish.

The light reading experience opens at `/`. Click **Begin the story** to create a local persistent, two-decision story at `/run/<uuid>`. The original POC 01/02 reader remains at `/experiment`. `SPECS.md` remains the long-term reference; there are no accounts, public sharing, story library, creator studio or deployment setup.

## Run locally

Use Node **24.14.0** (declared in `.node-version`) and npm. Dependencies are project-local.

```sh
npm ci
test -f .env.local || cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local` to an OpenAI API project key, then start:

```sh
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Restart the server after changing environment variables. The UI loads without credentials; generation returns a clear configuration error until a key is provided. A ChatGPT subscription alone does not supply API credentials or billing.

Optional server settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_STORY_MODEL` | `gpt-4.1-mini` | Responses model supporting strict Structured Outputs |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare` | GPT Image model supporting the Images API |
| `OPENAI_IMAGE_QUALITY` | `low` | `low`, `medium`, or `high`; start with low for latency |

Model availability and image access depend on your API project. Image access may require organization verification. Model overrides must support the same request parameters; DALL-E models are not compatible with this pipeline. Models are never automatically substituted. Current project checks and live evidence are recorded in [POC 02 decision](references/POC_02_DECISION.md).

## Pipeline and contracts

1. `POST /api/story` receives `{ context, choice, instruction }`. Context must match the fixed initial scene, choice must be one of the three actions, and the optional instruction is capped at 500 characters.
2. The official SDK calls `client.responses.parse` with `zodTextFormat`, which sends `text.format.type = json_schema`, `strict: true`, and a Zod-derived schema. Exactly two panels and one or two bubbles per panel are required. The server validates sequence order and unique panel/bubble IDs after parsing. Refusal and incomplete responses are errors.
3. The client commits dialogue and placeholders, yields a browser frame (with a background-tab fallback), then sends **two concurrent** `POST /api/image` requests. Each request receives `{ panel, approach }`, validated with Zod; omitted approach defaults to `text` for existing callers. Approach A calls `client.images.generate`, while explicit approach B calls `client.images.edit` with the same authored PNG reference for each panel. Every image prompt includes the same Kael character sheet, art direction, shot direction and quiet dialogue zones.
4. Each image is decoded and displayed independently. One failure leaves the other panel and all dialogue intact. Generating again replaces this run with a new continuation of the original scene; it does not create another branch.

`SpeechBubble` and `ComicPanel` retain the applicable `SPECS.md` field names, positions, aspect ratios, and lifecycle states. The POC adds `visual_description`, metrics, and an error field. Optional onomatopoeia is omitted. A failed illustration retains its last noncomplete lifecycle state and carries `error`.

Source contracts: `src/lib/contracts.ts`. Server-only SDK calls: `src/lib/server/ai.ts`. Client sequencing: `src/lib/pipeline.ts`.

## Measure a live experiment

The original experiment UI is at `/experiment`. Paid calls require explicit authorization; the free tests below use mocks.

1. Choose **Activate the device** and click **Generate Continuation**.
2. Verify two sets of dialogue appear on placeholders before the illustrations. Each illustration should appear when its request finishes.
3. Inspect **Developer diagnostics** for narrative and individual image server latencies, reader text-ready time, total time, models, token counts, request IDs, and errors. The text and total target checks use time from submit, not just provider latency.
4. Repeat with **Destroy the device**, then **Investigate its origin** and the twist “A mysterious cyborg cat suddenly appears.” Assess whether the action/twist changes the story and Kael stays recognizable.
5. Record successful timings and quality observations in `POC_RESULTS.md`. Failed runs show their settlement time; total completion remains blank unless both images finish decoding.

The <3s text and <30s full-run targets are experiments, not timeouts or guarantees. Server timing includes SDK request and parsing; text-ready timing includes the browser round trip and DOM commit; total includes the script, both image requests, transfer, and decoding (before the cosmetic fade completes). No automatic retries are enabled, so measured latency does not hide retries or duplicate paid calls. Upstream SDK timeout is 180 seconds. API request IDs are available for provider troubleshooting. Images API model names reflect the requested model because the response does not provide a resolved snapshot.

The SDK uses `store: false` on Responses calls. Keys remain server-side. This is a local tool: unauthenticated endpoints incur API charges and should not be exposed publicly.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Browser tests use intercepted local API requests and a tiny test image. They verify progressive rendering, concurrent requests, out-of-order completion, partial failure, missing credentials, and responsive overflow. They do **not** measure OpenAI performance or prove narrative/image quality.

With a Playwright Chromium installation:

```sh
npx playwright install chromium
npm run test:e2e
```

Or use an existing local Google Chrome without downloading a browser:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

If port 3000 is occupied, Next.js prints another local port. To test that existing server, set the printed URL, for example:

```sh
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

For production-mode local testing:

```sh
npm run build
npm start
```

## Original POC 01/02 persistence and experiment limits

In the original reader at `/experiment`, generated JPEGs are returned as data URLs and kept only in the current browser page's memory. Reloading loses the run. There are no shareable image URLs, external image storage, saved sessions, or database. The initial panel is a fixed repository SVG, labeled as such; it is not a generated result or benchmark. Independent image calls use a shared text character sheet and, in explicitly selected approach B, an authored reference image. Visual consistency remains a quality question to evaluate from actual outputs. Diagnostics show token usage when returned. The UI does not maintain pricing for arbitrary configurable models; any one-off cost estimate belongs in the dated experiment report and requires verified rates and modality usage.

## POC 02: visual continuity comparison

This narrow iteration lives on `feat/visual-consistency`. Read the [reference notes](references/README.md), [art guide](references/visual/art-direction.md), [Kael bible](references/visual/kael-character-bible.md), and [decision record](references/POC_02_DECISION.md).

The opening stays an original flat SVG. Its palette, the canonical image prompts and the new authored Kael sheet now share a flat-ink noir direction. Narrative prompts request two causal beats with different framing and avoid repeating the fixed art/character bible in generated output. The strict two-panel script contract is unchanged.

To compare without changing the story:

1. Select **Investigate its origin**, enter **A mysterious cyborg cat suddenly appears.**, and select **A · Shared text constraints**.
2. Generate once (one narrative plus two concurrent image calls).
3. Select **B · Authored visual reference**, then click **Render same script with B / reference · 2 image calls** in diagnostics. This makes two concurrent edits, no new narrative call. Original choice and twist are retained even if form fields changed.
4. Open **Compare with previous A / text** to inspect the earlier panels. Download diagnostics JSON for both approaches; it excludes image bytes and credentials. Results remain in this tab until refresh.

Compare **Image phase** for A vs B. Replay totals are explicitly illustration-only and are not valid full-pipeline latency comparisons. Request/server/validation/decode timings expose where a new run spent time without retroactively guessing the cause of the user-observed 5.58s text-ready run.

The reader preselects B for the documented GPT Image 2.5 models, based on the single live visual comparison. This is a demo preference, not a universal quality or speed claim. B still uses two image calls but adds billable reference-input tokens; the UI notes this tradeoff. Unknown models start on A, and the image endpoint's omitted-approach default remains A for compatibility.

The free test commands above never invoke the paid harness. One explicit live comparison is available, capped at one narrative and four illustrations, with no retries:

```sh
LUNATOON_RUN_PAID_COMPARISON=1 PLAYWRIGHT_CHANNEL=chrome \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run experiment:live
```

Use the actual printed server URL. The harness checks real endpoints, saves A/B screenshots, images and diagnostics under ignored `test-results-live/poc-02-live/`, and stops before B if A fails. Omitting the opt-in variable skips the paid test. Reference mode never falls back to another paid generation after a failed edit. Free browser runs use a separate artifact directory and do not erase the live comparison evidence.

Rebuild the original static reference after deliberately editing its source with `npm run reference:build`. Inspect it before using it; no paid call is required for this local rasterization.

## POC 03: persistent story engine

`feat/persistent-story-engine` starts from synchronized POC 02 commit `0ac736f`. Click **Begin the story** on the home page. Optional A/text or B/reference settings are under collapsed **Developer details**. Creation makes no AI calls. The selected mode and server model/limit settings are captured for that run.

1. Bookmark `/run/<uuid>`, choose **Investigate its origin**, optionally add the cyborg-cat twist, and generate. The validated script/state is saved before two concurrent independent image requests start.
2. Reload the same URL or restart the app. Saved dialogue, local images and immutable original references are reused with **zero generation calls**. Unstarted reserved work requires an explicit resume action; loading a page never submits paid work.
3. Choose the next option based on the new event, source clue and facts. The second continuation uses saved facts and appearance, and ends the story.
4. A failed image has its own explicit paid retry; successful siblings and script stay saved. A/B same-script replay remains explicit and consumes two image calls.
5. Inspect **Run cost & latency diagnostics** for measured usage, estimated spend, unknown costs, separate reference-input tokens/cost, reservations and stage limits. Download diagnostics for all attempts. Current-visit browser request-flow timings are labeled separately from saved server timings and the original POC 02 decode-complete measurements.

SQLite and assets live under ignored `data/`. **Back up the entire directory with the app stopped.** Use Node 24.14.0: the built-in SQLite API is experimental in that version. No additional service or npm library is required. Asset paths in the DB are relative; saved references are content-addressed and integrity checked.

| Server setting | Default | Meaning for new saved runs |
| --- | --- | --- |
| `LUNATOON_DATA_DIR` | `./data` | Local DB, references and generated JPEGs |
| `LUNATOON_MAX_STEPS` | `2` | One or two decisions; the last ends the story |
| `LUNATOON_MAX_IMAGE_CALLS` | `6` | Hard attempted + reserved image-call limit, including retries/replays |
| `LUNATOON_MAX_SCRIPT_CALLS` | `3` | Hard attempted + reserved narrative-call limit |
| `LUNATOON_RUN_BUDGET_USD` | `0.30` | Estimated monetary guard; **not an absolute provider billing cap** |

Reservations use a dated verified price table for known models. Unknown/expired pricing remains explicitly unpriced; hard call counts still apply. Failed or interrupted attempts can cost money without returned usage. No automatic SDK retry, model substitution, quality escalation or reference-to-text fallback is enabled. The old POC 02 experiment APIs remain outside saved-run accounting.

The orchestration is request-driven: every handler awaits its own stage and persists before responding. Interrupted requests wait for a four-minute lease before recovery; no background worker or automatic generation is assumed after a response. A lost saved file is marked failed, not regenerated by refresh. See [architecture/recovery](docs/story-engine-architecture.md), [cost model and verified rates](docs/api-cost-model.md), and [POC 03 results](POC_03_RESULTS.md) for limitations and executed evidence.

Run the new **free** production-server browser integration suite:

```sh
npm run test:engine:build
PLAYWRIGHT_CHANNEL=chrome npm run test:engine:e2e
```

This suite runs a local fake OpenAI HTTP endpoint, the official SDK and an isolated production Next server on port 3110. It uses temporary SQLite/files, actually restarts its own app process, and checks dialogue-first rendering, independent images, reload/restart without generation, two decisions, operation deduplication, isolated retry, cross-run access and call limits. `.next-engine/` and `test-results-engine/` are ignored; it does not delete `data/` or the POC 02 live evidence. Keep port 3110 free. `LUNATOON_TEST_BUILD=1` selects the isolated build directory; normal dev/build/start commands retain `.next`.

No POC 03 paid generation was executed in the recorded checks. Synthetic token usage/delays are test fixtures, not live cost or latency benchmarks. All original POC 02 tests and its separately opted-in paid harness remain intact.

## Verified API references

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 Mini: Responses and Structured Outputs support](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Image generation API: parameters and limits](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)

## POC 03.1: narrative reliability and reading UX

The persistent reader uses a warm off-white surface, a central comic column and choices after the relevant panels. Click **Continue the story** after selecting an option; the optional instruction invites a creative twist. Dialogue still appears before two independently completing images. Retry/loading states use plain English. Cost accounting, run memory, models, A/B replay and diagnostic downloads remain available under **Developer details**, closed by default. The original dark experiment and its opted-in live harness now use `/experiment`.

The hammer/destruction failure was caused by a mandatory origin-reveal rule and exact source-name substring matching, unrelated to continuity. Source clues are now required-but-nullable in strict Structured Outputs; they are creative guidance. Identity, object ownership, destroyed-prop continuity, fact IDs, chapter order and ending constraints remain hard checks. Choosing destruction must record the device as destroyed. No database reset or automatic paid retry occurs; previously failed runs retain their usage history and need an explicit retry within their existing limits.

See [POC 03.1 results](POC_03_1_RESULTS.md) for regression evidence, limitations and desktop screenshots. No paid tests were run for this corrective iteration.

## POC 04 diagnostic checkpoint (historical)

`feat/platform-experience` currently adds safe narrative failure diagnostics, not a new platform UI. Failed attempts now retain their local phase, static field/rule codes, error type and available request ID under **Developer details → Request accounting details** and in diagnostic downloads. Raw rejected narrative/error content and credentials are not added to these details. Historical errors without metadata remain readable.

Read [POC 04 findings](POC_04_RESULTS.md) before claiming story completion is fixed: the previous live second-decision exception was discarded, so its precise cause remains unconfirmed. Controlled mocked failures and successful four-panel/restart flows pass; no new paid calls were made. Narrative/state invariants and existing run limits are unchanged. At that checkpoint, opening, library, preview-story and branding work were deferred. The later live investigation is recorded below.

## POC 04.1: complete live story verified

A fresh real OpenAI run completed both decisions and all four reference illustrations without retries, then survived refresh and an actual server restart with identical saved state/images and zero new generation calls. Stage-specific request schemas now match ending and continuity requirements; next choices can connect a new consequence to an established motive. Existing ownership, identity and destruction invariants remain strict.

See [POC 04.1 results](POC_04_1_RESULTS.md) for reproduced failures, regression coverage, the complete live sequence, measured latency, usage-based cost estimates and remaining visual/semantic limitations. This is one observed working journey, not a general reliability guarantee. The earlier historical `stage_failed` exception remains unknown. Library and platform expansion remain deferred.
