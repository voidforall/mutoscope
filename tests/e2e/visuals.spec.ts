import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gridToRect, headlineFont, HEADLINE_FONT_READABLE, statFit, tableLayout, timeAxisLayout } from "../../src/core";
import { HeadlineEntity, StatEntity, TableEntity, TimeAxisEntity } from "../../src/schema";

// A reel made of the non-diagram visuals, built with the real CLI and opened from disk.
const run = promisify(execFile);
let root: string;
let page: string;

const HEADLINES = ["Ship it", "Every scene does not have to be a diagram", "Fifty years of the terminal, from teletypes to agents", "Why the cache line matters more than the lock"];
const HEADLINE_BOXES = [
  { col: 1, row: 1, colSpan: 12, rowSpan: 2 },
  { col: 1, row: 3, colSpan: 6, rowSpan: 2 },
  { col: 7, row: 3, colSpan: 6, rowSpan: 3 },
  { col: 1, row: 6, colSpan: 4, rowSpan: 3 },
];
const SIZES = ["lg", "xl", "display"] as const;
const headlines = HEADLINES.flatMap((text, ti) => SIZES.map((size, si) => HeadlineEntity.parse({ id: `h-${ti}-${si}`, type: "headline", text, size, eyebrow: si === 1 ? "Chapter two" : undefined, layout: HEADLINE_BOXES[ti]! })));

const stats = [
  StatEntity.parse({ id: "st-1", type: "stat", value: 3.4, suffix: "×", label: "faster cold start", note: "down from 2.1 s", layout: { col: 1, row: 1, colSpan: 3, rowSpan: 3 } }),
  StatEntity.parse({ id: "st-2", type: "stat", value: 1250000, prefix: "$", label: "saved per year on compute across every region", layout: { col: 4, row: 1, colSpan: 4, rowSpan: 3 } }),
  StatEntity.parse({ id: "st-3", type: "stat", value: 98.6, suffix: "%", label: "requests under 100 ms", layout: { col: 8, row: 1, colSpan: 5, rowSpan: 2 } }),
];
const table = TableEntity.parse({
  id: "tb",
  type: "table",
  title: "Panels",
  columns: ["Tab", "Shows", "Since"],
  rows: [["Scene", "claims, scenes", "v0"], ["Inspect", "source, analysis", "v0"], ["Ask", "live Q&A", "v0.2"], ["Threads", "discussions", "v0.1"]],
  highlightRows: [2],
  align: ["start", "start", "end"],
  layout: { col: 1, row: 4, colSpan: 6, rowSpan: 4 },
});
const axis = TimeAxisEntity.parse({
  id: "ax",
  type: "time-axis",
  title: "Fifty years of the terminal",
  events: [
    { at: 1971, label: "Unix shell", detail: "Thompson shell" },
    { at: 1978, label: "VT100 escape codes" },
    { at: 1989, label: "Bash 1.0" },
    { at: 2003, label: "zsh 4", detail: "themes, completion" },
    { at: 2017, label: "GPU terminals" },
    { at: 2025, label: "Agents in the shell" },
  ],
  spans: [{ from: 1970, to: 1990, label: "Hardware terminals" }, { from: 1990, to: 2026, label: "Emulators" }],
  layout: { col: 1, row: 1, colSpan: 12, rowSpan: 6 },
});

