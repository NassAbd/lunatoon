import { ART_DIRECTION, CHARACTER_IDENTITY } from "../art-direction";
import { CHOICES, INITIAL_CONTEXT } from "../contracts";
import { StoryTemplateSchema, type StoryTemplate } from "../story-engine/contracts";
import { initialState } from "../story-engine/state";

// Authored, allowlisted source descriptors only. The server resolver reads bytes;
// API responses use owned asset IDs rather than accepting a filesystem path.
export type BundledStorySource = {
  template: StoryTemplate;
  assets: { id: string; source: string; mime: string; purpose: string }[];
};

export const NEON_PROTOCOL_TEMPLATE = StoryTemplateSchema.parse({
  id: "neon-protocol", version: 1, status: "ready",
  title: "Neon Protocol", genre: "Cyberpunk Noir",
  description: "A city that knows everything. A device that knows your name. One detective chooses what happens next.",
  premise: INITIAL_CONTEXT,
  world: "New Kyoto, 2089. An all-seeing city AI controls surveillance. Rain falls through the lower city, but the AI has suddenly gone silent.",
  protagonist_id: "kael", character_bible: CHARACTER_IDENTITY, art_direction: ART_DIRECTION,
  object_anchor: "Palm-sized black square device with cyan core; its condition follows saved state. Never restore a destroyed device silently.",
  setting_anchor: "Abandoned transit station, New Kyoto, 2089. Rain, geometric midnight-blue city, cyan surveillance. Continue in the same time and place unless a causal event explicitly moves the scene.",
  continuity_rules: [
    "Preserve Kael's immutable face, skin tone, hair, scar, amber anatomical left eye, and mustard-yellow coat.",
    "The opening already happened. The device is held by Kael and knows his name; the cameras track him while the city AI is silent.",
    "Activation must activate the device. Destruction must destroy it, with any requested tool visible. Investigation must examine evidence.",
    "A destroyed device stays destroyed. Fragments, ownership, injuries and clothing follow saved state.",
    "An origin revelation is optional. The second decision must pay off the chosen consequence and resolve this short story.",
  ],
  initial_state: initialState(),
  initial_decision: { question: "What should Kael do?", options: [
    { id: "activate", label: CHOICES[0] }, { id: "destroy", label: CHOICES[1] }, { id: "investigate", label: CHOICES[2] },
  ] },
  choice_effects: [{ choice_id: "activate", object_id: "device", condition: "active" }, { choice_id: "destroy", object_id: "device", condition: "destroyed" }],
  cover_asset_id: "opening", reference_asset_ids: ["kael_reference"],
  opening_beats: [
    { asset_id: "city", width: 1000, height: 500, caption: "New Kyoto, 2089. Rain never stops in the lower city.", alt: "Rain falls between midnight-blue towers above the abandoned transit station" },
    { asset_id: "opening", width: 1000, height: 850, caption: "Detective Kael follows an anonymous signal into an abandoned transit station.", alt: "Detective Kael in his yellow coat holds a cyan device in an abandoned transit station" },
    { asset_id: "device", width: 1000, height: 520, caption: "Beneath a shattered advertisement, a palm-sized device pulses cyan. It knows his name.", alt: "A close view of the palm-sized black device and its cyan core, against fractured station geometry" },
    { asset_id: "watchers", width: 1000, height: 420, caption: "Every camera turns toward him. For the first time in years, the city's all-seeing AI has gone silent.", alt: "The station's surveillance cameras turn inward toward Kael" },
  ],
});

export const MARA_IDENTITY = "Mara: a 24-year-old woman with warm deep-brown skin, an oval face, broad dark eyebrows, dark-brown eyes, and short rounded black curls. A small ivory shell hairpin sits above her anatomical left ear (viewer-right in a frontal view). Seafoam-green hooded cape with a cream collar over a cream knit top, muted peach scarf, dark green trousers and brown ankle boots. Adult proportions. No cybernetic eye, scar, yellow trench coat or futuristic equipment. Preserve the same face, hairpin side, hairstyle, cape and scarf in every panel.";
export const LIGHTKEEPER_ART_DIRECTION = "Original coastal-fantasy comic, quiet wonder rather than cyberpunk. Broad flat shapes, delicate dark-green contours and restrained two-tone shading. Cream sky #f5f0e5, seafoam #b8d2c5, deeper sea #85ad9e, warm skin #a86d54, cape #88b4a2, peach scarf #d3a088, dark-green ink #355d55, soft gold lantern #f4d891. Rounded clouds, long horizontal sea lines, simple weathered stone and clean character silhouettes. Golden light belongs to the lantern and reflected stars. No photorealism, 3D, neon circuitry, elaborate texture, letters, labels, signage, speech balloons or watermarks. Dialogue is overlaid by the app.";

