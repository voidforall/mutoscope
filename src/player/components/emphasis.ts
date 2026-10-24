import type { CSSProperties } from "react";
import type { EntityState } from "../../core";

/** Shared mapping from timeline state to node styling. */
export function emphasisStyle(s: EntityState, selected: boolean): CSSProperties {
  return {
    opacity: s.opacity * (1 - 0.62 * s.dim),
    ["--hl" as string]: String(s.highlight),
    ["--sel" as string]: selected ? "1" : "0",
    pointerEvents: s.opacity < 0.2 ? "none" : undefined,
  };
}
