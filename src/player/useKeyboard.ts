import { useEffect } from "react";
import type { PlayerEvent, PlayerState } from "./state";

const SEEK_STEP_MS = 2000;

export function useKeyboard(state: PlayerState, dispatch: (e: PlayerEvent) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const seek = (index: number, tMs: number) => dispatch({ type: "seek", index, tMs });
      switch (e.key) {
        case " ":
        case "k":
          if (el?.getAttribute("role") === "button" || el?.tagName === "BUTTON") return;
          e.preventDefault();
          dispatch({ type: "toggle" });
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(state.index, state.tMs - SEEK_STEP_MS);
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(state.index, state.tMs + SEEK_STEP_MS);
          break;
        case "[":
        case "PageUp":
          seek(state.index - 1, 0);
          break;
        case "]":
        case "PageDown":
          seek(state.index + 1, 0);
          break;
        case "Escape":
          dispatch({ type: "select", id: undefined });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, dispatch]);
}
