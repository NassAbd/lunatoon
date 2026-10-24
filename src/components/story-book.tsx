import Link from "next/link";
import { Icon } from "./icon";

export function StoryHeader({ home = false }: { home?: boolean }) {
  return <header className="book-header">
    <Link href="/" className="book-brand" aria-label="Lunatoon home"><span><Icon name="moon" size={23} /></span>lunatoon<span className="book-brand-dot">.</span></Link>
    <Link href={home ? "#about" : "/"} className="book-navigation">{home ? "About this story" : "New story"}<Icon name="arrow" size={15} /></Link>
  </header>;
}
export function StoryOpening({ src, context }: { src: string; context: string }) {
  return <section aria-label="Story opening" className="book-opening" id="story">
    <div className="book-title"><p className="book-eyebrow">NEW KYOTO, 2089 · CYBERPUNK NOIR</p><h1>Neon Protocol</h1><p className="book-deck">The city knows everything.<br />Except what you’ll do next.</p></div>
    {/* Original owned opening; no generated or reinterpreted art. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="book-opening-art" src={src} alt="Detective Kael in a yellow coat holds a cyan device in an abandoned neon-lit transit station" />
    <p className="book-narration">{context}</p>
    <div className="book-divider" aria-hidden="true"><span /><Icon name="moon" size={17} /><span /></div>
  </section>;
}