const scene = (id: string, entities: object[], timeline: object[] = [], extra: object = {}) => ({ id, title: id, durationMs: 10_000, narration: "n", entities, timeline, claims: [], cues: [], ...extra });

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mutoscope-visuals-"));
  const reel = join(root, "reel");
  await cp(resolve("examples/spsc-evolution"), reel, { recursive: true });
  await rm(join(reel, "analysis.json"));
  await mkdir(join(reel, "assets"));
  await cp(resolve("docs/media/player-dark.png"), join(reel, "assets", "player.png"));
  const { entrySceneId: _entry, ...manifest } = JSON.parse(await readFile(join(reel, "manifest.json"), "utf8"));
  await writeFile(join(reel, "manifest.json"), JSON.stringify(manifest));
  const perScene = 4;
  const headlineScenes = Array.from({ length: Math.ceil(headlines.length / perScene) }, (_, i) => scene(`headlines-${i}`, headlines.slice(i * perScene, (i + 1) * perScene)));
  const scenes = [
    scene("build", [{ id: "words", type: "headline", text: "one two three four five six seven eight", reveal: "words", layout: "heading" }, { id: "count", type: "stat", value: 1000, label: "requests", layout: { col: 1, row: 4, colSpan: 4, rowSpan: 3 } }], [
      { action: "appear", atMs: 0, target: "words", durationMs: 4000 },
      { action: "appear", atMs: 0, target: "count", durationMs: 4000 },
    ], { backdrop: "spotlight" }),
    ...headlineScenes,
    scene("stats-table", [...stats, table], [], { backdrop: "grid" }),
    scene("axis", [axis], [], { backdrop: "plain" }),
    scene("chart", [{ id: "ch", type: "chart", kind: "column", title: "Users", unit: "k", categories: ["2021", "2022", "2023"], series: [{ name: "Users", values: [12, 30, 47] }], highlight: ["2023"], layout: "left" }, { id: "ln", type: "chart", kind: "line", categories: ["a", "b", "c"], series: [{ name: "x", values: [1, 3, 2] }, { name: "y", values: [2, 1, 3] }], layout: "right" }], [{ action: "appear", atMs: 1000, target: "ch", durationMs: 2000 }]),
    scene("list", [
      { id: "steps", type: "list", title: "Steps", style: "numbered", items: [{ text: "Install the CLI", detail: "npx skills add voidforall/mutoscope" }, { text: "Ingest a source" }, { text: "Write the storyboard and validate it", detail: "zero warnings before you look" }, { text: "Publish" }], layout: "left" },
      { id: "pros", type: "list", style: "checks", items: [{ text: "Checked against the source" }, { text: "Hotlinks images", mark: "cross" }, { text: "Plays offline" }], layout: { col: 7, row: 2, colSpan: 6, rowSpan: 4 } },
    ]),
    scene("image", [{ id: "shot", type: "image", src: "assets/player.png", alt: "The mutoscope player", caption: "The player", callouts: [{ x: 0.02, y: 0.12, w: 0.7, h: 0.72, label: "Stage" }, { x: 0.78, y: 0.2, label: "Side panel" }], layout: "left-two-thirds" }]),
  ];
  await writeFile(join(reel, "scenes.json"), JSON.stringify({ scenes }));
  const cli = resolve("skills/mutoscope/runtime/cli.mjs");
  const { stdout } = await run(process.execPath, [cli, "validate", reel]).catch((e) => e);
  expect(stdout, "the visuals reel validates").toMatch(/is valid/);
  await run(process.execPath, [cli, "build", reel, "--out", join(root, "site")]);
  page = pathToFileURL(join(root, "site", "index.html")).href;
});

test.afterAll(() => rm(root, { recursive: true, force: true }));

async function open(p: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(`${page}${query}`);
  await p.waitForFunction(() => (window as any).mutoscope?.ready);
  return errors;
}

test("words and numbers build in over the appear", async ({ page: p }) => {
  const errors = await open(p, "?scene=build&t=2000");
  const opacities = await p.locator(".reveal-word").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  expect(opacities).toHaveLength(8);
  expect(opacities[0]).toBe(1);
  expect(opacities.at(-1)).toBe(0);
  const mid = Number((await p.locator(".stat-value").textContent())!.replace(/,/g, ""));
  expect(mid).toBeGreaterThan(100);
  expect(mid).toBeLessThan(1000);
  await open(p, "?scene=build&t=9000");
  await expect(p.locator(".reveal-word")).toHaveCount(0);
  await expect(p.locator(".stat-value")).toHaveText("1,000");
  expect(errors).toEqual([]);
});

test("headlines that validate as fitting are never clipped", async ({ page: p }) => {
  for (let s = 0; s * 4 < headlines.length; s++) {
    await open(p, `?scene=headlines-${s}&t=0`);
    for (const h of headlines.slice(s * 4, s * 4 + 4)) {
      const fits = headlineFont(h, gridToRect(h.layout)) >= HEADLINE_FONT_READABLE;
      const clipped = await p.locator(`[data-entity="${h.id}"]`).evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [...node.querySelectorAll(".headline-text, .headline-eyebrow")].some((el) => {
          const r = el.getBoundingClientRect();
          return r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1;
        });
      });
      if (fits) expect(clipped, `${h.id}: "${h.text}" (${h.size})`).toBe(false);
    }
  }
});

