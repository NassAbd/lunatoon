# POC 06 — platform polish

> Historical development checkpoint. See the [current project README](../../../README.md) for setup and supported behavior; [archive notes](README.md) explain the evidence retained here.

Date: 2026-10-24. Branch: `feat/platform-polish`, based on POC 05.1 commit `8b3d7b08bc0659ea1dc0f56e0da59fef5b0338a1`.

## Baseline and boundaries

POC 05.1 was clean and scanned before modification: eight commits / 194 unique historical blobs, no secret findings; `.env.example` retained safe placeholders. The branch was pushed without force to `origin/fix/narrative-robustness`, and the remote SHA matched the local commit. POC 06 is a local commit only, with no merge into main.

No paid OpenAI calls are authorized or performed in this iteration. The single POC 05.1 live story remains historical evidence: two narrative calls, four reference edits, no partial previews, estimated $0.089825. Mock timings in this iteration are not provider benchmarks.

## Streaming and performance audit

See [the technical audit](../../../references/technical/POC_06_STREAMING.md) for verified official sources, endpoint/SDK checks, retrieval failures and the phase breakdown.

Flare reference edits with the existing settings support optional partial events; requesting one does not guarantee one arrives. The POC 05.1 upstream ledger recorded four completed events and no partial events before the SDK/app. This rules out application buffering as the reason for that sample's missing previews. It does not establish why the provider sent only finals. No documented change guarantees an earlier preview, so model, quality, format, portrait dimensions and reference inputs remain unchanged.

Historical narrative time was 5.491s / 4.380s, with 2.051ms / 0.445ms of validation; browser dialogue was ready at 5.526s / 4.409s. Image requests were concurrent within 0.2ms / 0.3ms. Four server image durations were 10.346–11.663s. The existing local stages do not justify removing validation, changing the prompt or rewriting orchestration. No new provider speedup is claimed.

## Implementation and verification

### Generation gate

The fixed-size waiting canvas now uses original static station-line geometry with honest writing/illustrating copy. It is decorative, not a fabricated partial image. Real previews still carry their preview label. Final artwork is decoded before an independent 220 ms reveal (previously 650 ms); reduced motion remains supported and visibility measurements still finish. This is a shorter presentation transition, not a measured provider speedup.

The generation gate passed five mocked browser tests: no-preview fallback, dialogue-first display, independent out-of-order completion, stable scroll/dimensions through both decisions, isolated image retry, truncated preview rejection, narrative recovery and restart restoration. Typecheck/lint passed; the unchanged engine's 96 unit/SDK tests and the production build passed before this gate.

An existing browser assertion initially failed because Chrome reported `ERR_ABORTED` after successfully consumed `no-store` streams. A standalone synthetic probe reproduced it, and an upstream Chromium report corroborates it; see the technical audit. The test now verifies each actual original reader reaches EOF with one settled record, no read/application error, completed saved assets and no outstanding request. Native transport reports are retained; only that specific false abort paired with successful EOF is tolerated. Genuine interruption coverage remains strict. No application cache/stream behavior was changed to hide the browser issue.

### Opening and reading gate

The canonical opening now has four short, distinct beats: a rainy New Kyoto establishing shot, the existing Kael illustration, a close-up of the held device, and inward-turning surveillance cameras. Three new original SVGs supply the additional compositions; no paid generation or copied artwork was used. The original opening, character bible and generation references are untouched. Short HTML captions replace the prose block; noncanonical historical opening text keeps its existing fallback.

The 680 px reading strip, three choices, optional twist, saved choice history and generated speech-balloon placement remain intact. The four-test reading gate passed: instant opening with zero generation, both desktop widths without overflow, stable scroll and element geometry through both decisions, isolated failures and restart restoration. Manual desktop review found distinct compositions, readable captions and a clear transition into the first decision. This is a review of authored art and interface behavior, not a new rating of generated character consistency.

### Library and saved navigation

`/` is a cover-led light library with **Neon Protocol** playable and **The Last Lightkeeper**, an original coastal-fantasy concept, explicitly **Coming soon / Preview**. The preview has no reading/generation action or second engine. A restrained moon/spark SVG favicon accompanies the existing original wordmark. `/story/neon-protocol`, `/saved` and `/about` provide story information, saved reading and platform context; `/experiment` remains available.

The homepage shows up to six recent sessions; `/saved` shows twelve per page. The new helper opens existing SQLite read-only, checks the schema version, projects only safe summary fields and closes its connection. It does not initialize storage, migrate, recover stages, probe private images or invoke a provider. Stable run links disable prefetch so merely browsing/hovering cannot invoke reader recovery. Starting a run uses the existing idempotent create-only endpoint and makes no generation call.

