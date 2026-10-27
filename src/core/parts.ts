import type { Entity } from "../schema";
import { clamp01 } from "./easing";
import { partProgress } from "./build";

/**
 * Parts are the pieces of an entity a timeline action can address with
 * `item`: list items, table rows, time-axis events, chart categories and
 * image callouts, in the order the author wrote them.
 */
export function partCount(e: Entity): number | undefined {
  switch (e.type) {
    case "list":
      return e.items.length;
    case "table":
      return e.rows.length;
    case "time-axis":
      return e.events.length;
    case "chart":
      return e.categories.length;
    case "image":
      return e.callouts.length;
    default:
      return undefined;
  }
}

export const PART_NAMES: Partial<Record<Entity["type"], string>> = { list: "items", table: "rows", "time-axis": "events", chart: "categories", image: "callouts" };

/** Emphasis of one part; parts default to neither. */
export interface PartEmphasis {
  readonly highlight: number;
  readonly dim: number;
}

const NONE: PartEmphasis = { highlight: 0, dim: 0 };

/**
 * How far part `i` has appeared: stepped entities (built one `appear item` at
 * a time) show exactly the parts revealed so far; others build their parts
 * across the appear, as in build.ts.
 */
export function partShown(state: { readonly reveal: number; readonly steps: number | null }, i: number, count: number): number {
  return state.steps === null ? partProgress(state.reveal, i, count) : clamp01(state.steps - i);
}

/**
 * Emphasis of part `i`: its own highlight and dim, plus a soft dim while any
 * sibling is highlighted, so the highlighted part stands out without the
 * author dimming the rest by hand.
 */
export function partEmphasis(items: Readonly<Record<number, PartEmphasis>>, i: number): PartEmphasis {
  const own = items[i] ?? NONE;
  const siblings = Math.max(0, ...Object.entries(items).filter(([k]) => Number(k) !== i).map(([, v]) => v.highlight));
  return { highlight: own.highlight, dim: Math.max(own.dim, siblings * (1 - own.highlight) * 0.6) };
}
