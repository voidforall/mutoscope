import { z } from "zod";
import { Id } from "./common";
import { ICON_NAMES } from "./icon-names";
import { SourceRef } from "./source-ref";

/** Scenes are laid out on a fixed 12 x 8 grid over a 16:9 stage. */
export const GRID_COLS = 12;
export const GRID_ROWS = 8;

export const GridBox = z
  .strictObject({
    col: z.number().int().min(1).max(GRID_COLS),
    row: z.number().int().min(1).max(GRID_ROWS),
    colSpan: z.number().int().min(1).max(GRID_COLS).default(2),
    rowSpan: z.number().int().min(1).max(GRID_ROWS).default(1),
  })
  .refine((b) => b.col + b.colSpan - 1 <= GRID_COLS, "box overflows the grid horizontally")
  .refine((b) => b.row + b.rowSpan - 1 <= GRID_ROWS, "box overflows the grid vertically");
export type GridBox = z.infer<typeof GridBox>;

/**
 * Named regions of the grid, so common compositions (a full-bleed title, a
 * split screen, three columns) need no arithmetic. Neighbouring regions never
 * overlap: the grid's gutters separate them.
 */
export const LAYOUT_PRESETS = {
  full: { col: 1, row: 1, colSpan: 12, rowSpan: 8 },
  center: { col: 3, row: 2, colSpan: 8, rowSpan: 6 },
  heading: { col: 1, row: 1, colSpan: 12, rowSpan: 2 },
  body: { col: 1, row: 3, colSpan: 12, rowSpan: 4 },
  footer: { col: 1, row: 7, colSpan: 12, rowSpan: 2 },
  left: { col: 1, row: 1, colSpan: 6, rowSpan: 8 },
  right: { col: 7, row: 1, colSpan: 6, rowSpan: 8 },
  top: { col: 1, row: 1, colSpan: 12, rowSpan: 4 },
  bottom: { col: 1, row: 5, colSpan: 12, rowSpan: 4 },
  "left-third": { col: 1, row: 1, colSpan: 4, rowSpan: 8 },
  "middle-third": { col: 5, row: 1, colSpan: 4, rowSpan: 8 },
  "right-third": { col: 9, row: 1, colSpan: 4, rowSpan: 8 },
  "left-two-thirds": { col: 1, row: 1, colSpan: 8, rowSpan: 8 },
  "right-two-thirds": { col: 5, row: 1, colSpan: 8, rowSpan: 8 },
  "top-left": { col: 1, row: 1, colSpan: 6, rowSpan: 4 },
  "top-right": { col: 7, row: 1, colSpan: 6, rowSpan: 4 },
  "bottom-left": { col: 1, row: 5, colSpan: 6, rowSpan: 4 },
  "bottom-right": { col: 7, row: 5, colSpan: 6, rowSpan: 4 },
} as const satisfies Record<string, GridBox>;
export type LayoutPreset = keyof typeof LAYOUT_PRESETS;

const PRESET_NAMES = Object.keys(LAYOUT_PRESETS) as [LayoutPreset, ...LayoutPreset[]];

/** A grid box, or the name of a preset region; always a GridBox once parsed. */
export const Layout = z.union([GridBox, z.enum(PRESET_NAMES).transform((name): GridBox => ({ ...LAYOUT_PRESETS[name] }))]);

/** One of the bundled Lucide icons (see icon-names.ts). */
export const Icon = z.enum(ICON_NAMES);

export const Tone = z.enum(["neutral", "accent", "added", "removed", "warning", "muted"]);
export type Tone = z.infer<typeof Tone>;

export const EntityBase = {
  id: Id,
  explanation: z.string().max(800).optional(),
  sourceRefs: z.array(SourceRef).default([]),
  tone: Tone.default("neutral"),
};

/**
 * How text enters when its entity appears: all at once (`fade`), one word at
 * a time (`words`), or one character at a time (`typewriter`). The build
 * runs over the `appear` action's duration.
 */
export const Reveal = z.enum(["fade", "words", "typewriter"]);
export type Reveal = z.infer<typeof Reveal>;

/**
 * A reel's look: palette and display type for the stage (the player around
 * it keeps its own light/dark theme). `studio` is the default.
 */
export const ReelStyle = z.enum(["studio", "editorial", "blueprint", "chalkboard", "terminal", "paper"]);
export type ReelStyle = z.infer<typeof ReelStyle>;

/** The surface behind a scene's entities. */
export const Backdrop = z.enum(["dots", "plain", "grid", "spotlight"]);
export type Backdrop = z.infer<typeof Backdrop>;