export const LAST_LIGHTKEEPER_TEMPLATE = StoryTemplateSchema.parse({
  id: "last-lightkeeper", version: 1, status: "ready",
  title: "The Last Lightkeeper", genre: "Coastal Fantasy / Mystery",
  description: "The tide has forgotten its rhythm. A young keeper carries the last light that still answers the stars.",
  premise: "On the island of Avel, the tide has stopped below an old stone causeway. Mara, the young lighthouse keeper, holds a fading brass tide lantern. Three lights reflected beneath the still water pulse with the star inside it. The exposed causeway leads toward the lighthouse, whose great lens is dark. Mara must choose how to restore a living rhythm to the shore before its last light fades.",
  world: "Avel is a small island where the lighthouse once helped the sea answer the stars. Quiet magic is physical and observable: light, reflections, lenses and the moving tide. The current problem affects one shore and one lighthouse; do not invent an unrelated kingdom, prophecy or cosmic war.",
  protagonist_id: "mara", character_bible: `${MARA_IDENTITY} Mara is patient, practical and curious. She wants to protect her island without treating the sea as a machine to command. Let her chosen action change her understanding and the island's immediate fate.`,
  art_direction: LIGHTKEEPER_ART_DIRECTION,
  object_anchor: "The tide lantern is a hand-sized six-sided brass lantern, sea-glass panes, narrow arched handle, and one suspended golden star. Its faint light is already active in the opening. Preserve its shape, scale and custody. The lighthouse lens is fixed in the tower, not another handheld lantern. Do not substitute a cyan electronic device.",
  setting_anchor: "The coast of Avel in a pale, moonlit dusk: cream lighthouse with a peach band and dark green roof, seafoam water, weathered stone causeway, small green cliffs. Mara begins beside the exposed path with the lantern in hand. Movement along the path or into the tower must be depicted causally.",
  continuity_rules: [
    "Mara is the same adult keeper throughout; preserve her shell hairpin, short curls, cape and scarf.",
    "The tide is stalled, the lighthouse lens is dark, and the lantern still glows faintly when the opening ends.",
    "The three underwater lights and the lantern pulse together; this is observed evidence, not proof of a hidden speaker.",
    "The selected action must produce a concrete new observation or change that motivates the next decision.",
    "New magical rules must follow shown evidence; do not resolve the problem with an unintroduced artifact or unseen helper.",
    "Keep lantern ownership and visible condition synchronized with saved state; damage and lost objects cannot silently reset.",
    "The final chapter settles the immediate tide-and-light problem and Mara's choice, without a new quest or prophecy.",
  ],
  initial_state: {
    facts: [
      { id: "tide_stalled", text: "Avel's tide has stopped below the old stone causeway." },
      { id: "lantern_answers", text: "The fading tide lantern pulses with three lights reflected beneath the still water." },
      { id: "causeway_exposed", text: "The first stretch of the causeway is exposed and leads toward the lighthouse's dark lens." },
    ],
    characters: [{ id: "mara", name: "Mara", visual_anchor: MARA_IDENTITY, injuries: [], clothing_condition: "Seafoam cape and peach scarf, damp at the hem from sea mist", carried_objects: ["tide_lantern"] }],
    objects: [{ id: "tide_lantern", name: "Hexagonal brass tide lantern with sea-glass panes and a suspended golden star", condition: "active", holder: "mara" }],
    relationships: ["Mara cares for Avel's shore and seeks to understand the sea's rhythm."],
    unresolved_threads: ["What has interrupted the tide's rhythm, and how will Mara settle it before the lantern fades?"],
  },
  initial_decision: { question: "How should Mara answer the fading light?", options: [
    { id: "answer_stars", label: "Raise the lantern to answer the stars" },
    { id: "follow_causeway", label: "Follow the exposed tide path" },
    { id: "inspect_lens", label: "Inspect the lighthouse's dark lens" },
  ] },
  choice_effects: [], cover_asset_id: "coast", reference_asset_ids: ["mara_reference"],
  opening_beats: [
    { asset_id: "coast", width: 1000, height: 650, caption: "On Avel, the sea has forgotten when to return. The old lighthouse watches a motionless tide.", alt: "A cream lighthouse rises above a still seafoam sea beneath a peach moon" },
    { asset_id: "mara", width: 1000, height: 680, caption: "Mara holds the last tide lantern. Its little star is fading, but it has not gone quiet.", alt: "Mara, wearing a seafoam cape and peach scarf, holds a faintly glowing brass lantern" },
    { asset_id: "lantern", width: 1000, height: 500, caption: "Three lights shimmer beneath the water. The lantern answers each one with a pulse.", alt: "The lantern's golden star and three underwater reflections shine together" },
    { asset_id: "causeway", width: 1000, height: 480, caption: "A path lies bare where the tide should be. It leads toward a lens that no longer shines.", alt: "An exposed stone causeway crosses the still water to the dark lighthouse" },
  ],
});

