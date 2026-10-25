import Link from "next/link";
import type { Snapshot } from "@/lib/story-engine/contracts";
import { Icon } from "./icon";

export function ReaderFinale({ snapshot, visuallyComplete = false }: { snapshot: Snapshot; visuallyComplete?: boolean }) {
  if (!visuallyComplete || snapshot.run.status !== "ended" || !snapshot.nodes.some(node => node.chapter?.is_ending)) return null;
  const artworkSaved = snapshot.panels.length === snapshot.run.limits.max_steps * 2
    && snapshot.panels.every(panel => panel.status === "complete" && panel.image_path);
  if (!artworkSaved) return null;
  const template = snapshot.bible.template;
  return <section className="book-ending" aria-label="Your story ending" data-artwork="complete">
    <div className="book-ending-mark" aria-hidden="true"><span /><Icon name="moon" size={26} /><span /></div>
    <p className="book-eyebrow">THE END · {template?.title.toUpperCase() ?? "NEON PROTOCOL"}</p>
    <h2>A story only you could tell.</h2>
    <p>{template ? "You chose the way through this world." : "You chose the way through New Kyoto."}<br />Here are the choices that made this story yours.</p>
    <ol className="book-choice-recap" aria-label="Your choices">
      {snapshot.nodes.filter(node => node.chapter).map(node => <li key={node.id}>
        <span className="book-recap-number" aria-hidden="true">0{node.step}</span>
        <div><h3>{node.choice}</h3>{node.instruction ? <p className="book-recap-twist">{node.instruction}</p> : <p className="book-recap-no-twist">No extra twist.</p>}</div>
      </li>)}
    </ol>
    <p className="book-ending-saved" role="status">Your complete story is saved on this device.</p>
    <div className="book-ending-actions"><Link href="/" className="book-primary">Read another story<Icon name="arrow" size={16} /></Link><div><Link href="/saved" className="book-secondary">Saved stories</Link><Link href={`/story/${template?.id ?? "neon-protocol"}`} className="book-secondary">Begin a new run</Link><a href={`/api/runs/${snapshot.run.id}/export`} download className="book-secondary">Download story</a></div></div>
    <p className="book-ending-note">Download a portable copy with your illustrations, dialogue and choices. No public link is created.</p>
  </section>;
}
