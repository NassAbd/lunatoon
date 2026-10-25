// Original Lunatoon SVG geometry only. No third-party or generated artwork.
// sharp is already installed by the project's declared Next.js dependency.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const opening = await readFile(new URL("../public/neon-protocol.svg", import.meta.url), "utf8");
const definitions = opening.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
const figure = opening.slice(opening.indexOf('  <path d="m504 636'), opening.indexOf('  <path d="m249 0'));
if (!definitions || !figure.includes("m540 374")) throw new Error("Opening geometry changed; review the reference crop before rebuilding.");
const scene = opening.replace(/<svg[^>]*>/, '<svg x="0" y="80" width="1000" height="850" viewBox="0 0 1000 850" fill="none">');
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" fill="none">
<defs>${definitions}<g id="kael">${figure}</g></defs>
<path d="M0 0h1600v1000H0z" fill="#0a1721"/>
${scene}
<path d="M1010 80v850" stroke="#355464" stroke-width="2"/>
<svg x="1020" y="175" width="250" height="735" viewBox="410 300 240 530"><use href="#kael"/></svg>
<svg x="1280" y="270" width="290" height="450" viewBox="480 310 105 165"><use href="#kael"/></svg>
<path d="M1080 100h70v45h-70z" fill="#a67450"/><path d="M1165 100h70v45h-70z" fill="#d2a751"/>
<path d="M1250 100h70v45h-70z" fill="#173744"/><path d="M1335 100h70v45h-70z" fill="#75fff3"/>
<path d="M1420 100h70v45h-70z" fill="#e5c665"/>
</svg>`;
await writeFile(new URL("../public/kael-reference.svg", import.meta.url), sheet);
await sharp(Buffer.from(sheet)).png().toFile(new URL("../public/kael-reference.png", import.meta.url).pathname);
console.log("Built original kael-reference.svg and PNG (1600 × 1000).");
