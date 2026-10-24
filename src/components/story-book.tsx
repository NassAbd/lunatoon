import Link from "next/link";
import { Icon } from "./icon";
import { INITIAL_CONTEXT } from "@/lib/contracts";
import "@/app/opening.css";

export function StoryHeader({ active }: { active?: "library" | "saved" | "about" }) {
  return <header className="book-header">
    <Link href="/" className="book-brand" aria-label="Lunatoon home"><span><Icon name="moon" size={23} /></span>lunatoon<span className="book-brand-dot">.</span></Link>
    <nav className="book-navigation" aria-label="Main navigation">
      <Link href="/" aria-current={active === "library" ? "page" : undefined}>Library</Link>
      <Link href="/saved" aria-current={active === "saved" ? "page" : undefined}>Saved stories</Link>
      <Link href="/about" aria-current={active === "about" ? "page" : undefined}>About</Link>
    </nav>
  </header>;
}
export function StoryOpening({ src, context }: { src: string; context: string }) {
  const canonical = context === INITIAL_CONTEXT;
  return <section aria-label="Story opening" className="book-opening" id="story">
    <div className="book-title"><p className="book-eyebrow">NEW KYOTO, 2089 · CYBERPUNK NOIR</p><h1>Neon Protocol</h1><p className="book-deck">The city knows everything.<br />Except what you’ll do next.</p></div>
    {canonical ? <div className="opening-beats">
      <OpeningBeat number="01" src="/neon-city.svg" width={1000} height={500} alt="Rain falls between midnight-blue towers above the abandoned transit station">
        <strong>New Kyoto, 2089.</strong> Rain never stops in the lower city.
      </OpeningBeat>
      <OpeningBeat number="02" src={src} width={1000} height={850} original alt="Detective Kael in his yellow coat holds a cyan device in an abandoned transit station">
        Detective Kael follows an anonymous signal into an abandoned transit station.
      </OpeningBeat>
      <OpeningBeat number="03" src="/neon-device.svg" width={1000} height={520} alt="A close view of the palm-sized black device and its cyan core, against fractured station geometry">
        Beneath a shattered advertisement, a palm-sized device pulses cyan. <strong>It knows his name.</strong>
      </OpeningBeat>
      <OpeningBeat number="04" src="/neon-watchers.svg" width={1000} height={420} alt="The station’s surveillance cameras turn inward toward Kael">
        <strong>Every camera turns toward him.</strong> For the first time in years, the city’s all-seeing AI has gone silent.
      </OpeningBeat>
    </div> : <>
      {/* Preserve a noncanonical historical opening instead of substituting new facts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="book-opening-art" src={src} alt="Detective Kael in a yellow coat holds a cyan device in an abandoned neon-lit transit station" />
      <p className="book-narration">{context}</p>
    </>}
    <div className="book-divider" aria-hidden="true"><span /><Icon name="moon" size={17} /><span /></div>
  </section>;
}

function OpeningBeat({ number, src, width, height, alt, original = false, children }: {
  number: string; src: string; width: number; height: number; alt: string; original?: boolean; children: React.ReactNode;
}) {
  return <figure className="opening-beat">
    {/* Authored local vectors are instantly available and need no image transformation. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={original ? "book-opening-art" : undefined} src={src} width={width} height={height} alt={alt} />
    <figcaption><span className="opening-beat-number" aria-hidden="true">{number}</span><p>{children}</p></figcaption>
  </figure>;
}
