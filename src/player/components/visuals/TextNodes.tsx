import { headlineFont, revealWords, statText, typewriterCount } from "../../../core";
import type { HeadlineEntity, Reveal, StatEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

/**
 * Text that builds in. Every character is always laid out (hidden ones are
 * transparent), so the text never reflows while it reveals and the box
 * sizes computed by validate hold for every frame.
 */
export function RevealText({ text, mode, reveal }: { readonly text: string; readonly mode: Reveal; readonly reveal: number }) {
  if (mode === "fade" || reveal >= 1) return <>{text}</>;
  if (mode === "typewriter") {
    const chars = [...text];
    const shown = typewriterCount(text, reveal);
    return (
      <>
        {chars.slice(0, shown).join("")}
        <span className="type-caret" aria-hidden="true" />
        <span className="is-unrevealed" aria-hidden="true">{chars.slice(shown).join("")}</span>
      </>
    );
  }
  return (
    <>
      {revealWords(text, reveal).map((w, i) =>
        /\S/.test(w.text) ? (
          <span key={i} className="reveal-word" style={{ opacity: w.p, transform: `translateY(${((1 - w.p) * 0.28).toFixed(3)}em)` }}>
            {w.text}
          </span>
        ) : (
          w.text
        ),
      )}
    </>
  );
}

type Props<E> = NodeProps & { readonly entity: E };

export function HeadlineNode(props: Props<HeadlineEntity>) {
  const { entity, box, state } = props;
  return (
    <NodeFrame {...props}>
      <div className={`headline align-${entity.align}`}>
        {entity.eyebrow && <span className="headline-eyebrow">{entity.eyebrow}</span>}
        <span className="headline-text" style={{ fontSize: headlineFont(entity, box, props.reelStyle) }}>
          <RevealText text={entity.text} mode={entity.reveal} reveal={state.reveal} />
        </span>
      </div>
    </NodeFrame>
  );
}

export function StatNode(props: Props<StatEntity>) {
  const { entity, box, state } = props;
  return (
    <NodeFrame {...props}>
      <span className="stat-value" style={{ fontSize: props.statFont }}>
        {statText(entity, state.reveal)}
      </span>
      <span className="stat-label">{entity.label}</span>
      {entity.note && <span className="stat-note">{entity.note}</span>}
    </NodeFrame>
  );
}
