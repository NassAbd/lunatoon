# Historical POC reports

These reports preserve Lunatoon's development decisions, investigations and test evidence. Each describes its own checkpoint; earlier behavior, limitations, prices, test counts and instructions may have been superseded. Use the [current README](../../../README.md) for the delivered product and setup, and the [technical documentation](../../story-engine-architecture.md) for implementation details.

| Checkpoint | Focus | Evidence retained |
| --- | --- | --- |
| [POC 01](POC_RESULTS.md) | Initial two-panel experiment and dialogue-first rendering | Initial checks and separately identified user observations |
| [POC 02](POC_02_DECISION.md) | Art direction, character references and same-script comparison | One authorized live A/B comparison; [original structured evidence](POC_02_RUN_2026-10-24.json) |
| [POC 03](POC_03_RESULTS.md) | Persistent state, local assets and API cost controls | Mocked engine, SDK and browser checks |
| [POC 03.1](POC_03_1_RESULTS.md) | Narrative validation and light reader | Observed failure analysis, reconstructed regression and mocked UI checks |
| [POC 04](POC_04_RESULTS.md) | Second-decision investigation and safe diagnostics | Controlled reproductions; limitations of discarded historical errors |
| [POC 04.1](POC_04_1_RESULTS.md) | Complete story reliability | Bounded live investigation, a completed story and persistence checks |
| [POC 05](POC_05_RESULTS.md) | Streaming transport and continuous reading | Mocked delivery, scroll and recovery checks |
| [POC 05.1](POC_05_1_RESULTS.md) | Narrative causality and choice reliability | Regression cases and one completed live activation story |
| [POC 06](POC_06_RESULTS.md) | Platform presentation and saved sessions | Mocked UI/persistence checks and a streaming audit |
| [POC 07](POC_07_RESULTS.md) | Decision compaction and story finale | Mocked reader checks and dated latency research |
| [POC 08](POC_08_RESULTS.md) | Story templates, Creator Studio and offline export | Mocked multi-world, creation and export checks |
| [POC 08.1](POC_08_1_RESULTS.md) | Illustrated openings and resumable content deletion | Isolated storage, ownership, recovery and browser checks |
| [POC 08.2](POC_08_2_RESULTS.md) | Creator management and narrative ownership | Reconstructed narrative fixtures and copied historical-data checks |
| [POC 08.3](POC_08_3_RESULTS.md) | Explicit visual-reference roles and legacy reading review | Mocked continuity checks and read-only/copy-based investigation |
| [POC 08.4](POC_08_4_RESULTS.md) | Library navigation, waiting artwork and completion gates | Mocked UX checks and a separately authorized historical cleanup audit |
| [POC 08.5](POC_08_5_RESULTS.md) | Legacy Creator scenery, sticky navigation and About spacing | Mocked compatibility/navigation checks and preserved-data verification |

## Reading the evidence

- Mocked provider delays and usage are test fixtures, not OpenAI latency measurements or invoices. Live observations are explicitly labeled in their reports and do not establish general reliability or visual-quality guarantees.
- The POC 02 JSON is retained historical evidence already tracked by the project. It contains the shared experiment script, returned request metadata, usage and timings; it does not include credentials or image files.
- Paths under `test-results-live/`, `test-results-engine/` and similar directories refer to **local-only, Git-ignored evidence**. Their screenshots, raw diagnostics, backups and generated artwork are not distributed with this repository. Former Markdown links to those files are shown as labeled code paths so they are not mistaken for public downloads.
- Historical commands and code-formatted repository paths are preserved where they explain the work performed. Follow the current setup instructions rather than treating an old report as an execution checklist. Reports do not grant permission to repeat paid experiments or delete data.
- The two tracked [POC 03.1 screenshots](../../screenshots/) remain as original illustrative history; they are not screenshots of the final interface.

## Related technical notes

Current paths remain stable to avoid unnecessary reorganization:

- [Story engine and recovery](../../story-engine-architecture.md)
- [Templates and Creator architecture](../../story-template-architecture.md)
- [Creator persistence and content management](../../creator-content-management.md)
- [API cost model](../../api-cost-model.md)
- [Dated streaming investigation](../../POC_07_IMAGE_STREAMING.md)
- [Dated visual-reference research](../../POC_08_3_VISUAL_REFERENCES.md)
- [Reference sources and original story guides](../../../references/README.md)
