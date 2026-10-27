import { useMemo } from "react";
import { STAGE, edgeEnds, gridToRect, sceneListScale, sceneStatFont, sceneStateAt } from "../../core";
import type { Asset, BoxedEntity, ReelStyle, Scene, Tone } from "../../schema";
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
  readonly assets: Readonly<Record<string, Asset>>;
  readonly reelStyle: ReelStyle;
}

export function Stage({ scene, tMs, selectedId, threadCounts, onSelect, assets, reelStyle }: StageProps) {
  const state = useMemo(() => sceneStateAt(scene, tMs, assets), [scene, tMs, assets]);
  const { camera } = state;
  const at = (id: string) => state.entities[id];
  const groups = scene.entities.filter((e) => e.type === "group");
  const edges = scene.entities.filter((e) => e.type === "edge");
  const boxed = scene.entities.filter((e): e is BoxedEntity => "layout" in e);
  const listScale = useMemo(() => sceneListScale(scene.entities, (e) => gridToRect(e.layout)), [scene]);
  const statFont = useMemo(() => sceneStatFont(scene.entities, (e) => gridToRect(e.layout)), [scene]);

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
      <Backdrop kind={scene.backdrop} />
      {groups.map((g) => {
        const s = at(g.id);
        return s && <GroupView key={g.id} entity={g} state={s} selected={selectedId === g.id} onSelect={onSelect} />;
      })}
      {edges.map((e) => {
        const s = at(e.id);
        const ends = edgeEnds(scene, state.entities, e.id);
        return (
          s && (
            <EdgeView
              key={e.id}
              entity={e}
              state={s}
              from={ends.from}
              to={ends.to}
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
            assets={assets}
            reelStyle={reelStyle}
            listScale={listScale}
            statFont={statFont}
          />
        );
      })}
    </svg>
  );
}

/** The surface behind a scene: a dot grid by default, or plain, graph paper, or a soft spotlight. */
function Backdrop({ kind }: { readonly kind: Scene["backdrop"] }) {
  const full = { x: 0, y: 0, width: STAGE.width, height: STAGE.height };
  switch (kind) {
    case "plain":
      return null;
    case "grid":
      return <rect {...full} fill="url(#stage-lines)" className="stage-grid" />;
    case "spotlight":
      return <rect {...full} fill="url(#stage-spotlight)" className="stage-spotlight" />;
    default:
      return <rect {...full} fill="url(#stage-dots)" className="stage-grid" />;
  }
}
