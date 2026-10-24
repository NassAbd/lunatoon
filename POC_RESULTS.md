# Lunatoon — POC 01 results

## 1. Implemented functionality

- English desktop viewer with a fixed illustrated opening for **Neon Protocol**, the initial context, three choices, and an optional 500-character twist.
- Strict structured script with exactly two ordered comic panels, each with a visual description, image prompt, and one or two dialogue bubbles.
- Dialogue-first rendering followed by two concurrent, independent illustration requests. A completed panel does not wait for its sibling. Partial failures preserve all script text and successful images.
- Cinematic dark interface, readable dialogue overlays, image fades, basic responsive behavior, and reduced-motion support.
- Diagnostics for narrative and individual image request times, end-to-end text readiness and full completion, request errors, models, token usage, and provider request IDs. A failed run does not report a successful total completion.
- Server-only credentials, Zod request/output validation, and explicit configuration, refusal, quota, and model-access failures. No database, auth, story library, branching history, sharing, or deployment infrastructure.

## 2. Models and endpoints

Defaults, configurable in `.env.local`:

| Stage | Model | OpenAI endpoint | Local endpoint |
| --- | --- | --- | --- |
| Narrative | `gpt-4.1-mini` | `POST /v1/responses`, SDK `responses.parse`, strict `text.format` | `POST /api/story` |
| Illustration | `gpt-image-2.5-flare`, low quality, portrait JPEG | `POST /v1/images/generations`, SDK `images.generate` | `POST /api/image` (one request per panel) |

Official documentation was fetched and reviewed on **2026-10-24**: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [image generation](https://developers.openai.com/api/docs/guides/image-generation), and [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare). These document interface support; they do not establish access for a specific API project. No Decisions API or separate routing call is used.

## 3. Run the experiment

```sh
npm ci
cp .env.example .env.local
# Add your OPENAI_API_KEY to .env.local.
npm run dev
```

Visit [http://127.0.0.1:3000](http://127.0.0.1:3000), choose an action, optionally add a twist, and click **Generate Continuation**. Observe dialogue first, each image independently, and the diagnostics. Test all three choices and the cyborg-cat twist. Restart after environment changes. See `README.md` for verification commands and measurement definitions.

## 4. Observed latencies and validation

**No live OpenAI generation was run: no API credential was available.** There are no measured narrative, image, or total OpenAI latencies, no real token consumption observations, and no verified cost. The <3s narrative and <30s total numbers remain untested targets.

Transport tests use the real official SDK with mocked HTTP responses; browser tests intercept local API calls. Their fixture timings and images are test data, not successful provider calls or performance evidence. The app has no simulated generation mode.

Local verification completed on **2026-10-24**, using Node 24.14.0, Next.js 16.4.3, and OpenAI SDK 6.49.0:

- `npm run typecheck` — passed.
- `npm run lint` — passed, no warnings.
- `npm test` — 15 tests passed (contracts, progressive sequencing, real-SDK mocked transport, request/error handling, and localhost origin regression).
- `npm run build` — passed; home page and both Route Handlers compiled.
- `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e` — 5 tests passed, including dialogue-first rendering, out-of-order images, partial failure, missing credentials, no horizontal overflow at 1440/1024/390px, and real Route Handler validation. Port 3000 was already occupied, so the local preview used 3001.
- Manual browser inspection — opening illustration and layout rendered correctly; a real unmocked submission returned `missing_api_key` with no fabricated panels or timings.

## 5. Known limitations

- Narrative coherence, instruction following, illustration quality, consistency, and real latency require a credentialed live run.
- A shared text character sheet encourages consistency; independent image requests cannot guarantee identical faces or costumes.
- Provider queues, rate limits, moderation, image access verification, and network transfer may exceed the targets. Low image quality is the initial speed tradeoff. No automatic retries hide these failures.
- Data URLs live in browser memory only. Refresh loses the continuation; no durable image links or sharing are provided. Large base64 payloads add transfer/memory overhead.
- The server API is intended for local testing. It has no accounts, distributed rate limiting, or public-hosting safeguards.
- Cost is not estimated because the app does not maintain complete, verified pricing for configurable models. Actual token usage is displayed when the provider returns it.

## 6. Recommendation: continue with a measured live experiment

Continue the feasibility experiment, conditional on real results; do not expand product scope yet. Run the three actions plus the custom twist, record multiple full pipeline timings and qualitative quality notes, then compare the observed results against the targets. If character consistency is weak, evaluate a reference-image approach next; if latency is too high, compare quality settings and supported models. There is insufficient live evidence to claim feasibility or justify a pivot today.
