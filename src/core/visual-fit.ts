import type { Asset, HeadlineEntity, IconEntity, ImageEntity, ListEntity, ReelStyle, StatEntity, TableEntity } from "../schema";
import { statText } from "./build";
import { INTER_BOLD, INTER_REGULAR, INTER_SEMIBOLD, SERIF_BOLD } from "./font-metrics";
import type { Rect } from "./geometry";
import { MONO_EM, proportionalEm, wrappedLines } from "./text-fit";

/**
 * Sizes for display type, stats, tables and images, shared by the player
 * (which renders them) and the validator (which warns when they get cramped).
 * Every constant mirrors visuals.css; units are stage units.
 */

export const HEADLINE_FONT = { lg: 48, xl: 72, display: 112 } as const;
export const HEADLINE_FONT_MIN = 16;
export const HEADLINE_FONT_READABLE = 28;
export const HEADLINE = { padX: 32, padY: 20, lineEm: 1.08, eyebrow: 44, step: 1 } as const;

/** The display face a style sets headlines in (see `--display` in visuals.css). */
const displayFace = (style: ReelStyle) => (style === "terminal" ? { monoEm: MONO_EM } : { metrics: style === "editorial" ? SERIF_BOLD : INTER_BOLD });

/** The largest size, up to the headline's own maximum, at which its text wraps inside the box. */
export function headlineFont(e: Pick<HeadlineEntity, "text" | "size" | "eyebrow">, box: Pick<Rect, "w" | "h">, style: ReelStyle = "studio"): number {
  const w = box.w - HEADLINE.padX;
  const h = box.h - HEADLINE.padY - (e.eyebrow ? HEADLINE.eyebrow : 0);
  const face = displayFace(style);
  for (let font = HEADLINE_FONT[e.size]; font > HEADLINE_FONT_MIN; font -= HEADLINE.step) {
    if (wrappedLines(e.text, font, w, face) * font * HEADLINE.lineEm <= h) return font;
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

export const TABLE = { font: 21, header: 16, padX: 14, rowH: 46, headerH: 42, title: 38, outer: 8, maxScale: 1.5 } as const;

export interface TableLayout {
  /** Type scale: above 1 when the box has room to spare, so the table fills it. */
  readonly scale: number;
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
  const baseH = (e.title ? TABLE.title : 0) + TABLE.headerH + e.rows.length * TABLE.rowH;
  const room = Math.min(inner / total, (box.h - 2 * TABLE.outer) / baseH);
  const scale = Math.min(TABLE.maxScale, Math.max(1, room));
  const colWidths = natural.map((n) => (n * inner) / total);
  const titleH = e.title ? TABLE.title * scale : 0;
  const height = baseH * scale + 2 * TABLE.outer;
  return { scale, colWidths, titleH, height, overflowX: total > inner + 0.5, overflowY: height > box.h + 0.5 };
}

export const IMAGE = { pad: 10, caption: 32, captionFont: 17 } as const;
/** Callout tags: mirrors ImageNode's tag and visuals.css. */
export const CALLOUT = { font: 20, padX: 12, h: 38, offset: 22, inset: 4 } as const;

export interface ImageGeometry {
  /** The area the picture may occupy (box minus padding and caption). */
  readonly frame: Rect;
  /** Where the visible part of the picture is drawn. */
  readonly view: Rect;
  /** Where the whole picture would be, cropped parts included: callout fractions refer to it. */
  readonly full: Rect;
}

type Crop = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** Where the picture lands inside the entity box (box-local), honouring `fit`, `crop` and the caption line. */
export function imageRect(e: Pick<ImageEntity, "fit" | "caption" | "credit"> & { readonly crop?: Crop }, asset: Pick<Asset, "width" | "height">, box: Pick<Rect, "w" | "h">): ImageGeometry {
  const captioned = Boolean(e.caption || e.credit);
  const frame = { x: IMAGE.pad, y: IMAGE.pad, w: box.w - 2 * IMAGE.pad, h: box.h - 2 * IMAGE.pad - (captioned ? IMAGE.caption : 0) };
  const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const srcW = asset.width * crop.w;
  const srcH = asset.height * crop.h;
  const scale = (e.fit === "cover" ? Math.max : Math.min)(frame.w / srcW, frame.h / srcH);
  const view = { x: frame.x + (frame.w - srcW * scale) / 2, y: frame.y + (frame.h - srcH * scale) / 2, w: srcW * scale, h: srcH * scale };
  const full = { x: view.x - crop.x * asset.width * scale, y: view.y - crop.y * asset.height * scale, w: asset.width * scale, h: asset.height * scale };
  return { frame, view, full };
}

const inside = (x: number, y: number, r: Rect) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
};

/** A callout's anchor point in box-local coordinates, and whether cropping or `cover` hides it. */
export function calloutPoint(c: { readonly x: number; readonly y: number; readonly w?: number; readonly h?: number }, geo: ImageGeometry): { x: number; y: number; region?: Rect; visible: boolean } {
  const { full } = geo;
  const shown = intersect(geo.frame, geo.view);
  const region = c.w !== undefined && c.h !== undefined ? { x: full.x + c.x * full.w, y: full.y + c.y * full.h, w: c.w * full.w, h: c.h * full.h } : undefined;
  const x = region ? region.x + region.w / 2 : full.x + c.x * full.w;
  const y = region ? region.y : full.y + c.y * full.h;
  return { x, y, ...(region ? { region } : {}), visible: inside(x, y, shown) };
}

export type CalloutSide = "above" | "below" | "left" | "right";

/**
 * Where a callout's tag sits: on the requested side of its point (or region),
 * defaulting to above, and kept inside the picture frame.
 */
export function calloutTag(point: { x: number; y: number; region?: Rect }, label: string, frame: Rect, side?: CalloutSide): Rect {
  const w = proportionalEm(label) * CALLOUT.font + 2 * CALLOUT.padX;
  const h = CALLOUT.h;
  const r = point.region ?? { x: point.x, y: point.y, w: 0, h: 0 };
  const cy = point.region ? r.y + r.h / 2 : point.y;
  const fits = { above: r.y - CALLOUT.offset - h >= frame.y, below: r.y + r.h + CALLOUT.offset + h <= frame.y + frame.h };
  const chosen: CalloutSide = side ?? (fits.above ? "above" : "below");
  const raw =
    chosen === "above" ? { x: point.x - w / 2, y: r.y - CALLOUT.offset - h }
    : chosen === "below" ? { x: point.x - w / 2, y: r.y + r.h + CALLOUT.offset }
    : chosen === "left" ? { x: r.x - CALLOUT.offset - w, y: cy - h / 2 }
    : { x: r.x + r.w + CALLOUT.offset, y: cy - h / 2 };
  return {
    x: Math.min(Math.max(raw.x, frame.x + CALLOUT.inset), frame.x + frame.w - w - CALLOUT.inset),
    y: Math.min(Math.max(raw.y, frame.y + CALLOUT.inset), frame.y + frame.h - h - CALLOUT.inset),
    w,
    h,
  };
}

export const LIST = { pad: 20, title: 40, text: 28, textLineEm: 1.3, detail: 21, detailLineEm: 1.35, detailGap: 4, itemGap: 16, marker: 44, minScale: 0.7, readableScale: 0.8, maxScale: 1.5 } as const;

/**
 * The scale at which the list fills its box: up to 1.5× in a roomy box, down
 * to 0.7× in a tight one. Lists scale as a whole so items stay alike.
 */
export function listScale(e: Pick<ListEntity, "title" | "items">, box: Pick<Rect, "w" | "h">): number {
  for (let scale = LIST.maxScale; scale > LIST.minScale; scale -= 0.02) {
    if (listHeight(e, box, scale) <= box.h) return scale;
  }
  return LIST.minScale;
}

/** Height the list needs at `scale` (mirrors .list in visuals.css). */
export function listHeight(e: Pick<ListEntity, "title" | "items">, box: Pick<Rect, "w">, scale: number): number {
  {
    const w = box.w - 2 * LIST.pad - LIST.marker * scale;
    const items = e.items.map((it) => {
      const text = wrappedLines(it.text, LIST.text * scale, w, { metrics: INTER_SEMIBOLD }) * LIST.text * scale * LIST.textLineEm;
      const detail = it.detail ? LIST.detailGap + wrappedLines(it.detail, LIST.detail * scale, w, { metrics: INTER_REGULAR }) * LIST.detail * scale * LIST.detailLineEm : 0;
      return text + detail;
    });
    return 2 * LIST.pad + (e.title ? LIST.title * scale : 0) + items.reduce((a, b) => a + b, 0) + (e.items.length - 1) * LIST.itemGap * scale;
  }
}

export const ICON = { pad: 16, label: 26, labelLineEm: 1.2, sub: 18, subLineEm: 1.3, gap: 10, max: 180, min: 28, readable: 40 } as const;

/** Glyph size for an icon entity: as large as the box allows under its caption, up to ICON.max. */
export function iconSize(e: Pick<IconEntity, "label" | "sublabel">, box: Pick<Rect, "w" | "h">): number {
  const caption = (e.label ? ICON.gap + ICON.label * ICON.labelLineEm : 0) + (e.sublabel ? 4 + ICON.sub * ICON.subLineEm : 0);
  const room = Math.min(box.w - 2 * ICON.pad, box.h - 2 * ICON.pad - caption);
  return Math.max(ICON.min, Math.min(ICON.max, room));
}

/** Lists in one scene share the smallest of their scales, so side-by-side lists never differ in size. */
export function sceneListScale(entities: readonly { readonly type: string }[], boxOf: (e: ListEntity) => Pick<Rect, "w" | "h">): number {
  const lists = entities.filter((e): e is ListEntity => e.type === "list");
  return lists.length ? Math.min(...lists.map((e) => listScale(e, boxOf(e)))) : 1;
}

/** Stats in one scene share the smallest number size, so a row of figures reads as a set. */
export function sceneStatFont(entities: readonly { readonly type: string }[], boxOf: (e: StatEntity) => Pick<Rect, "w" | "h">): number {
  const stats = entities.filter((e): e is StatEntity => e.type === "stat");
  return stats.length ? Math.min(...stats.map((e) => statFit(e, boxOf(e)).valueFont)) : STAT_FONT_MAX;
}
