import type { ChartEntity, Tone } from "../schema";
import { partProgress } from "./build";
import { easeInOutCubic } from "./easing";
import { INTER_REGULAR, INTER_SEMIBOLD } from "./font-metrics";
import type { Point, Rect } from "./geometry";
import { proportionalEm } from "./text-fit";

/**
 * Geometry of a chart in box-local units, as a pure function of the entity,
 * its box and build progress. The player draws exactly this; the validator
 * reads the same labels to warn about truncation.
 */
export const CHART = { pad: 22, title: 30, titleH: 46, legendH: 34, legend: 18, swatch: 14, label: 20, value: 19, tick: 16, tickEm: 0.6, gap: 10, labelH: 34 } as const;
const SERIES_TONES: readonly Tone[] = ["accent", "neutral", "added", "warning"];
const MIN_BAR = 4;

export interface Domain {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly ticks: readonly number[];
}

function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
}

/** Axis bounds rounded outward to a readable step (about five intervals), unless pinned. */
export function niceDomain(values: readonly number[], min?: number, max?: number): Domain {
  let lo = min ?? Math.min(0, ...values);
  let hi = max ?? Math.max(0, ...values);
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 5);
  lo = min ?? Math.floor(lo / step + 1e-9) * step;
  hi = max ?? Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

