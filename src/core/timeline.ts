import type { Action, Asset, Entity, Scene } from "../schema";
import { buildDurationMs, buildsIn } from "./build";
import { clamp01, easeInOutCubic } from "./easing";
import { FULL_STAGE, cameraFor, gridToRect, lerp, lerpRect, unionRects, type Rect } from "./geometry";
import type { PartEmphasis } from "./parts";
import { calloutPoint, imageRect } from "./visual-fit";

/** Visual state of one entity at an instant. Every value is a pure function of (scene, t). */
export interface EntityState {
  readonly opacity: number;
  readonly highlight: number;
  readonly dim: number;
  /** Edge draw progress, 0..1. Always 1 for non-edges. */
  readonly draw: number;
  /** Build progress of an entity with parts (see build.ts), 0..1. Always 1 for everything else. */
  readonly reveal: number;
  /** For an entity built one `appear item` at a time: how many parts are shown (fractional while one fades in). Null otherwise. */
  readonly steps: number | null;
  /** Per-part emphasis set by highlight/dim/restore with an `item`. */
  readonly items: Readonly<Record<number, PartEmphasis>>;
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

/** Entities whose parts are revealed by `appear` actions that name an item. */
const isStepped = (e: Entity, timeline: readonly Action[]) => timeline.some((a) => a.action === "appear" && a.target === e.id && a.item !== undefined);

const NO_ITEMS: Readonly<Record<number, PartEmphasis>> = {};

function initialStates(scene: Scene, timeline: readonly Action[]): States {
  return Object.fromEntries(
    scene.entities.map((e) => {
      const hidden = startsHidden(e, timeline);
      const stepped = isStepped(e, timeline);
      const state: EntityState = {
        opacity: hidden ? 0 : 1,
        highlight: 0,
        dim: 0,
        draw: e.type === "edge" && hidden ? 0 : 1,
        reveal: hidden && buildsIn(e) ? 0 : 1,
        steps: stepped ? 0 : null,
        items: NO_ITEMS,
        box: "layout" in e ? gridToRect(e.layout) : null,
      };
      return [e.id, state];
    }),
  );
}

const VISIBLE_OPACITY = 0.01;
const VISIBILITY_ACTIONS = new Set<Action["action"]>(["appear", "disappear"]);

/**
 * Group boxes wrap their children's current boxes. A group with no
 * appear/disappear of its own follows its children (like edges follow their
 * endpoints), so its frame never shows empty.
 */
function withGroupBoxes(scene: Scene, states: States): States {
  const groups = scene.entities.filter((e) => e.type === "group");
  if (groups.length === 0) return states;
  const next = { ...states };
  for (const g of groups) {
    // Only children on stage count: a hidden or replaced child must not hold the frame open.
    const boxes = g.children
      .map((id) => next[id])
      .filter((c): c is EntityState => c !== undefined && c.box !== null && c.opacity > VISIBLE_OPACITY)
      .map((c) => c.box as Rect);
    const union = unionRects(boxes);
    const prev = next[g.id];
    const box = union && {
      x: union.x - GROUP_PADDING.x,
      y: union.y - GROUP_PADDING.top,
      w: union.w + 2 * GROUP_PADDING.x,
      h: union.h + GROUP_PADDING.top + GROUP_PADDING.bottom,
    };
    const ownVisibility = scene.timeline.some((a) => "target" in a && a.target === g.id && VISIBILITY_ACTIONS.has(a.action));
    const opacity = ownVisibility ? prev?.opacity : Math.max(0, ...g.children.map((id) => next[id]?.opacity ?? 0));
    if (prev) next[g.id] = { ...prev, box: box ?? null, opacity: opacity ?? prev.opacity };
  }
  return next;
}

/**
 * The state an edge end attaches to. `replace` means "this becomes that", so
 * an edge to a replaced box carries over to whatever replaced it: the end is
 * the most visible entity in the replacement chain.
 */
function endpointState(scene: Scene, states: States, id: string): EntityState | undefined {
  const chain = [id];
  for (let i = 0; i < chain.length; i++) {
    for (const a of scene.timeline) {
      if (a.action === "replace" && a.target === chain[i] && !chain.includes(a.with)) chain.push(a.with);
    }
  }
  return chain
    .map((c) => states[c])
    .filter((s): s is EntityState => s !== undefined && s.box !== null)
    .reduce<EntityState | undefined>((best, s) => (!best || s.opacity > best.opacity ? s : best), undefined);
}

export function edgeEnds(scene: Scene, states: States, edgeId: string): { from?: EntityState; to?: EntityState } {
  const edge = scene.entities.find((e) => e.id === edgeId);
  if (!edge || edge.type !== "edge") return {};
  return { from: endpointState(scene, states, edge.from), to: endpointState(scene, states, edge.to) };
}

/** The region a focus action frames: the entity box, or an edge's endpoints. */
export function focusRegion(scene: Scene, states: States, targetId: string): Rect | null {
  const entity = scene.entities.find((e) => e.id === targetId);
  if (!entity) return null;
  if (entity.type === "edge") {
    const { from, to } = edgeEnds(scene, states, entity.id);
    const ends = [from?.box, to?.box].filter((b): b is Rect => b != null);
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

/** A build fades its frame in this fast, however long its parts take to arrive. */
const BUILD_FADE_MS = 400;

const setItem = (s: EntityState, item: number, to: (e: PartEmphasis) => PartEmphasis): Readonly<Record<number, PartEmphasis>> => ({
  ...s.items,
  [item]: to(s.items[item] ?? { highlight: 0, dim: 0 }),
});

type Assets = Readonly<Record<string, Asset>>;
type FocusAction = Extract<Action, { action: "focus" }>;

/** Zoom limit when framing part of an entity: close enough to read a screenshot's detail. */
const PART_ZOOM = 4;
/** A point callout is framed as a square this share of the image's width. */
const POINT_SPAN = 0.18;

/** The stage rect a regional focus frames, or null for a whole-entity focus. */
function focusPart(scene: Scene, base: Rect, action: FocusAction, assets: Assets): Rect | null {
  if (action.region) {
    const r = action.region;
    return { x: base.x + r.x * base.w, y: base.y + r.y * base.h, w: r.w * base.w, h: r.h * base.h };
  }
  if (action.callout === undefined) return null;
  const entity = scene.entities.find((e) => e.id === action.target);
  const callout = entity?.type === "image" ? entity.callouts[action.callout] : undefined;
  const asset = entity?.type === "image" ? assets[entity.src] : undefined;
  if (!entity || entity.type !== "image" || !callout || !asset) return null;
  const geo = imageRect(entity, asset, base);
  const pt = calloutPoint(callout, geo);
  const side = POINT_SPAN * geo.view.w;
  const local = pt.region ?? { x: pt.x - side / 2, y: pt.y - side / 2, w: side, h: side };
  return { x: base.x + local.x, y: base.y + local.y, w: local.w, h: local.h };
}

function applyAction(scene: Scene, frame: Frame, action: Action, p: number, linear: number, durationMs: number, assets: Assets): Frame {
  const { entities } = frame;
  if (action.action === "focus") {
    const region = action.target ? focusRegion(scene, withGroupBoxes(scene, entities), action.target) : null;
    const part = region ? focusPart(scene, region, action, assets) : null;
    const target = part ? cameraFor(part, 32, PART_ZOOM) : region ? cameraFor(region) : FULL_STAGE;
    return { ...frame, camera: lerpRect(frame.camera, target, p) };
  }
  const id = action.target;
  switch (action.action) {
    case "appear": {
      const entity = scene.entities.find((e) => e.id === id);
      const fade = durationMs === 0 ? 1 : clamp01((linear * durationMs) / BUILD_FADE_MS);
      if (action.item !== undefined) {
        const item = action.item;
        return {
          ...frame,
          entities: update(entities, id, (s) => {
            const from = s.steps ?? 0;
            return { opacity: lerp(s.opacity, 1, fade), steps: lerp(from, Math.max(from, item + 1), p), reveal: 1 };
          }),
        };
      }
      if (entity && buildsIn(entity)) {
        return { ...frame, entities: update(entities, id, (s) => ({ opacity: lerp(s.opacity, 1, fade), reveal: lerp(s.reveal, 1, linear) })) };
      }
      return { ...frame, entities: update(entities, id, (s) => ({ opacity: lerp(s.opacity, 1, p) })) };
    }
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
      if (action.item !== undefined) {
        const item = action.item;
        return { ...frame, entities: update(entities, id, (s) => ({ items: setItem(s, item, (e) => ({ highlight: lerp(e.highlight, 1, p), dim: lerp(e.dim, 0, p) })) })) };
      }
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ highlight: lerp(s.highlight, 1, p), dim: lerp(s.dim, 0, p) })),
      };
    case "dim":
      if (action.item !== undefined) {
        const item = action.item;
        return { ...frame, entities: update(entities, id, (s) => ({ items: setItem(s, item, (e) => ({ dim: lerp(e.dim, 1, p), highlight: lerp(e.highlight, 0, p) })) })) };
      }
      return {
        ...frame,
        entities: update(entities, id, (s) => ({ dim: lerp(s.dim, 1, p), highlight: lerp(s.highlight, 0, p) })),
      };
    case "restore": {
      const back = (e: PartEmphasis): PartEmphasis => ({ highlight: lerp(e.highlight, 0, p), dim: lerp(e.dim, 0, p) });
      if (action.item !== undefined) {
        const item = action.item;
        return { ...frame, entities: update(entities, id, (s) => ({ items: setItem(s, item, back) })) };
      }
      // Restoring the whole entity also clears every part's emphasis.
      return {
        ...frame,
        entities: update(entities, id, (s) => ({
          dim: lerp(s.dim, 0, p),
          highlight: lerp(s.highlight, 0, p),
          items: Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, back(v)])),
        })),
      };
    }
    case "move": {
      const to = gridToRect(action.to);
      return { ...frame, entities: update(entities, id, (s) => ({ box: s.box ? lerpRect(s.box, to, p) : to })) };
    }
    case "replace": {
      const place = entities[id]?.box ?? null;
      const outgoing = update(entities, id, (s) => ({ opacity: lerp(s.opacity, 0, p) }));
      // What replaces something arrives complete: its parts (callouts, items) are not left unbuilt.
      const incoming = update(outgoing, action.with, (s) => ({
        opacity: lerp(s.opacity, 1, p),
        reveal: lerp(s.reveal, 1, p),
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

/** One part arriving on its cue. */
const ITEM_APPEAR_MS = 600;

/** How long `action` runs: its own durationMs, or a default that, for an appear that builds, fits the content. */
export function actionDuration(scene: Scene, action: Action): number {
  if (action.durationMs !== undefined) return action.durationMs;
  if (action.action === "appear" && action.item !== undefined) return ITEM_APPEAR_MS;
  if (action.action === "appear") {
    const entity = scene.entities.find((e) => e.id === action.target);
    if (entity && buildsIn(entity)) return buildDurationMs(entity);
  }
  return DEFAULT_DURATION_MS[action.action];
}

/** Linear progress of an action at `tMs`, 0..1. */
export function actionLinearProgress(scene: Scene, action: Action, tMs: number): number {
  const duration = actionDuration(scene, action);
  if (duration === 0) return tMs >= action.atMs ? 1 : 0;
  return clamp01((tMs - action.atMs) / duration);
}

export function actionProgress(scene: Scene, action: Action, tMs: number): number {
  return easeInOutCubic(actionLinearProgress(scene, action, tMs));
}

/** Deterministic scene state at `tMs`: seeking and playing always agree. */
export function sceneStateAt(scene: Scene, tMs: number, assets: Assets = {}): SceneState {
  const timeline = orderedTimeline(scene);
  const start: Frame = { entities: initialStates(scene, timeline), camera: FULL_STAGE };
  const end = timeline
    .filter((a) => a.atMs <= tMs)
    .reduce((frame, action) => applyAction(scene, frame, action, actionProgress(scene, action, tMs), actionLinearProgress(scene, action, tMs), actionDuration(scene, action), assets), start);
  return { entities: withGroupBoxes(scene, end.entities), camera: end.camera };
}

/** The caption visible at `tMs`. */
export function captionAt(scene: Scene, tMs: number): string {
  const active = [...scene.cues].filter((c) => c.atMs <= tMs).sort((a, b) => a.atMs - b.atMs).at(-1);
  return active?.text ?? (scene.cues.length === 0 ? scene.narration : "");
}
