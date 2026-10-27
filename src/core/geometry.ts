import { GRID_COLS, GRID_ROWS, type GridBox } from "../schema";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STAGE = { width: 1600, height: 900 } as const;
export const FULL_STAGE: Rect = { x: 0, y: 0, w: STAGE.width, h: STAGE.height };

const MARGIN_X = 56;
const MARGIN_Y = 48;
const GUTTER_X = 24;
const GUTTER_Y = 20;
const CELL_W = (STAGE.width - 2 * MARGIN_X - (GRID_COLS - 1) * GUTTER_X) / GRID_COLS;
const CELL_H = (STAGE.height - 2 * MARGIN_Y - (GRID_ROWS - 1) * GUTTER_Y) / GRID_ROWS;

export function gridToRect(box: GridBox): Rect {
  return {
    x: MARGIN_X + (box.col - 1) * (CELL_W + GUTTER_X),
    y: MARGIN_Y + (box.row - 1) * (CELL_H + GUTTER_Y),
    w: box.colSpan * CELL_W + (box.colSpan - 1) * GUTTER_X,
    h: box.rowSpan * CELL_H + (box.rowSpan - 1) * GUTTER_Y,
  };
}

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
  w: lerp(a.w, b.w, p),
  h: lerp(a.h, b.h, p),
});

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const padRect = (r: Rect, pad: number): Rect => ({
  x: r.x - pad,
  y: r.y - pad,
  w: r.w + 2 * pad,
  h: r.h + 2 * pad,
});

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Smallest stage-aspect viewport containing `r` (plus padding), never zooming past `maxZoom`. */
export function cameraFor(r: Rect, pad = 48, maxZoom = 2.5): Rect {
  const aspect = STAGE.width / STAGE.height;
  const padded = padRect(r, pad);
  const minW = STAGE.width / maxZoom;
  let w = Math.max(padded.w, padded.h * aspect, minW);
  w = Math.min(w, STAGE.width);
  const h = w / aspect;
  const cx = padded.x + padded.w / 2;
  const cy = padded.y + padded.h / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), STAGE.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), STAGE.height - h);
  return { x, y, w, h };
}

export interface Point {
  x: number;
  y: number;
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the ray from the rect centre towards `toward` leaves the rect. */
function exitPoint(r: Rect, toward: Point, gap: number): Point {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : (r.w / 2 + gap) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (r.h / 2 + gap) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** Room an edge needs before its label can sit on it without covering the ends. */
export function edgeLabelFits(label: string, length: number): boolean {
  return length >= edgeLengthFor(label);
}

/** The edge length a label needs: its text plus room for the arrow ends. */
export const edgeLengthFor = (label: string): number => label.length * 11 + 70;

/** Stage units per grid column, gutter included. */
export const COLUMN_PITCH = CELL_W + GUTTER_X;

/** Straight connector between two boxes, clipped to their borders. */
export function edgeSegment(from: Rect, to: Rect, gap = 6): { a: Point; b: Point } {
  return { a: exitPoint(from, center(to), gap), b: exitPoint(to, center(from), gap) };
}

/** Whether segment a→b passes through rectangle r (Liang–Barsky clipping). */
export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clips: Array<[number, number]> = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

