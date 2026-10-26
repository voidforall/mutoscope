import { z } from "zod";
import { Id } from "./common";
import { Claim } from "./analysis";
import { MAX_QUOTE } from "./source-ref";
import { Backdrop, EntityBase, Layout, Reveal, type GridBox } from "./stage";
import { ChartEntity, HeadlineEntity, ImageEntity, ListEntity, StatEntity, TableEntity, TimeAxisEntity } from "./visuals";

export * from "./stage";
export * from "./visuals";

export const ComponentEntity = z.object({
  ...EntityBase,
  type: z.literal("component"),
  label: z.string().min(1).max(40),
  sublabel: z.string().max(60).optional(),
  layout: Layout,
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
  layout: Layout,
});

export const LabelEntity = z.object({
  ...EntityBase,
  type: z.literal("label"),
  text: z.string().min(1).max(280),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  align: z.enum(["start", "center"]).default("start"),
  reveal: Reveal.default("fade"),
  layout: Layout,
});

export const GroupEntity = z.object({
  ...EntityBase,
  type: z.literal("group"),
  label: z.string().max(40).optional(),
  children: z.array(Id).min(1),
});

/** Verbatim words from a source, shown as a pull quote. Checked against pinned documents. */
export const QuoteEntity = z.object({
  ...EntityBase,
  type: z.literal("quote"),
  text: z.string().trim().min(1).max(MAX_QUOTE),
  /** Who said or wrote it, e.g. "Simon, the author". */
  attribution: z.string().max(80).optional(),
  layout: Layout,
});

export const DiffPanelEntity = z.object({
  ...EntityBase,
  type: z.literal("diff-panel"),
  label: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  before: codeText,
  after: codeText,
  layout: Layout,
});

export const Entity = z.discriminatedUnion("type", [
  ComponentEntity,
  EdgeEntity,
  CodeBlockEntity,
  LabelEntity,
  GroupEntity,
  DiffPanelEntity,
  QuoteEntity,
  HeadlineEntity,
  StatEntity,
  ChartEntity,
  TimeAxisEntity,
  ImageEntity,
  TableEntity,
  ListEntity,
]);
export type Entity = z.infer<typeof Entity>;
export type CodeBlockEntity = z.infer<typeof CodeBlockEntity>;
export type DiffPanelEntity = z.infer<typeof DiffPanelEntity>;
export type QuoteEntity = z.infer<typeof QuoteEntity>;
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
  z.object({ action: z.literal("move"), atMs: At, target: Id, to: Layout, durationMs: Duration }),
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
  /** The surface behind the entities: dots (default), plain, grid (graph paper) or spotlight (a soft centre glow). */
  backdrop: Backdrop.default("dots"),
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
