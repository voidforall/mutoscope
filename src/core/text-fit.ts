import { GRID_COLS, GRID_ROWS, type CodeBlockEntity, type DiffPanelEntity, type GridBox } from "../schema";
import { INTER_SEMIBOLD, SERIF_ITALIC } from "./font-metrics";
import { gridToRect, type Rect } from "./geometry";
import { diffLines } from "./line-diff";

/**
 * Font sizes for monospace text on the stage, shared by the player (which
 * renders them) and the validator (which warns when text gets too small), so
 * the two can never disagree. Units are stage units; ems mirror styles.css.
 */
export const CODE_FONT_MAX = 20;
export const CODE_FONT_MIN = 9;
/** Below this, code reads noticeably smaller than the rest of the stage. */
export const CODE_FONT_READABLE = 15;

const CHAR_EM = 0.61;
const LINE_EM = 1.5;
/** `.code-line .ln { width: 3.2em }` */
const GUTTER_EM = 3.2;
/** Breathing room after the longest line, in characters. */
const TRAILING_CHARS = 4;
export const CODE_CHROME = { header: 38, pad: 28, rightPad: 14, plainLeftPad: 16, diffColGap: 24, diffTag: 30 } as const;

function fit(lines: readonly string[], width: number, height: number, gutter: boolean): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const byWidth = width / (CHAR_EM * (longest + TRAILING_CHARS) + (gutter ? GUTTER_EM : 0));
  const byHeight = height / (Math.max(1, lines.length) * LINE_EM);
  return Math.max(CODE_FONT_MIN, Math.min(CODE_FONT_MAX, byWidth, byHeight));
}

export function codeBlockFont(e: Pick<CodeBlockEntity, "code" | "lineNumbers">, box: Pick<Rect, "w" | "h">): number {
  const width = box.w - CODE_CHROME.pad - CODE_CHROME.rightPad - (e.lineNumbers ? 0 : CODE_CHROME.plainLeftPad);
  return fit(e.code.split("\n"), width, box.h - CODE_CHROME.header - CODE_CHROME.pad, e.lineNumbers);
}

export function diffPanelFont(e: Pick<DiffPanelEntity, "before" | "after">, box: Pick<Rect, "w" | "h">): number {
  const d = diffLines(e.before, e.after);
  const rows = Math.max(d.before.length, d.after.length);
  const colWidth = (box.w - CODE_CHROME.pad - CODE_CHROME.diffColGap) / 2 - CODE_CHROME.rightPad;
  const bodyHeight = box.h - CODE_CHROME.header - CODE_CHROME.pad - CODE_CHROME.diffTag;
  const lines = [...d.before, ...d.after].map((l) => l.text);
  return Math.min(fit(lines, colWidth, Number.POSITIVE_INFINITY, true), bodyHeight / (rows * LINE_EM));
}

export type TextEntity = CodeBlockEntity | DiffPanelEntity;

export function textFont(e: TextEntity, box: Pick<Rect, "w" | "h">): number {
  return e.type === "code-block" ? codeBlockFont(e, box) : diffPanelFont(e, box);
}

/** The smallest grid footprint at which `e` renders at full size, keeping its position. */
export function spanForFullSize(e: TextEntity): { colSpan: number; rowSpan: number } | undefined {
  const { col, row } = e.layout;
  for (let rowSpan = e.layout.rowSpan; row + rowSpan - 1 <= GRID_ROWS; rowSpan++) {
    for (let colSpan = e.layout.colSpan; col + colSpan - 1 <= GRID_COLS; colSpan++) {
      if (textFont(e, gridToRect({ col, row, colSpan, rowSpan })) >= CODE_FONT_MAX - 0.01) return { colSpan, rowSpan };
    }
  }
  return undefined;
}

/** Pull quotes: proportional text that wraps. Mirrors `.node-quote` in styles.css. */
export const QUOTE_FONT_MAX = 34;
export const QUOTE_FONT_MIN = 14;
export const QUOTE_FONT_READABLE = 20;
const QUOTE_LINE_EM = 1.4;
const QUOTE_STEP = 0.5;
export const QUOTE_CHROME = { padX: 58, padY: 36, attribution: 34 } as const;

