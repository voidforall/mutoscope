import type { TimeAxisEntity, Tone } from "../schema";
import { clamp01 } from "./easing";
import { INTER_REGULAR, INTER_SEMIBOLD } from "./font-metrics";
import { rectsOverlap, type Rect } from "./geometry";
import { fitText } from "./chart-layout";
import { proportionalEm } from "./text-fit";

/**
 * A horizontal time axis in box-local units. Event labels sit in lanes
 * alternating above and below the axis (near lanes first); an event that
 * finds no free lane is a collision the validator reports.
 */
export const TIME_AXIS = {
  pad: 22,
  titleH: 46,
  title: 30,
  inset: 28,
  when: 17,
  whenEm: 0.6,
  label: 22,
  detail: 17,
  lineGap: 4,
  stem: 26,
  laneGap: 12,
  hGap: 14,
  /** Eras are thick segments of the axis itself, labelled just below it. */
  spanBar: 10,
  span: 15,
  spanLabelGap: 22,
  spanLabelH: 20,
  dot: 7,
} as const;

const MAX_STEM = 90;

interface Lane {
  readonly above: boolean;
  readonly far: boolean;
}

/** Lanes in preference order. Neighbours alternate sides, so labels spread above and below the line. */
const lanesFor = (k: number): readonly Lane[] => {
  const first = k % 2 === 0;
  return [
    { above: first, far: false },
    { above: !first, far: false },
    { above: first, far: true },
    { above: !first, far: true },
  ];
};

export interface PlacedEvent {
  readonly index: number;
  readonly label: string;
  readonly when: string;
  readonly detail?: string;
  readonly tone?: Tone;
  /** Position on the axis, 0..1 — also when the build sweep reaches it. */
  readonly frac: number;
  readonly x: number;
  readonly above: boolean;
  readonly block: Rect;
}

export interface PlacedSpan {
  readonly label: string;
  readonly tone?: Tone;
  readonly x: number;
  readonly w: number;
  /** The label as drawn (ellipsised to the era's width), centred under the segment. */
  readonly text: string;
  readonly labelRect: Rect;
}

export interface TimeAxisLayout {
  readonly axis: { readonly x1: number; readonly x2: number; readonly y: number };
  readonly titleY?: number;
  readonly events: readonly PlacedEvent[];
  readonly spans: readonly PlacedSpan[];
  /** Labels of events whose blocks overlap. */
  readonly collisions: readonly (readonly [string, string])[];
}

const blockSize = (when: string, label: string, detail?: string) => ({
  w: Math.max(when.length * TIME_AXIS.when * TIME_AXIS.whenEm, proportionalEm(label, INTER_SEMIBOLD) * TIME_AXIS.label, detail ? proportionalEm(detail, INTER_REGULAR) * TIME_AXIS.detail : 0),
  h: TIME_AXIS.when * 1.25 + TIME_AXIS.lineGap + TIME_AXIS.label * 1.2 + (detail ? TIME_AXIS.lineGap + TIME_AXIS.detail * 1.3 : 0),
});

const fmtAt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(6))));

