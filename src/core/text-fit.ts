import { GRID_COLS, GRID_ROWS, type CodeBlockEntity, type DiffPanelEntity } from "../schema";
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
export const CODE_CHROME = { header: 38, pad: 28, rightPad: 14, diffColGap: 24, diffTag: 30 } as const;

function fit(lines: readonly string[], width: number, height: number, gutter: boolean): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const byWidth = width / (CHAR_EM * (longest + TRAILING_CHARS) + (gutter ? GUTTER_EM : 0));
  const byHeight = height / (Math.max(1, lines.length) * LINE_EM);
  return Math.max(CODE_FONT_MIN, Math.min(CODE_FONT_MAX, byWidth, byHeight));
}

export function codeBlockFont(e: Pick<CodeBlockEntity, "code" | "lineNumbers">, box: Pick<Rect, "w" | "h">): number {
  return fit(e.code.split("\n"), box.w - CODE_CHROME.pad - CODE_CHROME.rightPad, box.h - CODE_CHROME.header - CODE_CHROME.pad, e.lineNumbers);
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
/** Average glyph width of italic serif text, in em; a little generous so estimates err toward fitting. */
const QUOTE_CHAR_EM = 0.44;
const QUOTE_LINE_EM = 1.4;
const QUOTE_STEP = 0.5;
export const QUOTE_CHROME = { padX: 58, padY: 36, attribution: 34 } as const;

/** Lines `text` wraps to at `font` in `width`, word by word, like the browser. */
function wrappedLines(text: string, font: number, width: number): number {
  const perLine = Math.max(1, Math.floor(width / (font * QUOTE_CHAR_EM)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const need = (used === 0 ? 0 : 1) + word.length;
    if (used + need <= perLine) used += need;
    else {
      lines += Math.ceil(word.length / perLine);
      used = word.length % perLine;
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
    if (wrappedLines(shown, font, w) * font * QUOTE_LINE_EM <= h) return font;
  }
  return QUOTE_FONT_MIN;
}
