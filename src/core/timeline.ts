import type { Action, Entity, Scene } from "../schema";
import { clamp01, easeInOutCubic } from "./easing";
import { FULL_STAGE, cameraFor, gridToRect, lerp, lerpRect, unionRects, type Rect } from "./geometry";

/** Visual state of one entity at an instant. Every value is a pure function of (scene, t). */
export interface EntityState {
  readonly opacity: number;
  readonly highlight: number;
  readonly dim: number;
  /** Edge draw progress, 0..1. Always 1 for non-edges. */
  readonly draw: number;
  /** Stage-space box; null for edges (derived from endpoints) and empty groups. */
  readonly box: Rect | null;
}

export interface SceneState {
  readonly entities: Readonly<Record<string, EntityState>>;
  readonly camera: Rect;
}

type States = Readonly<Record<string, EntityState>>;

export const DEFAULT_DURATION_MS: Readonly<Record<Action["action"], number>> = {
  appear: 500,
  disappear: 400,
  highlight: 400,
  dim: 400,
  restore: 400,
  connect: 700,
  disconnect: 400,
  move: 800,
  replace: 700,
  focus: 900,
};

/** Groups wrap children with room for their label along the top edge. */
export const GROUP_PADDING = { x: 22, top: 40, bottom: 22 } as const;

const ENTERING_ACTIONS = new Set<Action["action"]>(["appear", "connect"]);

/** An entity starts hidden when the first action touching its visibility brings it in. */
function startsHidden(entity: Entity, timeline: readonly Action[]): boolean {
  const first = timeline.find(
    (a) =>
      ("target" in a && a.target === entity.id && ["appear", "disappear", "connect", "disconnect"].includes(a.action)) ||
      (a.action === "replace" && a.with === entity.id),
  );
  if (!first) return false;
  return ENTERING_ACTIONS.has(first.action) || (first.action === "replace" && first.with === entity.id);
}

function initialStates(scene: Scene, timeline: readonly Action[]): States {
  return Object.fromEntries(
    scene.entities.map((e) => {
      const hidden = startsHidden(e, timeline);
      const state: EntityState = {
        opacity: hidden ? 0 : 1,
        highlight: 0,
        dim: 0,
        draw: e.type === "edge" && hidden ? 0 : 1,
        box: "layout" in e ? gridToRect(e.layout) : null,
      };
      return [e.id, state];
    }),
  );
}

/** Group boxes wrap their children's current boxes. */
function withGroupBoxes(scene: Scene, states: States): States {
  const groups = scene.entities.filter((e) => e.type === "group");
  if (groups.length === 0) return states;
  const next = { ...states };
  for (const g of groups) {
    const boxes = g.children.map((id) => next[id]?.box).filter((b): b is Rect => b != null);
    const union = unionRects(boxes);
    const prev = next[g.id];
    const box = union && {
      x: union.x - GROUP_PADDING.x,
      y: union.y - GROUP_PADDING.top,
      w: union.w + 2 * GROUP_PADDING.x,
      h: union.h + GROUP_PADDING.top + GROUP_PADDING.bottom,
    };
    if (prev) next[g.id] = { ...prev, box: box ?? null };
  }
  return next;
}

/** The region a focus action frames: the entity box, or an edge's endpoints. */
export function focusRegion(scene: Scene, states: States, targetId: string): Rect | null {
  const entity = scene.entities.find((e) => e.id === targetId);
  if (!entity) return null;
  if (entity.type === "edge") {
    const ends = [states[entity.from]?.box, states[entity.to]?.box].filter((b): b is Rect => b != null);
    return unionRects(ends);
  }
  return states[targetId]?.box ?? null;
}

const update = (states: States, id: string, patch: (s: EntityState) => Partial<EntityState>): States => {
  const prev = states[id];
  return prev ? { ...states, [id]: { ...prev, ...patch(prev) } } : states;
};

interface Frame {
  readonly entities: States;
  readonly camera: Rect;
}

function applyAction(scene: Scene, frame: Frame, action: Action, p: number): Frame {
  const { entities } = frame;
  if (action.action === "focus") {
    const region = action.target ? focusRegion(scene, withGroupBoxes(scene, entities), action.target) : null;
    const target = region ? cameraFor(region) : FULL_STAGE;
    return { ...frame, camera: lerpRect(frame.camera, target, p) };
  }
  const id = action.target;
  switch (action.action) {
    case "appear":
      return { ...frame, entities: update(entities, id, (s) => ({ opacity: lerp(s.opacity, 1, p) })) };
    case "disappear":
      return { ...frame, entities: update(entities, id, (s) => ({ opacity: lerp(s.opacity, 0, p) })) };
    case "connect":
      return {
        ...frame,
        entities: update(entities, id, (s) => ({
          opacity: lerp(s.opacity, 1, Math.min(1, p * 3)),
          draw: lerp(s.draw, 1, p),
        })),
      };
    case "disconnect":
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ draw: lerp(s.draw, 0, p), opacity: lerp(s.opacity, 0, p) })),
      };
    case "highlight":
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ highlight: lerp(s.highlight, 1, p), dim: lerp(s.dim, 0, p) })),
      };
    case "dim":
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ dim: lerp(s.dim, 1, p), highlight: lerp(s.highlight, 0, p) })),
      };
    case "restore":
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ dim: lerp(s.dim, 0, p), highlight: lerp(s.highlight, 0, p) })),
      };
    case "move": {
      const to = gridToRect(action.to);
      return { ...frame, entities: update(entities, id, (s) => ({ box: s.box ? lerpRect(s.box, to, p) : to })) };
    }
    case "replace": {
      const place = entities[id]?.box ?? null;
      const outgoing = update(entities, id, (s) => ({ opacity: lerp(s.opacity, 0, p) }));
      const incoming = update(outgoing, action.with, (s) => ({
        opacity: lerp(s.opacity, 1, p),
        box: place ?? s.box,
      }));
      return { ...frame, entities: incoming };
    }
  }
}

/** Actions in playback order (stable for equal timestamps). */
export function orderedTimeline(scene: Scene): readonly Action[] {
  return scene.timeline
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.atMs - y.a.atMs || x.i - y.i)
    .map(({ a }) => a);
}

export function actionProgress(action: Action, tMs: number): number {
  const duration = action.durationMs ?? DEFAULT_DURATION_MS[action.action];
  if (duration === 0) return tMs >= action.atMs ? 1 : 0;
  return easeInOutCubic(clamp01((tMs - action.atMs) / duration));
}

/** Deterministic scene state at `tMs`: seeking and playing always agree. */
export function sceneStateAt(scene: Scene, tMs: number): SceneState {
  const timeline = orderedTimeline(scene);
  const start: Frame = { entities: initialStates(scene, timeline), camera: FULL_STAGE };
  const end = timeline
    .filter((a) => a.atMs <= tMs)
    .reduce((frame, action) => applyAction(scene, frame, action, actionProgress(action, tMs)), start);
  return { entities: withGroupBoxes(scene, end.entities), camera: end.camera };
}

/** The caption visible at `tMs`. */
export function captionAt(scene: Scene, tMs: number): string {
  const active = [...scene.cues].filter((c) => c.atMs <= tMs).sort((a, b) => a.atMs - b.atMs).at(-1);
  return active?.text ?? (scene.cues.length === 0 ? scene.narration : "");
}
