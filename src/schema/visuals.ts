import { z } from "zod";
import { DATA_FILE } from "./source-ref";
import { EntityBase, Icon, Layout, Reveal, Tone } from "./stage";

/**
 * Entities beyond boxes and arrows: display type, numbers, charts, time,
 * images and tables. Each one that has parts (words, bars, events, rows,
 * callouts) builds them in over its `appear` action.
 */

const finite = z.number().refine(Number.isFinite, "must be a finite number");

/** How rows that share a category (or match a stat's filter) combine into one number. `none` requires exactly one row. */
export const Aggregate = z.enum(["none", "sum", "mean", "min", "max", "count"]);
export type Aggregate = z.infer<typeof Aggregate>;

const dataBinding = {
  /** A dataset pinned with `mutoscope ingest data`. */
  file: z.string().regex(DATA_FILE),
  aggregate: Aggregate.default("none"),
  /** Keep only rows whose columns equal these values, e.g. { "region": "EU" }. */
  where: z.record(z.string().min(1), z.string()).default({}),
  /** Multiply the data by this before comparing, e.g. 0.001 to show thousands. */
  scale: z.number().positive().default(1),
};

/** Display type: a title card, a thesis, a chapter break. Shrinks to fit its box. */
export const HeadlineEntity = z.strictObject({
  ...EntityBase,
  type: z.literal("headline"),
  text: z.string().trim().min(1).max(160),
  /** Small uppercase line above the text: a chapter, a date, a source. */
  eyebrow: z.string().trim().max(40).optional(),
  size: z.enum(["lg", "xl", "display"]).default("xl"),
  align: z.enum(["start", "center"]).default("center"),
  reveal: Reveal.default("fade"),
  layout: Layout,
});

/** One number that matters, counting up from `from` as it appears. */
export const StatEntity = z.strictObject({
  ...EntityBase,
  type: z.literal("stat"),
  value: finite,
  from: finite.default(0),
  /** Digits after the decimal point; defaults to as many as `value` has. */
  decimals: z.number().int().min(0).max(4).optional(),
  prefix: z.string().max(4).optional(),
  suffix: z.string().max(10).optional(),
  label: z.string().trim().min(1).max(80),
  /** A short comparison under the label, such as "down from 1.2 s". */
  note: z.string().trim().max(60).optional(),
  countUp: z.boolean().default(true),
  /** Where the number comes from; validate recomputes it from the pinned dataset. `column` may be omitted for `count`. */
  data: z.strictObject({ ...dataBinding, column: z.string().min(1).optional() }).optional(),
  layout: Layout,
});

export const ChartSeries = z.strictObject({
  name: z.string().trim().min(1).max(30),
  values: z.array(finite).min(1).max(16),
  tone: Tone.optional(),
  /** With chart `data`: the dataset column this series plots. */
  column: z.string().min(1).optional(),
  /** With chart `data`: rows for this series only, e.g. { "entity": "Africa" } for long-format data. */
  where: z.record(z.string().min(1), z.string()).optional(),
});

