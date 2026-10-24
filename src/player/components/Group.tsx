import type { EntityState } from "../../core";
import type { Entity } from "../../schema";

type GroupEntity = Extract<Entity, { type: "group" }>;

export function GroupView({ entity, state, selected, onSelect }: {
  readonly entity: GroupEntity;
  readonly state: EntityState;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const box = state.box;
  if (!box || state.opacity < 0.01) return null;
  return (
    <g
      className={`group tone-${entity.tone}${selected ? " is-selected" : ""}`}
      style={{ opacity: state.opacity * (1 - 0.62 * state.dim), ["--hl" as string]: String(state.highlight) }}
      data-entity={entity.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entity.id);
      }}
    >
      <rect className="group-frame" x={box.x} y={box.y} width={box.w} height={box.h} rx={18} />
      {entity.label && (
        <text className="group-label" x={box.x + 18} y={box.y + 26}>
          {entity.label}
        </text>
      )}
    </g>
  );
}
