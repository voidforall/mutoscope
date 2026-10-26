import { describe, expect, it } from "vitest";
import {
  chartLayout,
  findVisualIssues,
  gridToRect,
  headlineFont,
  HEADLINE_FONT,
  niceDomain,
  partProgress,
  revealWords,
  sceneStateAt,
  statText,
  tableLayout,
  timeAxisLayout,
  typewriterCount,
} from "../../src/core";
import { ChartEntity, HeadlineEntity, ImageEntity, Scene, StatEntity, TableEntity, TimeAxisEntity } from "../../src/schema";

const sceneWith = (entities: object[], timeline: object[] = [], extra: object = {}) =>
  Scene.parse({ id: "s", title: "S", durationMs: 10_000, narration: "n", entities, timeline, ...extra });

const chart = (over: object = {}) =>
  ChartEntity.parse({
    id: "c",
    type: "chart",
    kind: "column",
    categories: ["2022", "2023", "2024"],
    series: [{ name: "Users", values: [12, 30, 47] }],
    layout: { col: 1, row: 1, colSpan: 8, rowSpan: 6 },
    ...over,
  });

describe("schema", () => {
  it("accepts named layout regions and resolves them to grid boxes", () => {
    const s = sceneWith([{ id: "h", type: "headline", text: "Hello", layout: "left" }], [{ action: "move", atMs: 0, target: "h", to: "right" }]);
    const h = s.entities[0] as HeadlineEntity;
    expect(h.layout).toEqual({ col: 1, row: 1, colSpan: 6, rowSpan: 8 });
    expect(s.timeline[0]).toMatchObject({ to: { col: 7, row: 1, colSpan: 6, rowSpan: 8 } });
    expect(s.backdrop).toBe("dots");
  });

  it("rejects charts whose series do not match the categories", () => {
    const r = ChartEntity.safeParse({ ...chart(), series: [{ name: "x", values: [1, 2] }], highlight: ["2030"] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toEqual(expect.arrayContaining(["has 2 values for 3 categories", "'2030' is not a category"]));
  });

  it("only takes images from the reel's assets folder", () => {
    const base = { id: "i", type: "image", alt: "x", layout: "full" };
    expect(ImageEntity.safeParse({ ...base, src: "assets/shots/home.png" }).success).toBe(true);
    for (const src of ["https://example.com/a.png", "assets/../secret.png", "/etc/a.png", "assets/a.exe", "assets/.hidden.png"]) {
      expect(ImageEntity.safeParse({ ...base, src }).success, src).toBe(false);
    }
  });

  it("checks table shape", () => {
    const r = TableEntity.safeParse({ id: "t", type: "table", columns: ["a", "b"], rows: [["1"]], highlightRows: [3], layout: "full" });
    expect(r.error?.issues.map((i) => i.message)).toEqual(expect.arrayContaining(["has 1 cells for 2 columns", "row 3 does not exist"]));
  });
});

describe("builds", () => {
  it("staggers parts across the build", () => {
    expect(partProgress(0, 0, 4)).toBe(0);
    expect(partProgress(1, 3, 4)).toBe(1);
    expect(partProgress(0.5, 0, 4)).toBe(1);
    expect(partProgress(0.5, 3, 4)).toBe(0);
    expect(partProgress(0.6, 0, 1)).toBeCloseTo(0.6);
  });

  it("reveals a headline word by word over a default duration that scales with its length", () => {
    const s = sceneWith(
      [{ id: "h", type: "headline", text: "one two three four five six", reveal: "words", layout: "center" }],
      [{ action: "appear", atMs: 1000, target: "h" }],
    );
    expect(sceneStateAt(s, 0).entities.h).toMatchObject({ opacity: 0, reveal: 0 });
    const mid = sceneStateAt(s, 1300).entities.h!;
    expect(mid.opacity).toBe(1);
    expect(mid.reveal).toBeGreaterThan(0);
    expect(mid.reveal).toBeLessThan(1);
    expect(sceneStateAt(s, 4000).entities.h?.reveal).toBe(1);
  });

  it("keeps a plain fade's reveal complete, and entities that never appear fully built", () => {
    const s = sceneWith(
      [
        { id: "a", type: "headline", text: "Fade", layout: "heading" },
        { id: "b", type: "chart", kind: "bar", categories: ["x"], series: [{ name: "s", values: [1] }], layout: "body" },
      ],
      [{ action: "appear", atMs: 0, target: "a", durationMs: 1000 }],
    );
    expect(sceneStateAt(s, 500).entities.a?.reveal).toBe(1);
    expect(sceneStateAt(s, 0).entities.b?.reveal).toBe(1);
  });

  it("splits words for reveal and counts typewriter characters", () => {
    const words = revealWords("Hello brave  world", 0.5);
    expect(words.map((w) => w.text)).toEqual(["Hello", " ", "brave", "  ", "world"]);
    expect(words[0]!.p).toBe(1);
    expect(words.at(-1)!.p).toBe(0);
    expect(typewriterCount("abcd", 0.5)).toBe(2);
    expect(typewriterCount("abcd", 1)).toBe(4);
  });

  it("counts a stat up with fixed decimals and separators", () => {
    const stat = StatEntity.parse({ id: "s", type: "stat", value: 12500.5, prefix: "$", suffix: "/mo", label: "Revenue", layout: "center" });
    expect(statText(stat, 1)).toBe("$12,500.5/mo");
    expect(statText(stat, 0)).toBe("$0.0/mo");
    expect(statText({ ...stat, countUp: false }, 0)).toBe("$12,500.5/mo");
  });
});

describe("chart layout", () => {
  it("rounds the axis to a readable domain", () => {
    expect(niceDomain([12, 30, 47])).toMatchObject({ min: 0, max: 50 });
    expect(niceDomain([-3, 8])).toMatchObject({ min: -5, max: 10 });
    expect(niceDomain([0.2, 0.9], 0, 1)).toMatchObject({ min: 0, max: 1 });
  });

  it("grows columns from the baseline and keeps everything inside the box", () => {
    const box = gridToRect(chart().layout);
    const full = chartLayout(chart(), box, 1);
    const half = chartLayout(chart(), box, 0.5);
    expect(full.bars).toHaveLength(3);
    for (const b of full.bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(box.w);
      expect(b.y + b.h).toBeLessThanOrEqual(box.h);
    }
    expect(full.bars[2]!.h).toBeGreaterThan(full.bars[0]!.h);
    expect(half.bars[0]!.h).toBeLessThanOrEqual(full.bars[0]!.h);
    expect(half.bars[2]!.h).toBeLessThan(full.bars[2]!.h);
    expect(full.bars[2]!.y + full.bars[2]!.h).toBeCloseTo(full.bars[0]!.y + full.bars[0]!.h);
  });

  it("flags category labels too long for their slot", () => {
    const long = chart({ categories: ["Extremely long category", "Another long category", "Third"], layout: { col: 1, row: 1, colSpan: 4, rowSpan: 4 } });
    const l = chartLayout(long, gridToRect(long.layout), 1);
    expect(l.labels.some((x) => x.truncated)).toBe(true);
  });

  it("draws lines through every category", () => {
    const line = chart({ kind: "line", series: [{ name: "a", values: [1, 2, 3] }, { name: "b", values: [3, 2, 1] }] });
    const l = chartLayout(line, gridToRect(line.layout), 1);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[0]!.points).toHaveLength(3);
    expect(l.legend.map((x) => x.name)).toEqual(["a", "b"]);
  });
});

describe("time axis layout", () => {
  const axis = (events: object[], layout: object = { col: 1, row: 3, colSpan: 12, rowSpan: 4 }) =>
    TimeAxisEntity.parse({ id: "t", type: "time-axis", events, layout });

  it("places events in order along the axis", () => {
    const t = axis([{ at: 2000, label: "A" }, { at: 1990, label: "B" }, { at: 2020, label: "C" }]);
    const l = timeAxisLayout(t, gridToRect(t.layout));
    const xs = Object.fromEntries(l.events.map((e) => [e.label, e.x]));
    expect(xs.B).toBeLessThan(xs.A!);
    expect(xs.A).toBeLessThan(xs.C!);
    expect(l.collisions).toEqual([]);
  });

  it("reports labels that cannot be placed without colliding", () => {
    const crowded = axis(
      Array.from({ length: 8 }, (_, i) => ({ at: 2000 + i * 0.1, label: `A fairly long event ${i}` })),
      { col: 1, row: 3, colSpan: 6, rowSpan: 3 },
    );
    expect(timeAxisLayout(crowded, gridToRect(crowded.layout)).collisions.length).toBeGreaterThan(0);
  });
});

describe("text fitting for display type and tables", () => {
  it("sizes headlines to their box and never above the size's maximum", () => {
    const h = HeadlineEntity.parse({ id: "h", type: "headline", text: "Short", size: "display", layout: "full" });
    expect(headlineFont(h, gridToRect(h.layout))).toBe(HEADLINE_FONT.display);
    const long = HeadlineEntity.parse({ ...h, text: "A much longer headline that has to wrap over several lines to fit", layout: { col: 1, row: 1, colSpan: 4, rowSpan: 2 } });
    expect(headlineFont(long, gridToRect(long.layout))).toBeLessThan(HEADLINE_FONT.display);
  });

  it("reports tables that overflow their box", () => {
    const t = TableEntity.parse({
      id: "t",
      type: "table",
      columns: ["Name", "Description", "Value"],
      rows: Array.from({ length: 8 }, () => ["Something", "A long description cell here", "123"]),
      layout: { col: 1, row: 1, colSpan: 4, rowSpan: 2 },
    });
    const l = tableLayout(t, gridToRect(t.layout));
    expect(l.overflowY).toBe(true);
    expect(l.overflowX).toBe(true);
  });
});

describe("visual validation", () => {
  it("errors on images missing from the bundled assets and warns on cramped visuals", () => {
    const s = sceneWith([
      { id: "pic", type: "image", src: "assets/missing.png", alt: "x", layout: "left" },
      { id: "t", type: "time-axis", events: Array.from({ length: 8 }, (_, i) => ({ at: i * 0.1, label: `Crowded event label ${i}` })), layout: { col: 7, row: 1, colSpan: 6, rowSpan: 3 } },
      { id: "h", type: "headline", text: "A long headline squeezed into a tiny box that cannot hold it", size: "display", layout: { col: 7, row: 6, colSpan: 2, rowSpan: 1 } },
    ]);
    const { errors, warnings } = findVisualIssues(s, "p", {});
    expect(errors.map((e) => e.message)).toEqual([expect.stringMatching(/image 'pic': assets\/missing.png is not in the reel's assets folder/)]);
    const text = warnings.map((w) => w.message).join("\n");
    expect(text).toMatch(/time-axis 't'.*collide/);
    expect(text).toMatch(/headline 'h' shrinks to \d+px/);
  });
});