export const ChartEntity = z
  .object({
    ...EntityBase,
    type: z.literal("chart"),
    /** `bar` runs horizontally (long category names), `column` vertically, `line`/`area` over an ordered axis. */
    kind: z.enum(["bar", "column", "line", "area"]),
    title: z.string().trim().max(80).optional(),
    /** Unit appended to values and the axis, such as "ms", "%", "k". */
    unit: z.string().max(12).optional(),
    categories: z.array(z.string().trim().min(1).max(24)).min(1).max(16),
    series: z.array(ChartSeries).min(1).max(4),
    /** `log` for values spanning orders of magnitude (errors, sizes, costs); all values must be positive. */
    scale: z.enum(["linear", "log"]).default("linear"),
    /** Axis bounds; default to 0 (or the lowest value, if negative) and a rounded maximum. */
    min: finite.optional(),
    max: finite.optional(),
    /** Categories to emphasise; the rest are muted. */
    highlight: z.array(z.string()).default([]),
    valueLabels: z.boolean().default(true),
    /** Where the numbers come from: `category` names the column holding the categories; each series names its `column`. */
    data: z
      .strictObject({
        ...dataBinding,
        category: z.string().min(1),
        /** The category column's value for each category, when the label shown differs ("Latin America" for "Latin America and the Caribbean"). */
        categoryKeys: z.array(z.string().min(1)).optional(),
      })
      .optional(),
    layout: Layout,
  })
  .superRefine((c, ctx) => {
    if (c.data?.categoryKeys && c.data.categoryKeys.length !== c.categories.length) {
      ctx.addIssue({ code: "custom", path: ["data", "categoryKeys"], message: `has ${c.data.categoryKeys.length} keys for ${c.categories.length} categories` });
    }
    if (c.data && c.data.aggregate !== "count") {
      c.series.forEach((s, i) => {
        if (!s.column) ctx.addIssue({ code: "custom", path: ["series", i, "column"], message: "name the dataset column this series plots" });
      });
    }
    c.series.forEach((s, i) => {
      if (s.values.length !== c.categories.length) {
        ctx.addIssue({ code: "custom", path: ["series", i, "values"], message: `has ${s.values.length} values for ${c.categories.length} categories` });
      }
    });
    for (const h of c.highlight) {
      if (!c.categories.includes(h)) ctx.addIssue({ code: "custom", path: ["highlight"], message: `'${h}' is not a category` });
    }
    if ((c.kind === "line" || c.kind === "area") && c.categories.length < 2) {
      ctx.addIssue({ code: "custom", path: ["categories"], message: `a ${c.kind} chart needs at least 2 categories` });
    }
    if (c.scale === "log" && (c.series.some((s) => s.values.some((v) => v <= 0)) || (c.min ?? 1) <= 0)) {
      ctx.addIssue({ code: "custom", path: ["scale"], message: "a log scale needs every value (and min) above 0" });
    }
    if (c.min !== undefined && c.max !== undefined && c.min >= c.max) ctx.addIssue({ code: "custom", path: ["max"], message: "max must be greater than min" });
  });

export const TimeEvent = z.strictObject({
  /** Position on the axis: a year, a day number, a version — any increasing number. */
  at: finite,
  label: z.string().trim().min(1).max(40),
  /** What to print for the time; defaults to `at`. */
  when: z.string().trim().max(20).optional(),
  detail: z.string().trim().max(60).optional(),
  tone: Tone.optional(),
});

export const TimeSpan = z
  .object({ from: finite, to: finite, label: z.string().trim().min(1).max(30), tone: Tone.optional() })
  .refine((s) => s.from < s.to, "a span's 'from' must be before its 'to'");

/** Events on a horizontal axis, with optional shaded eras. Builds left to right. */
export const TimeAxisEntity = z
  .object({
    ...EntityBase,
    type: z.literal("time-axis"),
    title: z.string().trim().max(80).optional(),
    events: z.array(TimeEvent).min(1).max(12),
    spans: z.array(TimeSpan).max(6).default([]),
    min: finite.optional(),
    max: finite.optional(),
    layout: Layout,
  })
  .refine((t) => t.min === undefined || t.max === undefined || t.min < t.max, { message: "max must be greater than min", path: ["max"] });

export const IMAGE_SRC = /^assets\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif|svg)$/i;

export const Callout = z
  .object({
    /** Point (or region's top-left corner) as a fraction of the image, 0..1 from the left / top. */
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    /** Region size as a fraction of the image; omit for a point. */
    w: z.number().gt(0).max(1).optional(),
    h: z.number().gt(0).max(1).optional(),
    label: z.string().trim().min(1).max(40),
    /** Where the tag goes relative to the point or region; default above (below when there is no room). */
    side: z.enum(["above", "below", "left", "right"]).optional(),
  })
  .refine((c) => (c.w === undefined) === (c.h === undefined), "give a region both w and h, or neither")
  .refine((c) => c.x + (c.w ?? 0) <= 1.0001 && c.y + (c.h ?? 0) <= 1.0001, "region extends past the image");

