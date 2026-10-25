# Neon Protocol — one continuation

## Fixed opening

New Kyoto, 2089. Rain never stops in the lower city. Detective Kael follows an anonymous signal into an abandoned transit station. Beneath a shattered advertisement, he finds a palm-sized black device with a pulsing cyan core. It knows his name. Every surveillance camera turns toward him. For the first time in years, the city's all-seeing AI has gone silent.

The fixed art shows Kael at the station holding the cyan device. Its authored caption and dialogue are overlays. Do not interpret them as text to reproduce in generated art.

## Choice-specific causal beats

| Action | Panel 1: visible consequence, wide | Panel 2: new information, close or tight action |
| --- | --- | --- |
| Activate the device | Show deliberate activation and a local response in the station | Reveal an unexpected message, signal consequence or Kael's changed understanding |
| Destroy the device | Show the attempt or destruction, with fragments/residue if successful | A clue or consequence survives; do not silently restore the intact device |
| Investigate its origin | Examine a physical or signal clue in the station | Reveal evidence that changes Kael's suspicion, not merely another view of him holding it |

These are staging constraints, not prewritten outcomes. The model must still create the continuation. No new choice, branch router, long ending, world reset or different base story is added.

## Controlled comparison input

- Choice: **Investigate its origin**
- Twist: **A mysterious cyborg cat suddenly appears.**

Generate the script once and reuse it without editing for A and B. The cat should cause or help reveal the clue. Keep its appearance consistent across the two descriptions if it appears twice. Kael remains the principal visual anchor. The same station, rain, device state and short elapsed time connect the beats.

## Script budget and consistency

Keep the existing strict two-panel schema and 1–2 bubbles per panel. Request visual descriptions of at most 25 words, image directions of 35–65 words, and dialogue of at most 18 words per bubble. Word ranges are prompt guidance, not a new validator that rejects an otherwise valid POC 01 response. The server appends the fixed character bible, palette, ink style, shot and dialogue clear zones; the model no longer needs to regenerate repeated bible/style prose in each panel.

Preserve the concrete action and clue when reducing duplicated prose. Do not cut narrative quality, validation, or refusal handling merely to reach an arbitrary time. Shorter output is a latency hypothesis to measure, not a promised improvement.
