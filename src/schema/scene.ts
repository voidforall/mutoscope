import { z } from "zod";
import { Id } from "./common";
import { Claim } from "./analysis";
import { SourceRef } from "./source-ref";

/** Scenes are laid out on a fixed 12 x 8 grid over a 16:9 stage. */
export const GRID_COLS = 12;
export const GRID_ROWS = 8;

export const GridBox = z
  .object({
    col: z.number().int().min(1).max(GRID_COLS),
    row: z.number().int().min(1).max(GRID_ROWS),
    colSpan: z.number().int().min(1).max(GRID_COLS).default(2),
    rowSpan: z.number().int().min(1).max(GRID_ROWS).default(1),
  })
  .refine((b) => b.col + b.colSpan - 1 <= GRID_COLS, "box overflows the grid horizontally")
  .refine((b) => b.row + b.rowSpan - 1 <= GRID_ROWS, "box overflows the grid vertically");
export type GridBox = z.infer<typeof GridBox>;

export const Tone = z.enum(["neutral", "accent", "added", "removed", "warning", "muted"]);
export type Tone = z.infer<typeof Tone>;

const EntityBase = {
  id: Id,
  explanation: z.string().max(800).optional(),
  sourceRefs: z.array(SourceRef).default([]),
  tone: Tone.default("neutral"),
};

export const ComponentEntity = z.object({
  ...EntityBase,
  type: z.literal("component"),
  label: z.string().min(1).max(40),
  sublabel: z.string().max(60).optional(),
  layout: GridBox,
});

export const EdgeEntity = z.object({
  ...EntityBase,
  type: z.literal("edge"),
  from: Id,
  to: Id,
  label: z.string().max(40).optional(),
  style: z.enum(["solid", "dashed"]).default("solid"),
  arrow: z.enum(["end", "both", "none"]).default("end"),
});

const MAX_CODE_LINES = 24;
const codeText = z
  .string()
  .min(1)
  .refine((c) => c.split("\n").length <= MAX_CODE_LINES, `keep snippets to ${MAX_CODE_LINES} lines`);

export const CodeBlockEntity = z.object({
  ...EntityBase,
  type: z.literal("code-block"),
  label: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  code: codeText,
  /** Line number of the first snippet line in the real file. */
  startLine: z.number().int().positive().default(1),
  /** Real-file line numbers to emphasise. */
  highlightLines: z.array(z.number().int().positive()).default([]),
  /** Show the line-number gutter; turn off for text that is not from a file (protocols, formats, transcripts). */
  lineNumbers: z.boolean().default(true),
  layout: GridBox,
});

export const LabelEntity = z.object({
  ...EntityBase,
  type: z.literal("label"),
  text: z.string().min(1).max(280),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  align: z.enum(["start", "center"]).default("start"),
  layout: GridBox,
});

export const GroupEntity = z.object({
  ...EntityBase,
  type: z.literal("group"),
  label: z.string().max(40).optional(),
  children: z.array(Id).min(1),
});

export const DiffPanelEntity = z.object({
  ...EntityBase,
  type: z.literal("diff-panel"),
  label: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  before: codeText,
  after: codeText,
  layout: GridBox,
});

export const Entity = z.discriminatedUnion("type", [
  ComponentEntity,
  EdgeEntity,
  CodeBlockEntity,
  LabelEntity,
  GroupEntity,
  DiffPanelEntity,
]);
export type Entity = z.infer<typeof Entity>;
export type CodeBlockEntity = z.infer<typeof CodeBlockEntity>;
export type DiffPanelEntity = z.infer<typeof DiffPanelEntity>;
export type EntityType = Entity["type"];
export type BoxedEntity = Extract<Entity, { layout: GridBox }>;

const At = z.number().int().min(0);
const Duration = z.number().int().min(0).max(10_000).optional();
const targetAction = <T extends string>(action: T) =>
  z.object({ action: z.literal(action), atMs: At, target: Id, durationMs: Duration });

export const Action = z.discriminatedUnion("action", [
  targetAction("appear"),
  targetAction("disappear"),
  targetAction("highlight"),
  targetAction("dim"),
  targetAction("restore"),
  targetAction("connect"),
  targetAction("disconnect"),
  z.object({ action: z.literal("move"), atMs: At, target: Id, to: GridBox, durationMs: Duration }),
  z.object({ action: z.literal("replace"), atMs: At, target: Id, with: Id, durationMs: Duration }),
  /** Camera: frame `target`, or the whole stage when target is omitted. */
  z.object({ action: z.literal("focus"), atMs: At, target: Id.optional(), durationMs: Duration }),
]);
export type Action = z.infer<typeof Action>;
export type ActionName = Action["action"];

export const Cue = z.object({
  atMs: At,
  text: z.string().min(1).max(240),
});
export type Cue = z.infer<typeof Cue>;

export const Scene = z.object({
  id: Id,
  title: z.string().min(1).max(80),
  /** Short chapter label such as "Before", "The change", "Impact". */
  kicker: z.string().max(30).optional(),
  durationMs: z.number().int().min(2_000).max(180_000),
  narration: z.string().min(1).max(1200),
  /** Timed captions; when absent the narration is shown as one caption. */
  cues: z.array(Cue).default([]),
  entities: z.array(Entity).min(1).max(24),
  timeline: z.array(Action).default([]),
  claims: z.array(Claim).default([]),
});
export type Scene = z.infer<typeof Scene>;

export const ScenesFile = z.object({
  scenes: z.array(Scene).min(1).max(20),
});
export type ScenesFile = z.infer<typeof ScenesFile>;
