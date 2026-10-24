import Link from "next/link";
import type { Snapshot } from "@/lib/story-engine/contracts";
import { Icon } from "./icon";

export function ReaderFinale({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.run.status !== "ended" || !snapshot.nodes.some(node => node.chapter?.is_ending)) return null;
  const artworkSaved = snapshot.panels.length === snapshot.run.limits.max_steps * 2
    && snapshot.panels.every(panel => panel.status === "complete" && panel.image_path);
  return <section className="book-ending" aria-label="Your story ending" data-artwork={artworkSaved ? "complete" : "unfinished"}>
    <div className="book-ending-mark" aria-hidden="true"><span /><Icon name="moon" size={26} /><span /></div>
    <p className="book-eyebrow">THE END · NEON PROTOCOL</p>
    <h2>A story only you could tell.</h2>
    <p>You chose the way through New Kyoto.<br />Here are the choices that made this story yours.</p>
    <ol className="book-choice-recap" aria-label="Your choices">
      {snapshot.nodes.filter(node => node.chapter).map(node => <li key={node.id}>
        <span className="book-recap-number" aria-hidden="true">0{node.step}</span>
        <div><h3>{node.choice}</h3>{node.instruction ? <p className="book-recap-twist">{node.instruction}</p> : <p className="book-recap-no-twist">No extra twist.</p>}</div>
      </li>)}
    </ol>
    <p className="book-ending-saved" role="status">{artworkSaved ? "Your complete story is saved on this device." : "Your ending is written and saved. Some illustrations are still unfinished."}</p>
    <div className="book-ending-actions"><Link href="/" className="book-primary">Read another story<Icon name="arrow" size={16} /></Link><div><Link href="/saved" className="book-secondary">Saved stories</Link><Link href="/story/neon-protocol" className="book-secondary">Begin a new run</Link></div></div>
    <p className="book-ending-note">Come back through Saved stories whenever you like.</p>
  </section>;
}
