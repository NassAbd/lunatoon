# Lunatoon POC 02 — checked references

Checked **2026-10-24**. These are research sources, not permission to copy their artwork. The iteration prompt takes priority over `SPECS.md`.

| Source | Result and use |
| --- | --- |
| [WEBTOON Academy downloads](https://www.webtoons.com/en/creators101/webtoon-academy/resource-list?resourceType=DOWNLOAD_RESOURCE) | Opened; verified the handbook, Character Sheet and Character Design download links. |
| [Character Sheet](https://webtoons-static.pstatic.net/creator101/en/pdf/Character-Sheet-2024.pdf?dt=2024011001) | Read the one-page PDF. Distinguish a character's role, motivation and internal conflict; applied to Kael's narrative bible. |
| [Character Design Sheet](https://webtoons-static.pstatic.net/creator101/en/pdf/Character-Design-Sheet.pdf?dt=2024011001) | Read the two-page PDF. A stable full-body design, expressions and color swatches help continuity. The sample character and artwork are not used. |
| [Creator Resource Handbook](https://webtoons-static.pstatic.net/creator101/en/pdf/Creators-Resource-Handbook-Updated.pdf?dt=2024011501) | Web extraction failed: 16,999,080 bytes exceeded the reader limit. Downloaded the official PDF to a temporary location and extracted its text successfully (37 PDF pages). Studied PDF pages 9, 11–13 and 15–21: scroll pacing, restrained dialogue, impact panels, sustainable style, and reusable original assets. Lunatoon keeps its desktop layout; mobile publishing dimensions are not implementation requirements here. |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Fetched current guide. Keep strict schema validation, explicit refusal/incomplete handling, and exactly two panels. |
| [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation) | Fetched current guide. Independent reference edits are supported; streaming exists but is not needed for this narrowly scoped comparison. |
| [Image edits API](https://developers.openai.com/api/reference/resources/images/methods/edit) | Documentation-tool Markdown fetch returned 404; direct HTML retrieval succeeded. The official image guide also supplies the JavaScript multipart example used here. |
| [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) | Fetched model card; Responses and Structured Outputs supported. Actual configured narrative model matches. |
| [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | Fetched model card; generation and image editing supported. Actual configured image model matches, quality `low`. |
| [OpenAI pricing](https://developers.openai.com/api/docs/pricing) | Fetched Standard rates. Per-million tokens: GPT-4.1 Mini input $0.40, cached input $0.10, output $1.60; Flare text input $5, image input $8, image output $30. The one-off report uses returned modality counts; these are estimates, not invoices. |
| [Lunatoon repository](https://github.com/NassAbd/lunatoon) | Inspected via authenticated repository metadata and `git ls-remote`. Remote `main` matched local baseline `7a6df63c29bd45d58f8df4e8433529307cb0d109`. Implementation source is the local working tree, on `feat/visual-consistency`. |

## Original work and copyright

The art guide, Kael bible, narrative notes, and SVG drawings are original Lunatoon materials. `public/kael-reference.svg` is assembled from this repository's own opening illustration; its PNG is a local rasterization, not downloaded or generated third-party art. Both reference and opening have the same origin. No WEBTOON templates, sample drawings, logos, PDF pages, or franchise characters are bundled or uploaded to OpenAI. Generated comparison images stay in ignored local test artifacts; they are not committed.

Composition decisions such as the 20% quiet dialogue margin and wide-shot/close-up pairing are Lunatoon-specific experiments, not quoted WEBTOON rules. Source advice informs the experiment; it does not establish that the resulting images or latency have improved.

See [art direction](visual/art-direction.md), [Kael](visual/kael-character-bible.md), [narrative continuity](narrative/neon-protocol.md), [API notes](technical/api-references.md), and [decision/evidence](../docs/archive/poc/POC_02_DECISION.md).
