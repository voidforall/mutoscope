import { edgeLabelFits, edgeSegment, lerp, type EntityState, type Rect } from "../../core";
import type { Entity } from "../../schema";

type EdgeEntity = Extract<Entity, { type: "edge" }>;

interface EdgeProps {
  readonly entity: EdgeEntity;
  readonly state: EntityState;
  readonly from?: { box: Rect | null; opacity: number };
  readonly to?: { box: Rect | null; opacity: number };
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}

const LABEL_W = 260;
const LABEL_H = 40;

export function EdgeView({ entity, state, from, to, selected, onSelect }: EdgeProps) {
  if (!from?.box || !to?.box) return null;
  const opacity = state.opacity * Math.min(from.opacity, to.opacity) * (1 - 0.62 * state.dim);
  if (opacity < 0.01 || state.draw <= 0) return null;
  const { a, b } = edgeSegment(from.box, to.box, 8);
  const end = { x: lerp(a.x, b.x, state.draw), y: lerp(a.y, b.y, state.draw) };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const showArrow = state.draw > 0.08;
  const showLabel = entity.label !== undefined && state.draw > 0.55 && edgeLabelFits(entity.label, Math.hypot(b.x - a.x, b.y - a.y));
  const select = () => onSelect(entity.id);
  return (
    <g
      className={`edge tone-${entity.tone}${selected ? " is-selected" : ""}`}
      style={{ opacity, ["--hl" as string]: String(state.highlight) }}
      data-entity={entity.id}
      onClick={(e) => {
        e.stopPropagation();
        select();
      }}
    >
      <line className="edge-hit" x1={a.x} y1={a.y} x2={end.x} y2={end.y} />
      <line
        className={`edge-line${entity.style === "dashed" ? " is-dashed" : ""}`}
        x1={a.x}
        y1={a.y}
        x2={end.x}
        y2={end.y}
        markerEnd={showArrow && entity.arrow !== "none" ? `url(#arrow-${entity.tone})` : undefined}
        markerStart={showArrow && entity.arrow === "both" ? `url(#arrow-${entity.tone})` : undefined}
      />
      {showLabel && (
        <foreignObject x={mid.x - LABEL_W / 2} y={mid.y - LABEL_H / 2} width={LABEL_W} height={LABEL_H} className="edge-label-fo">
          <div className="edge-label-wrap">
            <span className="edge-label" style={{ opacity: Math.min(1, (state.draw - 0.55) / 0.3) }}>
              {entity.label}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export function ArrowDefs({ tones }: { tones: readonly string[] }) {
  return (
    <defs>
      {tones.map((t) => (
        <marker
          key={t}
          id={`arrow-${t}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          markerUnits="strokeWidth"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className={`arrow-head tone-${t}`} />
        </marker>
      ))}
      <pattern id="stage-dots" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1.5" className="stage-dot" />
      </pattern>
    </defs>
  );
}