type Metrics = Readonly<Record<string, number>>;
/** Characters missing from a table (other scripts, symbols) fall back to system fonts; assume they are wide. */
const UNKNOWN_EM = 0.9;
/** Kerning and rounding: err slightly toward wrapping. */
const METRIC_MARGIN = 1.02;

/** Advance of `text` in em, from per-character widths measured off the bundled fonts. */
export function proportionalEm(text: string, m: Metrics = INTER_SEMIBOLD): number {
  let em = 0;
  for (const ch of text) em += m[ch] ?? UNKNOWN_EM;
  return em * METRIC_MARGIN;
}

/** Lines `text` wraps to at `font` in `width`, word by word, like the browser. `monoEm` switches to fixed-width text. */
function wrappedLines(text: string, font: number, width: number, style: { readonly metrics?: Metrics; readonly monoEm?: number } = {}): number {
  const advance = (s: string) => (style.monoEm === undefined ? proportionalEm(s, style.metrics) : s.length * style.monoEm) * font;
  const space = advance(" ");
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = advance(word);
    if (used > 0 && used + space + w <= width) used += space + w;
    else if (used === 0 && w <= width) used = w;
    else {
      lines += used === 0 ? Math.ceil(w / width) - 1 : Math.ceil(w / width);
      used = w % width;
    }
  }
  return lines;
}

/** The largest size at which the quote (with its typographic marks) wraps inside the box. */
export function quoteFont(text: string, attributed: boolean, box: Pick<Rect, "w" | "h">): number {
  const w = box.w - QUOTE_CHROME.padX;
  const h = box.h - QUOTE_CHROME.padY - (attributed ? QUOTE_CHROME.attribution : 0);
  const shown = `“${text}”`;
  for (let font = QUOTE_FONT_MAX; font > QUOTE_FONT_MIN; font -= QUOTE_STEP) {
    if (wrappedLines(shown, font, w, { metrics: SERIF_ITALIC }) * font * QUOTE_LINE_EM <= h) return font;
  }
  return QUOTE_FONT_MIN;
}

/**
 * Component boxes: a bold title (≤ 2 lines) over a mono sublabel (≤ 2 lines),
 * clamped by CSS, so text that needs more is silently cut. Mirrors
 * `.node-component`, `.node-title` and `.node-sub` in styles.css.
 */
/** 10px vertical padding + 2px borders; flex may squeeze the text a few px into them unnoticed. */
const COMPONENT = { padX: 32, padY: 24, squeeze: 4, gap: 6, maxLines: 2 } as const;
const TITLE = { font: 29, lineEm: 1.15 } as const;
const SUB = { font: 18, lineEm: 1.25, monoEm: 0.6 } as const;

export function componentTextFits(e: { readonly label: string; readonly sublabel?: string }, box: Pick<Rect, "w" | "h">): boolean {
  const w = box.w - COMPONENT.padX;
  const titleLines = wrappedLines(e.label, TITLE.font, w, { metrics: INTER_SEMIBOLD });
  const subLines = e.sublabel ? wrappedLines(e.sublabel, SUB.font, w, { monoEm: SUB.monoEm }) : 0;
  if (titleLines > COMPONENT.maxLines || subLines > COMPONENT.maxLines) return false;
  const height = titleLines * TITLE.font * TITLE.lineEm + (subLines ? COMPONENT.gap + subLines * SUB.font * SUB.lineEm : 0);
  return height <= box.h - COMPONENT.padY + COMPONENT.squeeze;
}

/** The smallest widening (then heightening) at which a component's text fits, keeping its position. */
export function componentSpanThatFits(e: { readonly label: string; readonly sublabel?: string; readonly layout: GridBox }): { colSpan: number; rowSpan: number } | undefined {
  const { col, row } = e.layout;
  for (let rowSpan = e.layout.rowSpan; row + rowSpan - 1 <= GRID_ROWS; rowSpan++) {
    for (let colSpan = e.layout.colSpan; col + colSpan - 1 <= GRID_COLS; colSpan++) {
      if (componentTextFits(e, gridToRect({ col, row, colSpan, rowSpan }))) return { colSpan, rowSpan };
    }
  }
  return undefined;
}

