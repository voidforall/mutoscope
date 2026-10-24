import { locate, totalDuration } from "../core";
import type { Scene } from "../schema";
import type { PlayerEvent, PlayerState } from "./state";

/**
 * Stable scripting surface on window.mutoscope — used by end-to-end tests,
 * frame capture (video export) and embedding hosts.
 */
export interface MutoscopeApi {
  readonly ready: true;
  readonly durationMs: number;
  seek(sceneId: string, tMs: number): void;
  /** Seek on the reel-wide clock (used by video export). */
  seekGlobal(ms: number): void;
  play(): void;
  pause(): void;
  select(entityId?: string): void;
  state(): PlayerState & { readonly sceneId: string };
}

export function installApi(scenes: readonly Scene[], get: () => PlayerState, dispatch: (e: PlayerEvent) => void): () => void {
  const api: MutoscopeApi = {
    ready: true,
    durationMs: totalDuration(scenes),
    seekGlobal: (ms) => {
      const pos = locate(scenes, ms);
      dispatch({ type: "seek", index: pos.index, tMs: pos.tMs });
    },
    seek: (sceneId, tMs) => {
      const index = scenes.findIndex((s) => s.id === sceneId);
      if (index >= 0) dispatch({ type: "seek", index, tMs });
    },
    play: () => dispatch({ type: "play" }),
    pause: () => dispatch({ type: "pause" }),
    select: (id) => dispatch({ type: "select", id }),
    state: () => ({ ...get(), sceneId: scenes[get().index]!.id }),
  };
  (window as unknown as { mutoscope?: MutoscopeApi }).mutoscope = api;
  return () => {
    delete (window as unknown as { mutoscope?: MutoscopeApi }).mutoscope;
  };
}
