import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { statText, type EntityState, type Rect } from "../../core";
import type { Asset, BoxedEntity, Entity } from "../../schema";
import { emphasisStyle } from "./emphasis";

export interface NodeProps {
  readonly entity: BoxedEntity;
  readonly state: EntityState;
  readonly box: Rect;
  readonly selected: boolean;
  readonly threadCount: number;
  readonly onSelect: (id: string) => void;
  readonly assets: Readonly<Record<string, Asset>>;
}

/** Bleed around each node so selection rings and thread badges are not clipped by the foreignObject. */
const BLEED = 16;

export function NodeFrame({ entity, state, box, selected, threadCount, onSelect, children }: NodeProps & { children: ReactNode }) {
  const select = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    onSelect(entity.id);
  };
  return (
    <foreignObject
      x={box.x - BLEED}
      y={box.y - BLEED}
      width={box.w + 2 * BLEED}
      height={box.h + 2 * BLEED}
      style={{ ...emphasisStyle(state, selected), ["--bleed" as string]: `${BLEED}px` }}
    >
      <div
        className={`node node-${entity.type} tone-${entity.tone}${selected ? " is-selected" : ""}`}
        data-entity={entity.id}
        role="button"
        tabIndex={state.opacity < 0.2 ? -1 : 0}
        aria-label={`Inspect ${accessibleName(entity)}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(e)}
      >
        {children}
        {threadCount > 0 && (
          <span className="thread-dot" title={`${threadCount} discussion${threadCount > 1 ? "s" : ""}`}>
            {threadCount}
          </span>
        )}
      </div>
    </foreignObject>
  );
}

export function accessibleName(e: Entity): string {
  switch (e.type) {
    case "label":
    case "quote":
    case "headline":
      return e.text.slice(0, 60);
    case "stat":
      return `${statText(e, 1)} ${e.label}`;
    case "image":
      return e.alt.slice(0, 60);
    case "chart":
    case "time-axis":
    case "table":
    case "list":
      return e.title ?? `${{ chart: "Chart", table: "Table", "time-axis": "Timeline", list: "List" }[e.type]}: ${e.id}`;
    default:
      return ("label" in e && e.label) || e.id;
  }
}
