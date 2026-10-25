import Link from "next/link";
import { StoryHeader } from "@/components/story-book";
import { Icon } from "@/components/icon";
import { BUNDLED_STORIES, PREVIEW_STORIES } from "@/lib/story-templates/catalog";
export default function AboutPage() {
  const stories = BUNDLED_STORIES.filter(entry => entry.template.status === "ready");
  return <div className="story-reader library-page"><StoryHeader active="about" /><main className="about-main">
    <div className="about-mark"><Icon name="moon" size={34} /></div><p className="book-eyebrow">A LITTLE MOONLIGHT. A DIFFERENT STORY.</p><h1>Some stories<br />need your imagination.</h1>
    <p>Lunatoon is a small experiment in interactive webtoons. Read the opening, make a choice, and add a twist of your own. AI helps turn your decisions into dialogue and illustrations.</p>
    <section><h2>Different worlds. Your way through them.</h2><p>{stories.length} original worlds are playable: {stories.map((story, index) => <span key={story.template.id}>{index > 0 ? index === stories.length - 1 ? " and " : ", " : ""}<em>{story.template.title}</em></span>)}. Each offers two decisions, four new illustrated panels, and a personal ending. Words arrive first; artwork follows as each illustration finishes. Character details and story outcomes can vary.</p><Link href="/#stories">Find your next story <span aria-hidden="true">↗</span></Link></section>
    <section><h2>A place to come back to.</h2><p>Your story stays on this local installation, including its dialogue, choices and illustrations. Saved stories open without generating them again. This demo has no accounts, cloud sync or public sharing.</p><Link href="/saved">Visit your saved stories <span aria-hidden="true">↗</span></Link></section>
    <section><h2>More worlds on the horizon.</h2><p>The library also includes {PREVIEW_STORIES.length} original story previews, each clearly labeled Coming soon. They cannot be played yet.</p></section>
    <Link href="/" className="book-secondary">Explore the library <Icon name="arrow" size={16} /></Link><footer className="book-footer">A little moonlight. A different story.</footer>
  </main></div>;
}