export const IVO_IDENTITY = "Ivo: a 27-year-old man with warm medium-tan skin, an oval face, dark-brown eyes, close-cropped dark-brown hair and one curled forelock. Round copper-rimmed glasses, no beard. Cream utility vest with two square pockets over a deep-plum long-sleeved tunic, rust-red trousers and ochre ankle boots. Adult proportions and a calm, attentive expression. Preserve his glasses, forelock, face, vest, color blocks and body proportions. No yellow trench coat, cybernetic eye, shell hairpin or seafoam cape.";
export const ORCHARD_ART_DIRECTION = "Original solarpunk adventure comic. Geometric glass arches, copper fixtures, terracotta soil and sparse coral leaves. Flat editorial color shapes, clean plum-umber ink contours, broad two-tone shadows, no photographic or painterly textures. Palette: plum ink #42384c, dusk #332b48, cream #ead9b9, copper #ba8058, skin #c38b62, rust #b96757, plum tunic #66506c, coral glass and foliage #ed9878. Clear silhouettes, spacious compositions and warm glass reflections. No neon cyberpunk skyline, ocean, 3D render, lettering, captions, speech balloons, logos or watermarks. App dialogue is added separately.";
export const GLASS_ORCHARD_TEMPLATE = StoryTemplateSchema.parse({
  id: "glass-orchard", version: 1, status: "ready",
  title: "The Glass Orchard", genre: "Solarpunk Adventure",
  description: "Under a copper canopy, the last sapling is waiting. A young gardener follows a compass that points toward life.",
  premise: "At dusk in the desert city of Sere, the glass orchard's root channels have stopped carrying water. Ivo holds a copper seed compass, whose coral center points toward a sealed irrigation hatch. Only one coral-leaved sapling remains alive beneath the hot glass canopy. He must choose how to discover the obstruction or protect that last growth, then settle the orchard's immediate fate.",
  world: "Sere stores water beneath glass-roofed gardens. Simple solar mechanisms, lenses and root channels keep plants alive; unusual plant responses are observable, not unlimited magic. The seed compass detects living roots rather than north. Focus on one orchard and its water problem, without an outside war, new villain or sudden rescue.",
  protagonist_id: "ivo", character_bible: `${IVO_IDENTITY} Ivo is an observant young gardener who believes a living thing is worth more than a perfect machine. He wants to preserve the last sapling and discover what his inherited tools can still do.`,
  art_direction: ORCHARD_ART_DIRECTION,
  object_anchor: "The seed compass is a palm-sized round copper disk, ivory face, four plum petal-shaped pointer marks, and one coral glass center. Ivo holds it. It is already active, pointing toward the sealed irrigation hatch. The hatch wheel is a fixed large fixture, not another compass; the sapling remains rooted unless a depicted action moves it.",
  setting_anchor: "A dry terracotta orchard beneath copper-framed glass arches, at plum-colored dusk in Sere. Bare trees and open dry root channels converge near a sealed round irrigation hatch; one coral-leaved sapling remains. Continue within this orchard unless a shown action moves Ivo.",
  continuity_rules: [
    "Preserve Ivo's copper glasses, curled forelock, cream utility vest, plum tunic and rust trousers.",
    "The water channels are dry, the irrigation hatch is sealed, and the seed compass is already active at the opening.",
    "The compass responds to living roots. Do not silently turn it into a weapon, radio or map with readable lettering.",
    "Opening the hatch must reveal or change something concrete; following roots must discover evidence; shading the sapling must protect it visibly.",
    "New repairs require an observable cause and action. Do not introduce an unearned water source or unseen rescuer.",
    "Object identity, custody and any damage follow saved state. Damage must not disappear between panels.",
    "The final chapter settles the orchard or last sapling's immediate fate and Ivo's decision, without promising another journey.",
  ],
  initial_state: {
    facts: [
      { id: "orchard_dry", text: "The glass orchard's root channels have stopped carrying water." },
      { id: "compass_points", text: "Ivo's active seed compass points toward the sealed irrigation hatch." },
      { id: "last_sapling", text: "One living coral-leaved sapling remains beneath the hot glass canopy." },
    ],
    characters: [{ id: "ivo", name: "Ivo", visual_anchor: IVO_IDENTITY, injuries: [], clothing_condition: "Cream utility vest and plum tunic dusted with terracotta soil", carried_objects: ["seed_compass"] }],
    objects: [{ id: "seed_compass", name: "Round copper seed compass with an ivory face and coral glass center", condition: "active", holder: "ivo" }],
    relationships: ["Ivo cares for the last living sapling in Sere's glass orchard."],
    unresolved_threads: ["Why have the root channels gone dry, and how will Ivo settle the last sapling's fate?"],
  },
  initial_decision: { question: "Where should Ivo begin?", options: [
    { id: "open_hatch", label: "Open the sealed irrigation hatch" },
    { id: "follow_roots", label: "Follow the compass beneath the trees" },
    { id: "shade_sapling", label: "Shade the last living sapling" },
  ] },
  choice_effects: [], cover_asset_id: "orchard", reference_asset_ids: ["ivo_reference"],
  opening_beats: [
    { asset_id: "orchard", width: 1000, height: 650, caption: "Sere, at dusk. The glass orchard is still warm, but its roots have gone thirsty.", alt: "Dry channels and one coral-leaved sapling beneath a copper greenhouse and plum sky" },
    { asset_id: "ivo", width: 1000, height: 680, caption: "Ivo has one living sapling left to protect, and a compass that follows life instead of north.", alt: "Ivo in copper glasses, a cream vest and plum tunic holds his round seed compass" },
    { asset_id: "compass", width: 1000, height: 480, caption: "The coral center stirs. Its pointer leads away from the branches, down toward the roots.", alt: "A copper compass with an ivory face and coral center above the dry channels" },
    { asset_id: "hatch", width: 1000, height: 460, caption: "Every channel meets a sealed hatch. Beyond it, something has stopped the water.", alt: "A sealed copper irrigation hatch sits where the dry channels meet near the last sapling" },
  ],
});