Statuses reflect stored state. “Completed” requires the ending plus all expected saved illustrations; “Illustrations unfinished” avoids claiming that an old running stage is still actively generating. Opening the reader retains its existing lease/missing-file recovery behavior. Missing storage gives an honest empty state; read failures give a generic unavailable message without internal paths or diagnostics. All listings are explicitly local to one installation.

## Final validation

| Check | Result / scope |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed |
| Unit/SDK | `npm test`: **103 passed**, 16 files; all 96 prior tests retained plus seven read-only-library tests |
| Production build | `npm run test:engine:build` passed; normal production webpack build isolated in `.next-engine` |
| Browser regression suite | **22 passed** in one run: eight original `/experiment` tests plus fourteen persistent-engine/library tests |
| Final screenshot checks | Two library tests rerun successfully after waiting for paint before captures |
| Existing-data integrity | **181 records and 45 local assets checked; zero hash mismatches** |
| Paid OpenAI work | **Zero narrative calls, zero image calls, zero new paid cost** in POC 06 |

The final pre-commit secret audit found no matches in 31 staged files or eight prior commits / 194 unique historical blobs, including comparison against the locally configured secret without disclosure. `.env.local`, databases/WAL, private images, diagnostics and screenshots remain ignored; `.env.example` remains unchanged with placeholders. POC 06 is committed locally only and is not pushed or merged.

The complete browser run used the existing isolated mock HTTP provider, official SDK, temporary SQLite/files and production Next server. An ignored combined config, `test-results-engine/poc06-all.config.ts`, selected both existing test directories; it did not add a new application path. Standard suites remain runnable with `npm run test:engine:e2e` and `npm run test:e2e` (the latter against an isolated/mock-configured local server for no paid work).

New browser coverage verifies library/story navigation, both start actions, preview honesty, saved completed/incomplete sessions, stable resume URLs, no saved-reader prefetch, no regeneration on reopening, four authored opening beats, no-preview fallback, independent arrival, geometry, reduced motion and explicit failure recovery. Existing tests continue to cover two decisions, four saved images, narrative memory, duplicate operations, strict validation, hard call limits, usage, partial failures and real process restart. The old reader-introduction test now opens `/story/neon-protocol` because `/` intentionally became the library.

## Screenshots and local evidence

Captures were reviewed at **1440 px and 1024 px**. They use original authored art and isolated mocked saved sessions, not new live OpenAI output. Private/local evidence stays ignored, not committed:

- Library: `test-results-live/poc-06/screenshots/library-1440.png`, `library-1024.png`.
- Library saved section: `test-results-live/poc-06/screenshots/library-saved-1440.png`, `library-saved-1024.png`.
- Full opening and decision: `test-results-live/poc-06/screenshots/opening-1440.png`, `opening-1024.png`.
- Saved-session page: `test-results-live/poc-06/screenshots/saved-1440.png`.
- Unchanged private-data verification: `test-results-live/poc-06/final-integrity.json`.
- Mock stream/scroll/decode evidence remains under ignored `test-results-engine/poc05/`, preserving the existing test naming.

Initial Chrome captures showed a stale repeated header in pixels despite a single static header in the DOM; waiting for navigation/paint produced clean final captures. No application layout workaround was applied to conceal that capture artifact.

## Limitations and hackathon recommendation

- Genuine early partial previews remain **unverified live**. Official support does not guarantee delivery. Keep the honest final-only fallback.
- No new live latency comparison was authorized. The previous single-story text-ready times remain 5.526s / 4.409s; the three-second target is unmet. The 220 ms reveal is a presentation setting, not a measured API speedup.
- Narrative and character drift remain existing generation risks. POC 06 deliberately changes no state invariant, prompt, model, quality, reference mode, budget, call limit or retry policy.
- The existing app still lacks a whole-stream body deadline after response headers. Leases protect durable state; an indefinitely silent open stream remains a reliability limitation. No automatic paid retry was added.
- Library status uses saved records rather than a live worker or disk-integrity scan. It is not a multi-user service and must stay local without authentication.
- The three new opening vignettes are public presentation assets. The original saved opening and generation references remain hash-pinned; future edits to the new public art would affect historical presentation unless deliberately versioned.
- Node 24's built-in SQLite warning remains expected. No new infrastructure or dependency was added.

**Recommendation: demonstrate this iteration.** Use the library → illustrated opening → two decisions → saved ending flow, with an existing successfully completed live POC 05.1 story available as a fallback. Reserve any further paid validation for separate authorization; do not promise preview timing or representative reliability from one historical live story. The next useful reliability improvement is a bounded stream deadline with explicit uncertainty/recovery tests, before any broader platform expansion.
