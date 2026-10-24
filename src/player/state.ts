import type { Scene } from "../schema";

export interface PlayerState {
  readonly index: number;
  readonly tMs: number;
  readonly playing: boolean;
  readonly selectedId?: string;
  readonly rate: number;
}

export type PlayerEvent =
  | { readonly type: "tick"; readonly dtMs: number }
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "toggle" }
  | { readonly type: "seek"; readonly index: number; readonly tMs: number }
  | { readonly type: "select"; readonly id?: string }
  | { readonly type: "rate"; readonly rate: number };

export const RATES = [1, 1.5, 2, 0.5] as const;

/** Pure playback reducer; the rAF loop only dispatches ticks. */
export function reduce(scenes: readonly Scene[], s: PlayerState, e: PlayerEvent): PlayerState {
  const last = scenes.length - 1;
  switch (e.type) {
    case "tick": {
      if (!s.playing) return s;
      const scene = scenes[s.index]!;
      const t = s.tMs + e.dtMs * s.rate;
      if (t < scene.durationMs) return { ...s, tMs: t };
      if (s.index < last) return { ...s, index: s.index + 1, tMs: 0, selectedId: undefined };
      return { ...s, tMs: scene.durationMs, playing: false };
    }
    case "play": {
      const atEnd = s.index === last && s.tMs >= scenes[last]!.durationMs;
      return atEnd ? { ...s, index: 0, tMs: 0, playing: true, selectedId: undefined } : { ...s, playing: true, selectedId: undefined };
    }
    case "pause":
      return { ...s, playing: false };
    case "toggle":
      return reduce(scenes, s, { type: s.playing ? "pause" : "play" });
    case "seek": {
      const index = Math.min(Math.max(e.index, 0), last);
      const tMs = Math.min(Math.max(e.tMs, 0), scenes[index]!.durationMs);
      const keep = index === s.index && scenes[index]!.entities.some((x) => x.id === s.selectedId);
      return { ...s, index, tMs, selectedId: keep ? s.selectedId : undefined };
    }
    case "select":
      // Inspecting something pauses playback so the context cannot move away.
      return e.id ? { ...s, selectedId: e.id, playing: false } : { ...s, selectedId: undefined };
    case "rate":
      return { ...s, rate: e.rate };
  }
}
