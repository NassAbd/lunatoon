import type { ComicPanel } from "@/lib/contracts";
import { Icon } from "./icon";
import { layoutDialogue } from "@/lib/dialogue-layout";

export function ComicPanelCard({ panel }: { panel: ComicPanel }) {
  return <article className="generated-panel" aria-label={`Continuation panel ${panel.sequence_index}`}>
    <div className={`panel-canvas aspect-${panel.layout_aspect}`}>
      {panel.image_url
        // Data URLs are transient results from the local API; Next image optimization adds no value.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="generated-image" src={panel.image_url} alt={panel.visual_description} />
        : <div className="image-placeholder">
          <span className="placeholder-mark"><Icon name={panel.error ? "break" : "spark"} size={28} /></span>
          <p>{panel.error ? "Illustration interrupted" : "Developing the scene"}</p>
          <span>{panel.error ? "Your dialogue is still here." : "The words are ready. The world is on its way."}</span>
        </div>}
      {layoutDialogue(panel.dialogues).map((bubble) => <div key={bubble.id} className={`speech-bubble bubble-${bubble.position} bubble-${bubble.style}`}>
        <span className="bubble-speaker">{bubble.character}</span><p>{bubble.text}</p>
      </div>)}
      <span className="panel-number">{String(panel.sequence_index).padStart(2, "0")}</span>
    </div>
    <div className="panel-caption"><p>{panel.visual_description}</p><span className={panel.error ? "failed-label" : ""}>{panel.error ? "Image failed" : panel.image_url ? "Illustrated" : "Rendering"}</span></div>
    {panel.error && <p className="panel-error" role="alert">{panel.error}</p>}
  </article>;
}
