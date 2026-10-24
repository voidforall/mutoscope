import { useMemo } from "react";
import { STAGE, sceneStateAt } from "../../core";
import type { BoxedEntity, Scene, Tone } from "../../schema";
import { ArrowDefs, EdgeView } from "./Edge";
import { GroupView } from "./Group";
import { EntityNode } from "./Nodes";

const TONES: readonly Tone[] = ["neutral", "accent", "added", "removed", "warning", "muted"];

interface StageProps {
  readonly scene: Scene;
  readonly tMs: number;
  readonly selectedId?: string;
  readonly threadCounts: ReadonlyMap<string, number>;
  readonly onSelect: (id?: string) => void;
}

export function Stage({ scene, tMs, selectedId, threadCounts, onSelect }: StageProps) {
  const state = useMemo(() => sceneStateAt(scene, tMs), [scene, tMs]);
  const { camera } = state;
  const at = (id: string) => state.entities[id];
  const groups = scene.entities.filter((e) => e.type === "group");
  const edges = scene.entities.filter((e) => e.type === "edge");
  const boxed = scene.entities.filter((e): e is BoxedEntity => "layout" in e);

  return (
    <svg
      className="stage-svg"
      viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Scene: ${scene.title}`}
      onClick={() => onSelect(undefined)}
    >
      <ArrowDefs tones={TONES} />
      <rect className="stage-bg" x={0} y={0} width={STAGE.width} height={STAGE.height} />
      <rect x={0} y={0} width={STAGE.width} height={STAGE.height} fill="url(#stage-dots)" className="stage-grid" />
      {groups.map((g) => {
        const s = at(g.id);
        return s && <GroupView key={g.id} entity={g} state={s} selected={selectedId === g.id} onSelect={onSelect} />;
      })}
      {edges.map((e) => {
        const s = at(e.id);
        return (
          s && (
            <EdgeView
              key={e.id}
              entity={e}
              state={s}
              from={at(e.from)}
              to={at(e.to)}
              selected={selectedId === e.id}
              onSelect={onSelect}
            />
          )
        );
      })}
      {boxed.map((e) => {
        const s = at(e.id);
        if (!s?.box || s.opacity < 0.01) return null;
        return (
          <EntityNode
            key={e.id}
            entity={e}
            state={s}
            box={s.box}
            selected={selectedId === e.id}
            threadCount={threadCounts.get(e.id) ?? 0}
            onSelect={onSelect}
          />
        );
      })}
    </svg>
  );
}
