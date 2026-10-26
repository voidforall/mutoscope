import type { CSSProperties } from "react";
import { listScale, partProgress } from "../../../core";
import type { ListEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

type Mark = "check" | "cross" | "dot" | "none" | "number";

function Marker({ mark, n }: { readonly mark: Mark; readonly n: number }) {
  if (mark === "none") return <span className="list-marker is-none" />;
  if (mark === "number") return <span className="list-marker is-number">{n}</span>;
  if (mark === "dot") return <span className="list-marker is-dot" />;
  return (
    <span className={`list-marker is-${mark}`}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d={mark === "check" ? "M5 10.5l3.2 3.2L15 7" : "M6 6l8 8M14 6l-8 8"} />
      </svg>
    </span>
  );
}

const defaultMark = (style: ListEntity["style"]): Mark => (style === "numbered" ? "number" : style === "checks" ? "check" : "dot");

/** Steps, key points, pros and cons, building in one item at a time. */
export function ListNode(props: NodeProps & { readonly entity: ListEntity }) {
  const { entity, box, state } = props;
  const scale = listScale(entity, box);
  return (
    <NodeFrame {...props}>
      <div className="list" style={{ ["--s" as string]: scale.toFixed(3) } as CSSProperties}>
        {entity.title && <span className="list-title">{entity.title}</span>}
        <ol className="list-items">
          {entity.items.map((it, i) => {
            const p = partProgress(state.reveal, i, entity.items.length);
            const mark = it.mark ?? defaultMark(entity.style);
            const tone = it.tone ?? (mark === "check" ? "added" : mark === "cross" ? "removed" : entity.tone);
            return (
              <li key={i} className={`list-item tone-${tone}`} style={{ opacity: p, transform: `translateX(${((1 - p) * -14).toFixed(2)}px)` }}>
                <Marker mark={mark} n={i + 1} />
                <span className="list-body">
                  <span className="list-text">{it.text}</span>
                  {it.detail && <span className="list-detail">{it.detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </NodeFrame>
  );
}
