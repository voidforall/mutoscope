import type { Asset, HeadlineEntity, ImageEntity, ListEntity, StatEntity, TableEntity } from "../schema";
import { statText } from "./build";
import { INTER_BOLD, INTER_REGULAR, INTER_SEMIBOLD } from "./font-metrics";
import type { Rect } from "./geometry";
import { proportionalEm, wrappedLines } from "./text-fit";

/**
 * Sizes for display type, stats, tables and images, shared by the player
 * (which renders them) and the validator (which warns when they get cramped).
 * Every constant mirrors visuals.css; units are stage units.
 */

export const HEADLINE_FONT = { lg: 48, xl: 72, display: 112 } as const;
export const HEADLINE_FONT_MIN = 16;
export const HEADLINE_FONT_READABLE = 28;
export const HEADLINE = { padX: 32, padY: 20, lineEm: 1.08, eyebrow: 44, step: 1 } as const;

/** The largest size, up to the headline's own maximum, at which its text wraps inside the box. */
export function headlineFont(e: Pick<HeadlineEntity, "text" | "size" | "eyebrow">, box: Pick<Rect, "w" | "h">): number {
  const w = box.w - HEADLINE.padX;
  const h = box.h - HEADLINE.padY - (e.eyebrow ? HEADLINE.eyebrow : 0);
  for (let font = HEADLINE_FONT[e.size]; font > HEADLINE_FONT_MIN; font -= HEADLINE.step) {
    if (wrappedLines(e.text, font, w, { metrics: INTER_BOLD }) * font * HEADLINE.lineEm <= h) return font;
  }
  return HEADLINE_FONT_MIN;
}

export const STAT_FONT_MAX = 140;
export const STAT_FONT_MIN = 20;
export const STAT_FONT_READABLE = 44;
export const STAT = { padX: 40, padY: 28, gap: 10, label: 26, labelLineEm: 1.3, note: 20, noteLineEm: 1.35, maxLabelLines: 2 } as const;

/** Tabular figures: every digit is as wide as the widest one, so counting never jitters. */
const tabularEm = (s: string) => proportionalEm(s.replace(/[0-9]/g, "0"), INTER_BOLD);

export interface StatFit {
  readonly valueFont: number;
  readonly labelLines: number;
  /** Whether label and note fit under the number at all. */
  readonly fits: boolean;
}

export function statFit(e: StatEntity, box: Pick<Rect, "w" | "h">): StatFit {
  const w = box.w - STAT.padX;
  const labelLines = wrappedLines(e.label, STAT.label, w, { metrics: INTER_REGULAR });
  const noteH = e.note ? STAT.gap + STAT.note * STAT.noteLineEm : 0;
  const textH = STAT.gap + labelLines * STAT.label * STAT.labelLineEm + noteH;
  const widest = Math.max(tabularEm(statText(e, 0)), tabularEm(statText(e, 1)));
  const byWidth = w / widest;
  const byHeight = box.h - STAT.padY - textH;
  const valueFont = Math.max(STAT_FONT_MIN, Math.min(STAT_FONT_MAX, byWidth, byHeight));
  return { valueFont, labelLines, fits: labelLines <= STAT.maxLabelLines && byHeight >= STAT_FONT_MIN };
}

export const TABLE = { font: 21, header: 16, padX: 14, rowH: 46, headerH: 42, title: 38, outer: 8 } as const;

export interface TableLayout {
  readonly colWidths: readonly number[];
  readonly titleH: number;
  /** Height the rows need. */
  readonly height: number;
  readonly overflowX: boolean;
  readonly overflowY: boolean;
}

/** Columns sized to their widest cell, sharing any spare width; overflow when the box is too small. */
export function tableLayout(e: Pick<TableEntity, "title" | "columns" | "rows">, box: Pick<Rect, "w" | "h">): TableLayout {
  const inner = box.w - 2 * TABLE.outer;
  const natural = e.columns.map((c, i) => {
    const head = proportionalEm(c.toUpperCase(), INTER_SEMIBOLD) * TABLE.header * 1.06;
    const cells = e.rows.map((r) => proportionalEm(r[i] ?? "", INTER_REGULAR) * TABLE.font);
    return Math.max(head, ...cells) + 2 * TABLE.padX;
  });
  const total = natural.reduce((a, b) => a + b, 0);
  const scale = inner / total;
  const colWidths = natural.map((n) => n * scale);
  const titleH = e.title ? TABLE.title : 0;
  const height = titleH + TABLE.headerH + e.rows.length * TABLE.rowH + 2 * TABLE.outer;
  return { colWidths, titleH, height, overflowX: total > inner + 0.5, overflowY: height > box.h + 0.5 };
}

export const IMAGE = { pad: 10, caption: 32, captionFont: 17 } as const;

/** Where the picture lands inside the entity box (box-local), honouring `fit` and leaving room for the caption line. */
export function imageRect(e: Pick<ImageEntity, "fit" | "caption" | "credit">, asset: Pick<Asset, "width" | "height">, box: Pick<Rect, "w" | "h">): { frame: Rect; image: Rect } {
  const captioned = Boolean(e.caption || e.credit);
  const frame = { x: IMAGE.pad, y: IMAGE.pad, w: box.w - 2 * IMAGE.pad, h: box.h - 2 * IMAGE.pad - (captioned ? IMAGE.caption : 0) };
  const scale = (e.fit === "cover" ? Math.max : Math.min)(frame.w / asset.width, frame.h / asset.height);
  const w = asset.width * scale;
  const h = asset.height * scale;
  return { frame, image: { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h } };
}

/** A callout's point in box-local coordinates, and whether `cover` cropped it out of view. */
export function calloutPoint(c: { readonly x: number; readonly y: number; readonly w?: number; readonly h?: number }, frame: Rect, image: Rect): { x: number; y: number; region?: Rect; visible: boolean } {
  const region = c.w !== undefined && c.h !== undefined ? { x: image.x + c.x * image.w, y: image.y + c.y * image.h, w: c.w * image.w, h: c.h * image.h } : undefined;
  const x = region ? region.x + region.w / 2 : image.x + c.x * image.w;
  const y = region ? region.y : image.y + c.y * image.h;
  const visible = x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h;
  return { x, y, ...(region ? { region } : {}), visible };
}

export const LIST = { pad: 20, title: 38, text: 28, textLineEm: 1.3, detail: 21, detailLineEm: 1.35, detailGap: 4, itemGap: 16, marker: 44, minScale: 0.7, readableScale: 0.8 } as const;

/** The scale (≤ 1) at which every item wraps inside the box; lists shrink as a whole so items stay alike. */
export function listScale(e: Pick<ListEntity, "title" | "items">, box: Pick<Rect, "w" | "h">): number {
  const height = (scale: number) => {
    const w = box.w - 2 * LIST.pad - LIST.marker * scale;
    const items = e.items.map((it) => {
      const text = wrappedLines(it.text, LIST.text * scale, w, { metrics: INTER_SEMIBOLD }) * LIST.text * scale * LIST.textLineEm;
      const detail = it.detail ? LIST.detailGap + wrappedLines(it.detail, LIST.detail * scale, w, { metrics: INTER_REGULAR }) * LIST.detail * scale * LIST.detailLineEm : 0;
      return text + detail;
    });
    return 2 * LIST.pad + (e.title ? LIST.title : 0) + items.reduce((a, b) => a + b, 0) + (e.items.length - 1) * LIST.itemGap * scale;
  };
  for (let scale = 1; scale > LIST.minScale; scale -= 0.02) {
    if (height(scale) <= box.h) return scale;
  }
  return LIST.minScale;
}
