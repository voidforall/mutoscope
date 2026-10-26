import type { Entity, StatEntity } from "../schema";
import { clamp01 } from "./easing";

/**
 * Builds: entities made of parts (words, bars, events, rows, callouts) bring
 * their parts in one after another while their `appear` action runs. The
 * entity's `reveal` state (0..1) is that action's linear progress; these
 * helpers turn it into per-part progress, identically in the player and in
 * anything that reasons about frames.
 */
export function buildsIn(e: Entity): boolean {
  switch (e.type) {
    case "headline":
    case "label":
      return e.reveal !== "fade";
    case "stat":
      return e.countUp;
    case "chart":
    case "time-axis":
    case "table":
      return true;
    case "image":
      return e.callouts.length > 0;
    default:
      return false;
  }
}

const MAX_BUILD_MS = 8_000;
const bounded = (ms: number, min = 800) => Math.round(Math.min(MAX_BUILD_MS, Math.max(min, ms)));

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** How long an `appear` without `durationMs` takes to build `e`: long enough to read along. */
export function buildDurationMs(e: Entity): number {
  switch (e.type) {
    case "headline":
    case "label":
      return e.reveal === "words" ? bounded(wordCount(e.text) * 220) : bounded([...e.text].length * 40);
    case "stat":
      return 1_600;
    case "chart":
      return bounded(1_200 + 150 * e.categories.length);
    case "time-axis":
      return bounded(800 + 350 * e.events.length);
    case "table":
      return bounded(500 + 220 * e.rows.length);
    case "image":
      return bounded(600 + 500 * e.callouts.length);
    default:
      return 500;
  }
}

/**
 * Progress of part `index` of `count` at build progress `reveal`. Parts start
 * evenly spaced and each takes twice the spacing, so neighbours overlap by
 * half: the build reads as one motion rather than a list of steps.
 */
export function partProgress(reveal: number, index: number, count: number): number {
  return clamp01((reveal * (count + 1) - index) / 2);
}

export interface RevealToken {
  readonly text: string;
  /** 0 hidden … 1 shown. Whitespace is always 1 so the line never reflows. */
  readonly p: number;
}

/** Words of `text` (with the whitespace between them) and how far each has faded in. */
export function revealWords(text: string, reveal: number): RevealToken[] {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const words = tokens.filter((t) => /\S/.test(t)).length;
  let i = 0;
  return tokens.map((t) => (/\S/.test(t) ? { text: t, p: clamp01(reveal * words - i++) } : { text: t, p: 1 }));
}

/** Characters of `text` typed so far. */
export function typewriterCount(text: string, reveal: number): number {
  return Math.round([...text].length * clamp01(reveal));
}

function decimalsOf(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 || s.includes("e") ? 0 : Math.min(4, s.length - dot - 1);
}

/** The stat as shown at build progress `reveal`: prefix, grouped number, suffix. */
export function statText(e: Pick<StatEntity, "value" | "from" | "decimals" | "prefix" | "suffix" | "countUp">, reveal: number): string {
  const decimals = e.decimals ?? decimalsOf(e.value);
  const v = e.countUp ? e.from + (e.value - e.from) * clamp01(reveal) : e.value;
  const n = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${e.prefix ?? ""}${n}${e.suffix ?? ""}`;
}