export const BUNDLED_STORIES: readonly BundledStorySource[] = [
  { template: NEON_PROTOCOL_TEMPLATE, assets: [
    { id: "opening", source: "public/neon-protocol.svg", mime: "image/svg+xml", purpose: "Original fixed Kael opening" },
    { id: "city", source: "public/neon-city.svg", mime: "image/svg+xml", purpose: "Original station establishing beat" },
    { id: "device", source: "public/neon-device.svg", mime: "image/svg+xml", purpose: "Original device close-up" },
    { id: "watchers", source: "public/neon-watchers.svg", mime: "image/svg+xml", purpose: "Original surveillance beat" },
    { id: "kael_reference", source: "public/kael-reference.png", mime: "image/png", purpose: "Immutable original Kael and style reference" },
    { id: "character_bible", source: "references/visual/kael-character-bible.md", mime: "text/markdown", purpose: "Original Kael identity bible" },
    { id: "art_guide", source: "references/visual/art-direction.md", mime: "text/markdown", purpose: "Original Neon Protocol art guide" },
    { id: "narrative_bible", source: "references/narrative/neon-protocol.md", mime: "text/markdown", purpose: "Original opening and choice notes" },
  ] },
  { template: LAST_LIGHTKEEPER_TEMPLATE, assets: [
    { id: "coast", source: "public/last-lightkeeper.svg", mime: "image/svg+xml", purpose: "Original Avel cover and coastal establishing beat" },
    { id: "mara", source: "public/lightkeeper-mara.svg", mime: "image/svg+xml", purpose: "Original Mara opening beat" },
    { id: "lantern", source: "public/lightkeeper-lantern.svg", mime: "image/svg+xml", purpose: "Original lantern close-up" },
    { id: "causeway", source: "public/lightkeeper-causeway.svg", mime: "image/svg+xml", purpose: "Original causeway and lighthouse beat" },
    { id: "mara_reference", source: "public/mara-reference.png", mime: "image/png", purpose: "Immutable original Mara, costume and lantern reference" },
    { id: "character_bible", source: "references/visual/mara-character-bible.md", mime: "text/markdown", purpose: "Mara identity and original asset provenance" },
    { id: "narrative_bible", source: "references/narrative/last-lightkeeper.md", mime: "text/markdown", purpose: "Avel premise, choices and continuity" },
  ] },
  { template: GLASS_ORCHARD_TEMPLATE, assets: [
    { id: "orchard", source: "public/glass-orchard.svg", mime: "image/svg+xml", purpose: "Original glass orchard cover and establishing beat" },
    { id: "ivo", source: "public/orchard-ivo.svg", mime: "image/svg+xml", purpose: "Original Ivo opening beat" },
    { id: "compass", source: "public/orchard-compass.svg", mime: "image/svg+xml", purpose: "Original seed-compass close-up" },
    { id: "hatch", source: "public/orchard-hatch.svg", mime: "image/svg+xml", purpose: "Original irrigation hatch and last sapling" },
    { id: "ivo_reference", source: "public/ivo-reference.png", mime: "image/png", purpose: "Immutable original Ivo, costume and seed-compass reference" },
    { id: "character_bible", source: "references/visual/ivo-character-bible.md", mime: "text/markdown", purpose: "Ivo identity and original asset provenance" },
    { id: "narrative_bible", source: "references/narrative/glass-orchard.md", mime: "text/markdown", purpose: "Sere premise, choices and continuity" },
  ] },
];

