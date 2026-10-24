import type { Scene } from "../schema";

export interface Position {
  readonly index: number;
  readonly tMs: number;
}

export const totalDuration = (scenes: readonly Scene[]): number =>
  scenes.reduce((sum, s) => sum + s.durationMs, 0);

export function sceneOffsets(scenes: readonly Scene[]): readonly number[] {
  return scenes.reduce<number[]>((acc, _s, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + scenes[i - 1]!.durationMs], []);
}

export function toGlobal(scenes: readonly Scene[], pos: Position): number {
  return (sceneOffsets(scenes)[pos.index] ?? 0) + pos.tMs;
}

/** Map a reel-wide time to (scene index, time within scene). Clamps to the reel. */
export function locate(scenes: readonly Scene[], globalMs: number): Position {
  const offsets = sceneOffsets(scenes);
  const total = totalDuration(scenes);
  const g = Math.min(Math.max(globalMs, 0), total);
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (g >= offsets[i]! && (g < offsets[i]! + scenes[i]!.durationMs || i === scenes.length - 1)) {
      return { index: i, tMs: Math.min(g - offsets[i]!, scenes[i]!.durationMs) };
    }
  }
  return { index: 0, tMs: 0 };
}

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
