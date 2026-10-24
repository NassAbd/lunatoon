# Story templates: POC #8 architecture assessment

Assessed 2026-10-24 against POC #7 `a0e9354`, before implementing the shared engine.

## Existing boundary and risks

The existing SQLite engine already persists a content-addressed story bible beside each run, with separate decision nodes, panels and billable attempts. That is the right immutable boundary. Its state transitions, stage claims, reservations and image persistence can be reused. An additive template snapshot requires no destructive SQL migration or second reading engine.

Neon assumptions occur in the bible title/schema, initial state and choices, opening-fact classification, the first destroy-device consequence, narrative prompts, protagonist lookup, image prompt/filename/reference selection, welcome/opening/finale copy, and the library launch. Replacing only the cover or title would leak Kael into other stories. The shared boundary must include all of these inputs before another world is called playable.

## Additive design

- `StoryFoundation`: strictly validated creative content, initial state, protagonist, three initial choices, opening captions, visual/continuity rules and any declared object consequences. It contains no filesystem paths or credentials.
- `StoryTemplate`: stable ID, immutable version, explicit draft/ready/preview status, server-owned asset IDs and opening geometry, plus the foundation.
- A new run copies the selected template and assets into the existing immutable bible. Editing the catalog or creator draft cannot change that run. An operation ID cannot be reused for another template/version.
- Historical bibles without template metadata keep the existing Neon presentation, initial facts and references. No old row is rewritten.
- Story-specific references are supplied as a bounded array to the existing image-edit request. Zero references requires explicit text-only mode; it never inherits Kael artwork. Reference-token planning allowances scale with the supplied count; measured cost still uses returned usage.
- Identity, ownership, irreversible object states, chronology, causal fact references, run isolation and two-decision ending rules remain hard invariants. Creative details remain prompt guidance.

## Storage protection

Before changes, SQLite's backup API copied the original database with a read-only source connection. The backup and isolated POC #8 development copy include 209 records and 53 local assets, with a manifest of record and asset hashes and a successful integrity check. Both are ignored local artifacts. Development and browser testing use isolated data directories; the original `data/` remains untouched.

Creator drafts, versioned templates and pre-run generation attempts will use a separate additive local SQLite ledger. That avoids inventing reader runs solely to account for foundation generation. Reference bytes remain in private local storage and are addressed by ownership-checked IDs, never caller-supplied paths. The application remains local and single-user; these boundaries do not constitute a public authentication system.

## Gates

1. Gate A: complete mocked Neon and Lightkeeper stories through the shared engine, verify historical restoration and immutable versions.
2. Gate B: third tested playable world and six non-playable previews.
3. Gate C: explicit paid-generation action, validated/editable foundation, safe 0–3 uploads, local save and shared reader journey. No live paid tests in this iteration.
4. Gate D: consider a static completed-story export only after prior gates pass.

The scope is additive. If validation reveals that these boundaries require a substantial migration or state-machine rewrite, implementation stops for review.

## Gate A evidence

113 unit/SDK tests, typecheck, lint and the production build passed. Eight browser tests passed using an isolated mock OpenAI server and installed Chrome: complete Neon/Lightkeeper journeys, dialogue-first and out-of-order images, exact owned reference bytes, restart/reload, duplicate claims, explicit retries, limits and safe failures. This is functional evidence, not live output-quality evidence.

A separate compatibility check read all 11 previously completed Neon stories and their 44 final illustrations from the isolated backup copy through the new application's HTTP routes. It created zero generation events. Hash comparison against the original source confirmed all 209 pre-existing records and 53 assets unchanged. The compatibility server used a dummy key and an unreachable loopback OpenAI URL.

## Creator storage and request lifecycle

`creator.sqlite` is separate from the existing `stories.sqlite`. It contains drafts, generation attempts, owned assets, immutable template versions and idempotent save operations. The new database uses version 1, WAL, full synchronization and private permissions. Unsupported versions are rejected. Read-only library/template queries do not create a missing database.

A foundation POST is request-driven and awaited. It checks local configuration, atomically claims an operation and reserves its estimate, then makes one strict Responses request with a 180-second deadline and no SDK retry. The SDK's raw response metadata is retained before JSON, schema and continuity validation; invalid output can therefore still report measured usage. Only a validated foundation replaces the draft. Safe error codes/rule paths are retained, never a rejected raw model response.

The claim lease is four minutes. Expired work becomes interrupted; refresh never resumes it. A late response may reconcile its usage but cannot replace a newer draft. The next paid attempt requires an explicit new operation referring to the failed attempt, plus acknowledgement if its cost is unknown. Reusing an operation with different content fails. Successful replay does not require credentials or call the provider again. A database commit error remains a storage failure; it is not relabeled as a creative-validation failure or automatically recommitted.

Uploaded PNG/JPEG/WebP bytes are bounded before multipart parsing and then fully decoded. Limits: three active references, 5 MiB per input and normalized image, 4,096 pixels per edge, 16 million pixels, still images only. Normalization applies orientation, removes metadata and stores a canonical PNG. Filenames and MIME headers are not trusted; SVG uploads, animation, truncation and corrupt pixel data are rejected. Private assets use content hashes and ownership-checked IDs. Removing a reference detaches it from a draft; saved template/run versions keep their bytes. Files and directory entries are synchronized before records become visible.

The editor saves a new immutable version after validation. Its generated foundation is durable, while unsaved manual edits remain in the page until **Save & make playable**. Cover/opening artwork is clearly labeled authored decorative placeholder art, with no extra image call. References guide the continuation images. Foundation generation uses text alone, so uploads are sent to OpenAI only during explicit reader image edits.

The local library includes latest ready creator versions. Existing reader URLs always load the version and canonical images already captured by that run. There is no authentication or multi-user ownership service; do not expose this local application publicly.

## Completed-story export

`GET /api/runs/<uuid>/export` opens the reader database read-only and loads a consistent transaction snapshot without initializing the engine, migrating storage or recovering stages. It requires the configured ending and every canonical final panel. It verifies ownership, order, script/panel agreement, opening checksums and canonical asset paths before generating a downloadable HTML response. Missing, corrupt, external or symlinked assets are rejected; there is no generation fallback.

Only visible reader content is serialized: title/genre, saved opening captions, final illustrations, dialogue and actual choice/twist recap. Authored SVGs pass a restricted resource-free subset check before rasterization; embedded PNG/JPEG images are re-encoded without metadata. The file uses escaped text, fixed styles, restrictive CSP and no scripts, external requests or links. Images are bounded to 20 MiB each and 48 MiB combined before base64 encoding. This is a portable reading copy, not an editable run or public share URL. Legacy bibles export their own saved opening; template bibles export their immutable opening beats.

Gates B and C passed before export implementation. All three bundled worlds and zero/one/three-reference Creator stories completed mocked two-decision journeys with no new calls on reload. Creator versions and removed reference assets stayed pinned in existing runs. Six unit tests cover export escaping, metadata removal, content/order selection, read-only behavior and missing/foreign/corrupt/SVG-resource rejection.