export type PreviewStory = { id: string; title: string; genre: string; description: string; cover: string; alt: string; status: "preview" };
// Discovery-only metadata: these IDs have no playable template or generation route.
export const PREVIEW_STORIES: readonly PreviewStory[] = [
  { id: "velvet-signal", title: "Velvet Signal", genre: "Supernatural Mystery", description: "An old radio receives tomorrow's voices. Tonight, one of them asks to be forgotten.", cover: "/preview-velvet-signal.svg", alt: "A plum radio receives silver ripples beneath a red moon", status: "preview" },
  { id: "cloudbreak-express", title: "Cloudbreak Express", genre: "Sky Adventure", description: "The last train above the clouds has missed a station that no map remembers.", cover: "/preview-cloudbreak-express.svg", alt: "A coral train crosses an elevated track above cream clouds", status: "preview" },
  { id: "quiet-giant", title: "The Quiet Giant", genre: "Woodland Fantasy", description: "A stone guardian wakes with a forest growing through its memories.", cover: "/preview-quiet-giant.svg", alt: "A moss-covered stone giant gently holds a small sprout", status: "preview" },
  { id: "salt-stardust", title: "Salt & Stardust", genre: "Cozy Science Fiction", description: "A tiny orbital kitchen serves comfort food to travelers with impossible homesickness.", cover: "/preview-salt-stardust.svg", alt: "A teacup floats beside an orange ringed planet in a quiet orbital kitchen", status: "preview" },
  { id: "paper-kingdom", title: "Paper Kingdom", genre: "Fairy-tale Adventure", description: "Every fold changes the border. A paper messenger must carry a promise without tearing it.", cover: "/preview-paper-kingdom.svg", alt: "An ivory folded castle rises from vermilion paper hills", status: "preview" },
  { id: "blue-hour-society", title: "Blue Hour Society", genre: "Urban Mystery", description: "For one missing hour, the city belongs to people who remember a different yesterday.", cover: "/preview-blue-hour.svg", alt: "A coral umbrella rests on a blue rooftop beneath a mysterious clock", status: "preview" },
];
