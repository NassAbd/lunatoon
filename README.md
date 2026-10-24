# Lunatoon — POC 01

A local, desktop-first experiment in interactive webtoons. Select an action, add an optional twist, and generate one two-panel continuation of **Neon Protocol**. The script appears before two independent illustration requests finish.

This POC follows the supplied experiment prompt. `SPECS.md` remains the long-term reference. There is one base scene, one continuation per run, no routing step, and no accounts, persistence, sharing, library, or deployment setup.

## Run locally

Use Node **24.14.0** (declared in `.node-version`) and npm. Dependencies are project-local.

```sh
npm ci
cp .env.example .env.local
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

Model availability and image access depend on your API project. Image access may require organization verification. Model overrides must support the same request parameters; DALL-E models are not compatible with this pipeline. Models are never automatically substituted. Defaults were checked against official model documentation; account-level access has **not** been tested.

## Pipeline and contracts

1. `POST /api/story` receives `{ context, choice, instruction }`. Context must match the fixed initial scene, choice must be one of the three actions, and the optional instruction is capped at 500 characters.
2. The official SDK calls `client.responses.parse` with `zodTextFormat`, which sends `text.format.type = json_schema`, `strict: true`, and a Zod-derived schema. Exactly two panels and one or two bubbles per panel are required. The server validates sequence order and unique panel/bubble IDs after parsing. Refusal and incomplete responses are errors.
3. The client commits dialogue and placeholders, yields a browser frame, then sends **two concurrent** `POST /api/image` requests. Each request receives `{ panel }`, validated with Zod, and independently calls `client.images.generate` for one JPEG. Every image prompt includes the same Kael character sheet and art direction.
4. Each image is decoded and displayed independently. One failure leaves the other panel and all dialogue intact. Generating again replaces this run with a new continuation of the original scene; it does not create another branch.

`SpeechBubble` and `ComicPanel` retain the applicable `SPECS.md` field names, positions, aspect ratios, and lifecycle states. The POC adds `visual_description`, metrics, and an error field. Optional onomatopoeia is omitted. A failed illustration retains its last noncomplete lifecycle state and carries `error`.

Source contracts: `src/lib/contracts.ts`. Server-only SDK calls: `src/lib/server/ai.ts`. Client sequencing: `src/lib/pipeline.ts`.

## Measure a live experiment

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

## Persistence and experiment limits

Generated JPEGs are returned as data URLs and kept only in the current browser page's memory. Reloading loses the run. There are no shareable image URLs, external image storage, saved sessions, or database. The initial panel is a fixed repository SVG, labeled as such; it is not a generated result or benchmark. Independent image calls share a text character sheet but no image reference or seed, so visual consistency is an open quality question. Diagnostics show token usage when returned. Cost is not calculated: this POC does not maintain complete pricing for configurable models, and token usage is not represented as a dollar estimate.

## Verified API references

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-4.1 Mini: Responses and Structured Outputs support](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Image generation API: parameters and limits](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