/** A picture from the reel's own assets/ folder, with optional callouts that build in one by one. */
export const ImageEntity = z.strictObject({
  ...EntityBase,
  type: z.literal("image"),
  /** Path inside the reel directory, under assets/ — never a URL, so nothing loads from the network. */
  src: z.string().regex(IMAGE_SRC, "src must be a .png, .jpg, .webp, .gif or .svg file under assets/"),
  alt: z.string().trim().min(1).max(200),
  fit: z.enum(["contain", "cover"]).default("contain"),
  caption: z.string().trim().max(140).optional(),
  /** Where the image comes from: "Photo: NASA", "Figure 3 of the paper". */
  credit: z.string().trim().max(80).optional(),
  callouts: z.array(Callout).max(6).default([]),
  /** Show only this part of the picture (fractions of it); callouts still use whole-picture fractions. */
  crop: z
    .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) })
    .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "crop extends past the picture")
    .optional(),
  layout: Layout,
});

export const TableEntity = z
  .object({
    ...EntityBase,
    type: z.literal("table"),
    title: z.string().trim().max(80).optional(),
    /** Column headers; leave the first one empty ("") when that column labels the rows. */
    columns: z.array(z.string().trim().max(24)).min(1).max(6),
    rows: z.array(z.array(z.string().trim().max(40))).min(1).max(10),
    /** Zero-based row indexes to emphasise. */
    highlightRows: z.array(z.number().int().min(0)).default([]),
    /** Per-column alignment; numbers read best aligned to the end. */
    align: z.array(z.enum(["start", "center", "end"])).optional(),
    layout: Layout,
  })
  .superRefine((t, ctx) => {
    t.rows.forEach((r, i) => {
      if (r.length !== t.columns.length) ctx.addIssue({ code: "custom", path: ["rows", i], message: `has ${r.length} cells for ${t.columns.length} columns` });
    });
    if (t.align && t.align.length !== t.columns.length) ctx.addIssue({ code: "custom", path: ["align"], message: `has ${t.align.length} entries for ${t.columns.length} columns` });
    for (const h of t.highlightRows) {
      if (h >= t.rows.length) ctx.addIssue({ code: "custom", path: ["highlightRows"], message: `row ${h} does not exist` });
    }
  });

export const ListItem = z.strictObject({
  text: z.string().trim().min(1).max(100),
  detail: z.string().trim().max(120).optional(),
  /** Overrides the list's marker for this item: a tick for a pro, a cross for a con. */
  mark: z.enum(["check", "cross", "dot", "none"]).optional(),
  /** An icon in place of the marker. */
  icon: Icon.optional(),
  tone: Tone.optional(),
});

/** Steps, key points, pros and cons. Items build in one by one. */
export const ListEntity = z.strictObject({
  ...EntityBase,
  type: z.literal("list"),
  title: z.string().trim().max(80).optional(),
  style: z.enum(["bullets", "numbered", "checks"]).default("bullets"),
  items: z.array(ListItem).min(1).max(8),
  layout: Layout,
});

/** A single pictogram, optionally captioned: a metaphor, an actor, a place. */
export const IconEntity = z.strictObject({
  ...EntityBase,
  type: z.literal("icon"),
  name: Icon,
  label: z.string().trim().max(40).optional(),
  sublabel: z.string().trim().max(60).optional(),
  layout: Layout,
});

export type HeadlineEntity = z.infer<typeof HeadlineEntity>;
export type IconEntity = z.infer<typeof IconEntity>;
export type ListEntity = z.infer<typeof ListEntity>;
export type StatEntity = z.infer<typeof StatEntity>;
export type ChartEntity = z.infer<typeof ChartEntity>;
export type TimeAxisEntity = z.infer<typeof TimeAxisEntity>;
export type ImageEntity = z.infer<typeof ImageEntity>;
export type TableEntity = z.infer<typeof TableEntity>;