export function timeAxisLayout(t: TimeAxisEntity, box: Pick<Rect, "w" | "h">): TimeAxisLayout {
  const top = TIME_AXIS.pad + (t.title ? TIME_AXIS.titleH : 0);
  const bottom = box.h - TIME_AXIS.pad;
  const axisY = (top + bottom) / 2;
  const x1 = TIME_AXIS.pad + TIME_AXIS.inset;
  const x2 = box.w - TIME_AXIS.pad - TIME_AXIS.inset;
  const values = [...t.events.map((e) => e.at), ...t.spans.flatMap((s) => [s.from, s.to])];
  let lo = t.min ?? Math.min(...values);
  let hi = t.max ?? Math.max(...values);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const fracOf = (v: number) => clamp01((v - lo) / (hi - lo));
  const xOf = (v: number) => x1 + fracOf(v) * (x2 - x1);
  const spans = t.spans.map((s) => {
    const x = xOf(s.from);
    const w = xOf(s.to) - x;
    const text = fitText(s.label.toUpperCase(), TIME_AXIS.span, Math.max(w - 12, 10)).text;
    const tw = text.length * TIME_AXIS.span * 0.62;
    const labelRect = { x: x + w / 2 - tw / 2, y: axisY + TIME_AXIS.spanLabelGap - TIME_AXIS.span, w: tw, h: TIME_AXIS.spanLabelH };
    return { label: s.label, ...(s.tone ? { tone: s.tone } : {}), x, w, text, labelRect };
  });
  // Below the line, labels start past the era labels.
  const belowStart = spans.length ? TIME_AXIS.spanLabelGap + TIME_AXIS.spanLabelH : 0;
  // In a tall box, longer stems spread the labels out instead of huddling them around the line.
  const tallest = Math.max(...t.events.map((e) => blockSize(e.when ?? fmtAt(e.at), e.label, e.detail).h));
  const room = (bottom - top) / 2 - belowStart - 2 * tallest - TIME_AXIS.laneGap;
  const stem = Math.min(Math.max(TIME_AXIS.stem, room * 0.85), MAX_STEM);
  const order = t.events.map((e, index) => ({ e, index })).sort((a, b) => a.e.at - b.e.at || a.index - b.index);
  const placed: PlacedEvent[] = [];
  const stems: { label: string; rect: Rect }[] = [];
  const collisions: [string, string][] = [];
  order.forEach(({ e, index }, k) => {
    const when = e.when ?? fmtAt(e.at);
    const size = blockSize(when, e.label, e.detail);
    const x = xOf(e.at);
    const bx = Math.min(Math.max(x - size.w / 2, TIME_AXIS.pad), box.w - TIME_AXIS.pad - size.w);
    const candidates = lanesFor(k).map((lane) => {
      const near = stem + (lane.above ? 0 : belowStart);
      // Lanes are uniform bands sized by the tallest label, so a far label clears any near one.
      const offset = lane.far ? near + tallest + TIME_AXIS.laneGap : near;
      const y = lane.above ? axisY - offset - size.h : axisY + offset;
      const block = { x: bx, y, w: size.w, h: size.h };
      const inside = y >= top - 0.5 && y + size.h <= bottom + 0.5;
      const padded = { x: bx - TIME_AXIS.hGap / 2, y, w: size.w + TIME_AXIS.hGap, h: size.h };
      // A stem running down through an era label would strike it out.
      const strikes = lane.above ? [] : spans.filter((sp) => x >= sp.labelRect.x - 4 && x <= sp.labelRect.x + sp.labelRect.w + 4);
      // The leader line runs from the axis to the label: it must not cut through another label, nor this label sit on another's line.
      const edge = lane.above ? y + size.h : y;
      const stemRect = { x: x - 2, y: Math.min(axisY, edge), w: 4, h: Math.abs(edge - axisY) };
      const crossed = [...placed.filter((p) => rectsOverlap(stemRect, p.block)), ...stems.filter((st) => rectsOverlap(block, st.rect))].map((p) => p.label);
      const hits = [...placed.filter((p) => rectsOverlap(padded, p.block)).map((p) => p.label), ...strikes.map((sp) => sp.label), ...crossed];
      return { lane, block, inside, hits, stemRect };
    });
    const free = candidates.find((c) => c.inside && c.hits.length === 0);
    const chosen = free ?? candidates.filter((c) => c.inside).sort((a, b) => a.hits.length - b.hits.length)[0] ?? candidates[0]!;
    if (!free) collisions.push([chosen.hits[0] ?? e.label, e.label]);
    stems.push({ label: e.label, rect: chosen.stemRect });
    placed.push({ index, label: e.label, when, ...(e.detail ? { detail: e.detail } : {}), ...(e.tone ? { tone: e.tone } : {}), frac: fracOf(e.at), x, above: chosen.lane.above, block: chosen.block });
  });
  return {
    axis: { x1, x2, y: axisY },
    ...(t.title ? { titleY: TIME_AXIS.pad + TIME_AXIS.title * 0.8 } : {}),
    events: placed.sort((a, b) => a.index - b.index),
    spans,
    collisions,
  };
}

/** How far an event has appeared at build progress `reveal`: it fades in as the axis sweeps past it. */
export function eventProgress(frac: number, reveal: number): number {
  return clamp01((reveal * 1.12 - frac) / 0.12);
}