test("stats and tables stay inside their boxes", async ({ page: p }) => {
  await open(p, "?scene=stats-table&t=9000");
  for (const st of stats) {
    expect(statFit(st, gridToRect(st.layout)).fits).toBe(true);
    const inside = await p.locator(`[data-entity="${st.id}"]`).evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll(".stat-value, .stat-label, .stat-note")].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      });
    });
    expect(inside, st.id).toBe(true);
  }
  const l = tableLayout(table, gridToRect(table.layout));
  expect(l.overflowX || l.overflowY).toBe(false);
  const cut = await p.locator(".data-table td, .data-table th").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(cut).toEqual([]);
  const tableBox = await p.locator('[data-entity="tb"]').boundingBox();
  const lastRow = await p.locator(".data-table tr").last().boundingBox();
  expect(lastRow!.y + lastRow!.height).toBeLessThanOrEqual(tableBox!.y + tableBox!.height + 1);
  await expect(p.locator(".data-table tr.is-hl")).toHaveText(/Ask/);
});

test("time-axis labels never overlap or leave the box when validate finds no collisions", async ({ page: p }) => {
  expect(timeAxisLayout(axis, gridToRect(axis.layout)).collisions).toEqual([]);
  await open(p, "?scene=axis&t=9000");
  const rects = await p.locator('[data-entity="ax"] .time-event').evaluateAll((groups) =>
    groups.map((g) => {
      const texts = [...g.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
      const left = Math.min(...texts.map((r) => r.left));
      const right = Math.max(...texts.map((r) => r.right));
      const top = Math.min(...texts.map((r) => r.top));
      const bottom = Math.max(...texts.map((r) => r.bottom));
      return { left, right, top, bottom, label: g.querySelector(".time-label")!.textContent };
    }),
  );
  expect(rects).toHaveLength(6);
  const box = (await p.locator('[data-entity="ax"]').boundingBox())!;
  for (const r of rects) {
    expect(r.left, r.label!).toBeGreaterThanOrEqual(box.x - 1);
    expect(r.right, r.label!).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${a.label} / ${b.label}`).toBe(false);
    }
  }
});

test("charts grow from the baseline and expose their data in Inspect", async ({ page: p }) => {
  await open(p, "?scene=chart&t=1600");
  const growing = await p.locator('[data-entity="ch"] .chart-bar').evaluateAll((bars) => bars.map((b) => Number(b.getAttribute("height"))));
  await open(p, "?scene=chart&t=9000&entity=ch");
  const grown = await p.locator('[data-entity="ch"] .chart-bar').evaluateAll((bars) => bars.map((b) => Number(b.getAttribute("height"))));
  expect(grown).toHaveLength(3);
  expect(grown[2]).toBeGreaterThan(grown[0]!);
  expect(growing.reduce((a, b) => a + b, 0)).toBeLessThan(grown.reduce((a, b) => a + b, 0));
  await expect(p.locator('[data-entity="ch"] .chart-value')).toHaveText(["12k", "30k", "47k"]);
  await expect(p.locator('[data-entity="ln"] .chart-line')).toHaveCount(2);
  await expect(p.locator(".inspect-data tbody tr")).toHaveCount(3);
  await expect(p.locator(".inspect-data tbody tr").last()).toHaveText(/2023\s*47k/);
});

test("lists keep their items inside the box and mark pros and cons", async ({ page: p }) => {
  const errors = await open(p, "?scene=list&t=9000");
  for (const id of ["steps", "pros"]) {
    const inside = await p.locator(`[data-entity="${id}"]`).evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll(".list-text, .list-detail, .list-title")].every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.right <= box.right + 1;
      });
    });
    expect(inside, id).toBe(true);
  }
  await expect(p.locator('[data-entity="steps"] .list-marker.is-number')).toHaveText(["1", "2", "3", "4"]);
  await expect(p.locator('[data-entity="pros"] .list-marker.is-check')).toHaveCount(2);
  await expect(p.locator('[data-entity="pros"] .list-marker.is-cross')).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`images load from the bundle under the page's CSP, with callouts (${theme})`, async ({ page: p }) => {
    await p.emulateMedia({ colorScheme: theme });
    const errors = await open(p, "?scene=image&t=9000");
    const img = p.locator('[data-entity="shot"] img');
    await expect(img).toHaveAttribute("alt", "The mutoscope player");
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1440);
    expect(await img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await expect(p.locator(".callout-text")).toHaveText(["Stage", "Side panel"]);
    await expect(p.locator(".image-caption")).toHaveText("The player");
    const tags = await p.locator(".callout-tag").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    const frame = (await p.locator(".image-frame").boundingBox())!;
    for (const t of tags) {
      expect(t.left).toBeGreaterThanOrEqual(frame.x - 1);
      expect(t.right).toBeLessThanOrEqual(frame.x + frame.width + 1);
    }
    expect(errors).toEqual([]);
  });
}

test.describe("step five: parts, icons, styles, camera", () => {
  let site: string;
  test.beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "mutoscope-step5-"));
    const reel = join(dir, "reel");
    await cp(resolve("examples/spsc-evolution"), reel, { recursive: true });
    await rm(join(reel, "analysis.json"));
    await mkdir(join(reel, "assets"));
    await cp(resolve("docs/media/player-dark.png"), join(reel, "assets", "player.png"));
    const { entrySceneId: _e, ...manifest } = JSON.parse(await readFile(join(reel, "manifest.json"), "utf8"));
    await writeFile(join(reel, "manifest.json"), JSON.stringify({ ...manifest, style: "blueprint" }));
    const scenes = [
      scene("parts", [
        { id: "steps", type: "list", style: "numbered", items: [{ text: "Install" }, { text: "Configure" }, { text: "Run" }], layout: "left" },
        { id: "ax", type: "time-axis", events: [{ at: 2014, label: "A" }, { at: 2016, label: "B" }, { at: 2018, label: "C" }], layout: "right" },
      ], [
        { action: "appear", atMs: 0, target: "steps", item: 0 },
        { action: "appear", atMs: 3000, target: "steps", item: 1 },
        { action: "highlight", atMs: 5000, target: "steps", item: 1 },
        { action: "highlight", atMs: 5000, target: "ax", item: 2 },
      ]),
      scene("icons", [
        { id: "api", type: "component", label: "API", icon: "server", explanation: "x", layout: { col: 1, row: 1, colSpan: 3, rowSpan: 2 } },
        { id: "fast", type: "icon", name: "zap", label: "Fast", layout: { col: 5, row: 1, colSpan: 3, rowSpan: 3 } },
      ]),
      scene("zoom", [{ id: "shot", type: "image", src: "assets/player.png", alt: "Player", callouts: [{ x: 0.78, y: 0.2, label: "Side panel" }], layout: "full" }], [
        { action: "focus", atMs: 1000, target: "shot", callout: 0, durationMs: 0 },
      ]),
    ];
    await writeFile(join(reel, "scenes.json"), JSON.stringify({ scenes }));
    const cli = resolve("skills/mutoscope/runtime/cli.mjs");
    const { stdout } = await run(process.execPath, [cli, "validate", reel]).catch((e) => e);
    expect(stdout).toMatch(/is valid/);
    await run(process.execPath, [cli, "build", reel, "--out", join(dir, "site")]);
    site = pathToFileURL(join(dir, "site", "index.html")).href;
  });

  const go = async (p: Page, q: string) => {
    await p.goto(`${site}${q}`);
    await p.waitForFunction(() => (window as any).mutoscope?.ready);
  };

  test("parts appear on their cues and one part can be highlighted", async ({ page: p }) => {
    await go(p, "?scene=parts&t=1500");
    const shown = () => p.locator('[data-entity="steps"] .list-item').evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
    expect(await shown()).toEqual([1, 0, 0]);
    await go(p, "?scene=parts&t=6000");
    const op = await shown();
    expect(op[1]).toBe(1);
    expect(op[0]).toBeLessThan(0.7);
    expect(op[2]).toBe(0);
    await expect(p.locator('[data-entity="steps"] .list-item.is-hl')).toHaveText("2Configure");
    await expect(p.locator('[data-entity="ax"] .time-event.is-hl .time-label')).toHaveText("C");
  });

  test("icons render as shapes, and the reel style colours the stage", async ({ page: p }) => {
    await go(p, "?scene=icons&t=0");
    expect(await p.locator('[data-entity="api"] .component-icon path, [data-entity="api"] .component-icon rect').count()).toBeGreaterThan(0);
    await expect(p.locator('[data-entity="fast"] .icon-label')).toHaveText("Fast");
    await expect(p.locator(".stage-frame")).toHaveAttribute("data-style", "blueprint");
    expect(await p.locator(".stage-bg").evaluate((el) => getComputedStyle(el).fill)).toBe("rgb(14, 42, 77)");
  });

  test("the camera zooms onto an image callout", async ({ page: p }) => {
    await go(p, "?scene=zoom&t=500");
    const before = await p.locator(".stage-svg").getAttribute("viewBox");
    await go(p, "?scene=zoom&t=2000");
    const [x, , w] = (await p.locator(".stage-svg").getAttribute("viewBox"))!.split(" ").map(Number);
    expect(before).toBe("0 0 1600 900");
    expect(w).toBeLessThan(1600 / 2.5);
    expect(x).toBeGreaterThan(800);
  });
});