/** Compact number for axes and value labels: 1.2k, 3.4M, 0.25. */
export function formatValue(v: number, unit = ""): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const [n, s] = abs >= 1e9 ? [v / 1e9, "B"] : abs >= 1e6 ? [v / 1e6, "M"] : abs >= 1e4 ? [v / 1e3, "k"] : [v, ""];
  const text = Number(n.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${text}${s}${unit}`;
}

export interface ChartBar {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly category: number;
  readonly series: number;
  readonly tone: Tone;
  readonly muted: boolean;
  readonly label?: { readonly text: string; readonly x: number; readonly y: number; readonly anchor: "start" | "middle" };
}

export interface ChartLine {
  readonly series: number;
  readonly name: string;
  readonly tone: Tone;
  readonly points: readonly Point[];
  /** Baseline y for an area fill. */
  readonly baseY: number;
  readonly endLabel?: { readonly text: string; readonly x: number; readonly y: number };
}

export interface ChartLabel {
  readonly text: string;
  readonly full: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  readonly truncated: boolean;
  readonly muted: boolean;
}

export interface ChartLayout {
  readonly plot: Rect;
  readonly domain: Domain;
  readonly bars: readonly ChartBar[];
  readonly lines: readonly ChartLine[];
  readonly labels: readonly ChartLabel[];
  readonly ticks: readonly { readonly text: string; readonly x: number; readonly y: number; readonly anchor: "end" | "middle" }[];
  readonly gridlines: readonly { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }[];
  readonly legend: readonly { readonly name: string; readonly tone: Tone; readonly x: number }[];
  readonly titleY?: number;
  readonly legendY?: number;
}

const width = (text: string, font: number, bold = false) => proportionalEm(text, bold ? INTER_SEMIBOLD : INTER_REGULAR) * font;

/** Cut `text` with an ellipsis so it fits `max` units at `font`. */
export function fitText(text: string, font: number, max: number): { text: string; truncated: boolean } {
  // A column sized to its widest label must hold that label: allow for float rounding in (w + pad) - pad.
  if (width(text, font) <= max + 1e-6) return { text, truncated: false };
  const chars = [...text];
  while (chars.length > 1 && width(`${chars.join("").trimEnd()}…`, font) > max) chars.pop();
  return { text: `${chars.join("").trimEnd()}…`, truncated: true };
}

const seriesTone = (c: ChartEntity, i: number): Tone => c.series[i]?.tone ?? SERIES_TONES[i % SERIES_TONES.length]!;

function frame(c: ChartEntity, box: Pick<Rect, "w" | "h">): { top: number; titleY?: number; legendY?: number } {
  let top = CHART.pad;
  const titleY = c.title ? top + CHART.title * 0.8 : undefined;
  if (c.title) top += CHART.titleH;
  const legendY = c.series.length > 1 ? top + CHART.legendH / 2 : undefined;
  if (c.series.length > 1) top += CHART.legendH;
  return { top: Math.min(top, box.h / 2), ...(titleY !== undefined ? { titleY } : {}), ...(legendY !== undefined ? { legendY } : {}) };
}

export function chartLayout(c: ChartEntity, box: Pick<Rect, "w" | "h">, reveal: number): ChartLayout {
  const domain = niceDomain(c.series.flatMap((s) => s.values), c.min, c.max);
  const head = frame(c, box);
  const legend = c.series.reduce<{ name: string; tone: Tone; x: number }[]>((acc, s, i) => {
    const prev = acc.at(-1);
    const x = prev ? prev.x + CHART.swatch + 6 + width(prev.name, CHART.legend) + 22 : CHART.pad;
    return [...acc, { name: s.name, tone: seriesTone(c, i), x }];
  }, []);
  const muted = (i: number) => c.highlight.length > 0 && !c.highlight.includes(c.categories[i]!);
  const common = { domain, legend, ...(head.titleY !== undefined ? { titleY: head.titleY } : {}), ...(head.legendY !== undefined ? { legendY: head.legendY } : {}) };
  return c.kind === "bar" ? { ...common, ...horizontal(c, box, head.top, domain, reveal, muted) } : { ...common, ...vertical(c, box, head.top, domain, reveal, muted) };
}

type Body = Omit<ChartLayout, "domain" | "legend" | "titleY" | "legendY">;

function vertical(c: ChartEntity, box: Pick<Rect, "w" | "h">, top: number, d: Domain, reveal: number, muted: (i: number) => boolean): Body {
  const tickTexts = d.ticks.map((t) => formatValue(t, c.unit));
  const tickW = Math.max(...tickTexts.map((t) => t.length)) * CHART.tick * CHART.tickEm + CHART.gap;
  const valueRoom = c.valueLabels ? CHART.value + 8 : 6;
  const plot = { x: CHART.pad + tickW, y: top + valueRoom, w: box.w - 2 * CHART.pad - tickW, h: box.h - top - valueRoom - CHART.pad - CHART.labelH };
  const n = c.categories.length;
  const yOf = (v: number) => plot.y + plot.h - ((v - d.min) / (d.max - d.min)) * plot.h;
  const base = yOf(Math.min(Math.max(0, d.min), d.max));
  const ticks = d.ticks.map((t, i) => ({ text: tickTexts[i]!, x: plot.x - CHART.gap, y: yOf(t) + CHART.tick * 0.35, anchor: "end" as const }));
  const gridlines = d.ticks.map((t) => ({ x1: plot.x, y1: yOf(t), x2: plot.x + plot.w, y2: yOf(t) }));
  const line = c.kind === "line" || c.kind === "area";
  const slot = line ? plot.w / Math.max(1, n - 1) : plot.w / n;
  const xOf = (i: number) => (line ? plot.x + i * slot : plot.x + slot * (i + 0.5));
  const labels = c.categories.map((cat, i) => {
    const room = line && (i === 0 || i === n - 1) ? slot : slot - 8;
    const fit = fitText(cat, CHART.label, Math.max(room, 12));
    const anchor = line && n > 1 && i === 0 ? "start" : line && n > 1 && i === n - 1 ? "end" : "middle";
    return { text: fit.text, full: cat, x: xOf(i), y: plot.y + plot.h + CHART.labelH * 0.8, anchor: anchor as ChartLabel["anchor"], truncated: fit.truncated, muted: muted(i) };
  });
  if (line) {
    const lines = c.series.map((s, si) => {
      const points = s.values.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
      const last = points.at(-1)!;
      const endLabel = c.valueLabels && reveal >= 0.999 ? { text: formatValue(s.values.at(-1)!, c.unit), x: last.x, y: last.y - 12 } : undefined;
      return { series: si, name: s.name, tone: seriesTone(c, si), points, baseY: base, ...(endLabel ? { endLabel } : {}) };
    });
    return { plot, bars: [], lines, labels, ticks, gridlines };
  }
  const group = slot * 0.72;
  const barW = Math.max(MIN_BAR, group / c.series.length);
  const bars = c.series.flatMap((s, si) =>
    s.values.map((v, i) => {
      const p = easeInOutCubic(partProgress(reveal, i, n));
      const end = yOf(v);
      const y = Math.min(base, base + (end - base) * p);
      const h = Math.abs(end - base) * p;
      const x = xOf(i) - group / 2 + si * barW;
      const label = c.valueLabels && c.series.length <= 2 && p >= 0.999 ? { text: formatValue(v, c.unit), x: x + barW / 2, y: v >= 0 ? end - 8 : end + CHART.value + 4, anchor: "middle" as const } : undefined;
      return { x, y, w: barW, h, category: i, series: si, tone: seriesTone(c, si), muted: muted(i), ...(label ? { label } : {}) };
    }),
  );
  return { plot, bars, lines: [], labels, ticks, gridlines };
}

function horizontal(c: ChartEntity, box: Pick<Rect, "w" | "h">, top: number, d: Domain, reveal: number, muted: (i: number) => boolean): Body {
  const inner = box.w - 2 * CHART.pad;
  const labelCol = Math.min(Math.max(...c.categories.map((t) => width(t, CHART.label))) + CHART.gap * 2, inner * 0.38);
  const valueRoom = c.valueLabels ? Math.max(...c.series.flatMap((s) => s.values.map((v) => width(formatValue(v, c.unit), CHART.value)))) + CHART.gap : 0;
  const plot = { x: CHART.pad + labelCol, y: top, w: inner - labelCol - valueRoom, h: box.h - top - CHART.pad - CHART.labelH };
  const n = c.categories.length;
  const slot = plot.h / n;
  const xOf = (v: number) => plot.x + ((v - d.min) / (d.max - d.min)) * plot.w;
  const base = xOf(Math.min(Math.max(0, d.min), d.max));
  const ticks = d.ticks.map((t) => ({ text: formatValue(t, c.unit), x: xOf(t), y: plot.y + plot.h + CHART.labelH * 0.8, anchor: "middle" as const }));
  const gridlines = d.ticks.map((t) => ({ x1: xOf(t), y1: plot.y, x2: xOf(t), y2: plot.y + plot.h }));
  const labels = c.categories.map((cat, i) => {
    const fit = fitText(cat, CHART.label, labelCol - CHART.gap * 2);
    return { text: fit.text, full: cat, x: plot.x - CHART.gap, y: plot.y + slot * (i + 0.5) + CHART.label * 0.35, anchor: "end" as const, truncated: fit.truncated, muted: muted(i) };
  });
  const group = slot * 0.66;
  const barH = Math.max(MIN_BAR, group / c.series.length);
  const bars = c.series.flatMap((s, si) =>
    s.values.map((v, i) => {
      const p = easeInOutCubic(partProgress(reveal, i, n));
      const end = xOf(v);
      const x = Math.min(base, base + (end - base) * p);
      const w = Math.abs(end - base) * p;
      const y = plot.y + slot * (i + 0.5) - group / 2 + si * barH;
      const label = c.valueLabels && p >= 0.999 ? { text: formatValue(v, c.unit), x: Math.max(base, end) + 8, y: y + barH / 2 + CHART.value * 0.35, anchor: "start" as const } : undefined;
      return { x, y, w, h: barH, category: i, series: si, tone: seriesTone(c, si), muted: muted(i), ...(label ? { label } : {}) };
    }),
  );
  return { plot, bars, lines: [], labels, ticks, gridlines };
}
