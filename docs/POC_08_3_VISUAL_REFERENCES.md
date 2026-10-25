# POC 08.3 — visual identity and reference audit

Checked **2026-10-25**. No paid API request, account-access probe, model substitution or historical-image regeneration was performed. Historical evidence was read from the protected local backup, not modified in the user's data directory. Private images, database IDs and file paths are deliberately omitted here.

## Verified API capabilities

| Official source | Verified behavior | Decision for Lunatoon |
| --- | --- | --- |
| [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | Text and image inputs, image output, image-edit endpoint; current dated snapshot `gpt-image-2.5-flare-2026-09-08`. | Retain the configured model. Documentation support does not establish current account access. |
| [Create image edit](https://developers.openai.com/api/reference/resources/images/methods/edit) | One or more image references, up to 16; JPEG, `low` quality and the existing portrait size are supported. Edit streaming accepts 0–3 requested partials; fewer may arrive. Prompt maximum is 32,000 characters. | Retain the application's stricter three-reference maximum, `n:1`, quality, size, compression and streaming. There is no documented canonical-subject parameter or per-reference numeric weight. |
| [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation#edit-images) | Existing images can guide a new composition. The limitations section warns that recurring-character consistency can still fail. | References guide identity; they do not guarantee it. Continue independent calls with shared frozen inputs. |
| [Image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting#prompting-fundamentals) | Recommends identifying reference purpose by input number and separating requested changes from details to preserve. | Use explicit numbered roles, a full written identity bible and separate current appearance/custody. This is application prompt guidance, not a provider enforcement feature. |

The official Docs MCP fetch for the edit-method page returned 404 during research; opening that same official URL through the web reader succeeded. Its content was inspected. The current endpoint's `input_fidelity` description names earlier image models, not Flare; this iteration does not add that parameter or assume older first-input fidelity rules apply to Flare.

## Confirmed local findings

The completed *Running Hell* backup has one selected image reference and no role metadata. That upload depicts an environment and contains no person. The same selected reference list is used for every continuation image; the code does not alternate references between panel 1 and panel 2. Three generated opening images are available in the frozen Bible's owned assets, but are not in the selected reference list and were not supplied to continuation edits.

The opening provider passed the complete `character_bible`. The continuation provider instead passed only the protagonist's `visual_anchor`, which in this example is `red_jacket_ponytail`. The fuller saved description includes age 15 and Afro-American identity, which the short anchor omits. The user's expected dark skin is also established visually in the opening. The saved description does not literally specify a skin shade.

Manual inspection of the backed-up opening and continuation images supports the reported substantial change in skin rendering, facial features and hair treatment. This is a subjective visual assessment of existing images. It does not establish the model's internal cause. The missing full identity description and absence of an actual character image are concrete input deficiencies; stochastic model variation remains a limitation.

Wide and close framing are requested consistently. There is no evidence that camera distance alone caused the drift, so shot diversity and concurrent generation are preserved.

## Implemented authority rules

- Optional saved `visual_references` assign each selected asset one explicit role: `protagonist`, `character`, `environment`, `style` or `unspecified`. IDs must be unique, already selected and owned; at most one protagonist reference is allowed. These labels are outside model-generated foundation JSON.
- Selection is stable: protagonist, additional characters, environment, style, then unassigned inputs. Saved order is retained within each role. There are no additional inputs or image calls.
- Without explicit metadata, references keep their original order and are all unassigned. The prompt says no canonical protagonist image has been designated and gives the written bible authority. It does not infer a character from the first upload, a filename or a descriptive caption.
- The known authored legacy Kael sheet remains an explicitly known character reference. Creator uploads receive no such implicit approval. An opening is not silently promoted into a canonical reference.
- Every persistent continuation now receives the entire saved character bible, the named protagonist's identity anchor and explicit skin/face/age/hair preservation instructions. Lighting, expression, action and framing cannot redefine identity. Saved injuries, clothing condition and object custody override their original conditions in the bible or image.
- Opening requests use the same identity/reference policy. Their reuse fingerprint includes the effective role instructions and input ordering. New prompt versions are `creator-opening-08.3-identity` and `story-visual-08.3-identity`.

Existing saved versions, runs and completed illustrations remain unchanged. Role edits apply through explicit new saves; a reader run uses its frozen version rather than current draft metadata. Files are still resolved through existing owned-asset reads, never through browser-supplied paths. Model, quality, streaming, concurrency, reservations, idempotency, retry and final-only persistence behavior are unchanged.

## Automated evidence

`tests/visual-reference-identity.test.ts` adds eight offline unit/official-SDK mocked-transport checks:

1. Explicit hierarchy and conservative unassigned fallback.
2. Rejection of foreign, duplicate and competing protagonist assignments.
3. One-reference, two-reference and three-reference complete two-decision journeys: identical canonical bytes for all four images, full written identity, two requests concurrently in flight, and unchanged model/quality/size. Mutable wrist-device possession is reflected in later prompts without losing stable identity; saved reload/restart adds no requests.
4. Unassigned Creator inputs preserve original order; owned opening images are not silently appended.
5. Zero-reference explicit text mode preserves the written identity and does not claim reference input.
6. An interrupted illustration has no automatic retry; an explicit isolated retry retains frozen selection and does not regenerate its successful sibling or narrative.

The parameterized one/two/three-reference case accounts for three tests. TypeScript and targeted ESLint passed. The targeted six-file suite passed **65 tests**, covering these eight checks plus existing visual, template, provider, service and Creator-opening coverage. See the iteration results report for the final whole-repository gate. Synthetic fixture text uses the user's supplied Kai attributes; it is not a recovered historical image request or new live result.

Tests establish input consistency, ownership and persistence behavior. They cannot establish visual likeness or a quality improvement in future generated pixels. Measured usage accounting remains provider-returned; no fresh latency or cost measurement is reported.

## Remaining limits and separately authorized verification

An unassigned environmental upload remains an ambiguous visual input. To use a character image, the creator must deliberately select an appropriate owned/uploaded image as protagonist; the app neither discovers faces nor approves an opening automatically. The three-upload limit remains in force. Contradictions inside an authored free-text bible are not semantically resolved by this change. Very large valid bibles and accumulated state can approach the provider's prompt limit; identity or state must not be silently truncated to make a request fit.

For a separately authorized small A/B check, use the same saved two-panel script, model, quality, dimensions and explicitly approved reference bytes. Request two images with the previous prompt policy and two with the new policy: four image calls, zero narrative calls, no automatic retries. Keep both pairs separate from historical content. Record request IDs, returned usage and estimated cost, then compare age, skin tone, facial shape, hair, jacket, device and current injuries/custody across wide and close shots. Treat one pair as an observation, not proof or a benchmark. A subsequent complete two-decision live verification should be authorized separately if needed.

For the ordinary manual reader check after authorization: verify the saved reference roles, generate both decisions, compare all four panels to the approved character image, inspect the recorded state changes, then reload and confirm no new calls. Until that occurs, this iteration claims improved input reliability only.
