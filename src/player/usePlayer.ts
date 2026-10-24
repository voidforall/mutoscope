import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Scene } from "../schema";
import { reduce, type PlayerEvent, type PlayerState } from "./state";

export function usePlayer(scenes: readonly Scene[], initial: PlayerState) {
  const [state, rawDispatch] = useReducer(
    (s: PlayerState, e: PlayerEvent) => reduce(scenes, s, e),
    initial,
  );
  const dispatch = useCallback((e: PlayerEvent) => rawDispatch(e), []);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!state.playing) {
      last.current = null;
      return;
    }
    let frame = 0;
    const loop = (now: number) => {
      const dt = last.current === null ? 0 : Math.min(now - last.current, 100);
      last.current = now;
      dispatch({ type: "tick", dtMs: dt });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.playing, dispatch]);

  return [state, dispatch] as const;
}
