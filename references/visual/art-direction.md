# Neon Protocol — art direction v02

Goal: the opening and continuation should read as one original, flat-ink cyberpunk noir comic. This is an art target, subject to live review, not an assertion that a generator guarantees it.

## Visual grammar

- Broad flat color shapes, angular adult silhouettes, clean dark contours, and two-tone cel shadows.
- Geometric station architecture and sparse window marks. Rain is fine diagonal ink strokes. Only the device receives a small glow.
- Faces use a few deliberate marks; no skin pores, lens effects, glossy 3D surfaces, photorealism, or painterly microtexture.
- Kael's yellow coat is the dominant warm silhouette. Cyan identifies the device and its local illumination. Keep other bright accents subordinate.

| Anchor | Color |
| --- | --- |
| Midnight ink / hair outline | `#0a1721` |
| Blue slate / city | `#173744` |
| Warm brown skin base | `#a67450` |
| Mustard coat | `#d2a751` |
| Device cyan | `#75fff3` |
| Cybernetic eye amber | `#e5c665` |

The existing SVG opening is retained. Its coat was flattened to the canonical mustard and the face base aligned to the skin swatch. This is a small palette adjustment, not a new opening or a realistic repaint. The authored reference sheet reuses its original scene, silhouette and face geometry, enlarged for inspection, plus those swatches.

## Two-panel composition

1. **Establish consequence.** A wide shot shows Kael and the abandoned station's geography. The reader should see what his chosen action changes. Keep the device or its remains readable.
2. **Reveal response.** An expressive close-up or tight action shot shows a reaction or clue caused by the first panel. Preserve Kael's eye side and collar. Do not redraw the same pose from the same camera distance.

Each frame carries one distinct beat. The second frame changes the reader's knowledge; it does not merely restate the dialogue. A custom cyborg cat must participate in the event or clue instead of being decorative background clutter.

## Dialogue and desktop legibility

Dialogue is HTML, never image lettering. Reserve approximately 20% of quiet space at the actual balloon positions; keep eyes, hands, device and essential clues away from it. Prompts request top-left then bottom-right reading order. Existing supported positions remain valid; the renderer moves a second bubble to the opposite vertical band if both would collide. The image prompt reserves the same resolved positions.

Use one or two short bubbles per panel. Desktop balloons have a light fill, dark outline, clear speaker label, minimum 15px text, and room for wrapping. The script and overlays appear before illustration calls; no image-dependent reveal or typing animation blocks reading. Keep the existing vertical desktop reader and subtle fade.

## Source of truth and experiment

Runtime constraints live in `src/lib/art-direction.ts`; these notes describe them. Approach A adds canonical constraints to each independent text image request. Approach B adds the same authored PNG to each independent edit request. Both share the same script, shots, dimensions and quality. The reference may improve style or identity and may increase cost/latency; measure it rather than assuming.

Rebuild after deliberately editing the opening: `npm run reference:build`. Inspect the resulting sheet before using it. The helper uses the project's installed Next.js image renderer; the application itself reads the prebuilt PNG and does not rasterize on paid requests.
