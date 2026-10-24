import Link from "next/link";
import { StoryHeader } from "@/components/story-book";
import { Icon } from "@/components/icon";
export default function AboutPage() {
  return <div className="story-reader library-page"><StoryHeader active="about" /><main className="about-main">
    <div className="about-mark"><Icon name="moon" size={34} /></div><p className="book-eyebrow">A LITTLE MOONLIGHT. A DIFFERENT STORY.</p><h1>Some stories<br />need your imagination.</h1>
    <p>Lunatoon is a small experiment in interactive webtoons. Read the opening, make a choice, and add a twist of your own. AI helps turn your decisions into dialogue and illustrations.</p>
    <section><h2>One world. Your way through it.</h2><p><em>Neon Protocol</em> is playable now: two decisions, four new illustrated panels, and a personal ending. Words arrive first; artwork follows as each illustration finishes. Character details and story outcomes can vary.</p><Link href="/story/neon-protocol">Meet Detective Kael <span aria-hidden="true">↗</span></Link></section>
    <section><h2>A place to come back to.</h2><p>Your story stays on this local installation, including its dialogue, choices and illustrations. Saved stories open without generating them again. This demo has no accounts, cloud sync or public sharing.</p><Link href="/saved">Visit your saved stories <span aria-hidden="true">↗</span></Link></section>
    <section><h2>More worlds on the horizon.</h2><p><em>The Last Lightkeeper</em> is an original coastal-fantasy preview. It is coming soon and cannot be played yet.</p></section>
    <Link href="/" className="book-secondary">Explore the library <Icon name="arrow" size={16} /></Link><footer className="book-footer">A little moonlight. A different story.</footer>
  </main></div>;
}
