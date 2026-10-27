import type { Asset, Entity, GridBox, PinnedMedia, ReelStyle, Scene } from "../schema";
import { buildsIn } from "./build";
import { chartLayout } from "./chart-layout";
import { gridToRect } from "./geometry";
import { CODE_CHROME, codeBlockFont } from "./text-fit";
import { timeAxisLayout } from "./time-axis-layout";
import { actionDuration } from "./timeline";
import { calloutPoint, calloutTag, HEADLINE_FONT_READABLE, headlineFont, ICON, iconSize, imageRect, LIST, listHeight, listScale, sceneListScale, sceneStatFont, STAT_FONT_READABLE, statFit, tableLayout } from "./visual-fit";
import { proportionalEm } from "./text-fit";

interface Issue {
  readonly path: string;
  readonly message: string;
}

const px = (n: number) => `${Math.round(n)}px`;
const MIN_BAR_WIDTH = 6;
/** Content filling less than this share of its box leaves an empty card behind it. */
const MIN_FILL = 0.6;
const CODE_LINE_EM = 1.5;

/** The smallest rowSpan (same position and width) that still satisfies `fits`. */
function fittingRowSpan(layout: GridBox, fits: (h: number, rowSpan: number) => boolean): number | undefined {
  for (let rowSpan = 1; rowSpan < layout.rowSpan; rowSpan++) {
    if (fits(gridToRect({ ...layout, rowSpan }).h, rowSpan)) return rowSpan;
  }
  return undefined;
}

function underfilled(e: Entity): string | undefined {
  if (e.type === "table") {
    const box = gridToRect(e.layout);
    const { height } = tableLayout(e, box);
    const rowSpan = height < MIN_FILL * box.h ? fittingRowSpan(e.layout, (h) => !tableLayout(e, { w: box.w, h }).overflowY) : undefined;
    return rowSpan ? `table '${e.id}' fills only ${Math.round((height / box.h) * 100)}% of its box; rowSpan ${rowSpan} fits it` : undefined;
  }
  if (e.type === "list") {
    const box = gridToRect(e.layout);
    const scale = listScale(e, box);
    const height = listHeight(e, box, scale);
    const rowSpan = height < MIN_FILL * box.h ? fittingRowSpan(e.layout, (h) => listScale(e, { w: box.w, h }) >= LIST.maxScale - 0.01) : undefined;
    return height < MIN_FILL * box.h ? `list '${e.id}' fills only ${Math.round((height / box.h) * 100)}% of its box even at its largest${rowSpan ? `; rowSpan ${rowSpan} fits it` : "; add items or make the box smaller"}` : undefined;
  }
  if (e.type === "code-block") {
    const box = gridToRect(e.layout);
    const font = codeBlockFont(e, box);
    const height = CODE_CHROME.header + CODE_CHROME.pad + e.code.split("\n").length * font * CODE_LINE_EM;
    const rowSpan = height < MIN_FILL * box.h ? fittingRowSpan(e.layout, (_h, rs) => codeBlockFont(e, gridToRect({ ...e.layout, rowSpan: rs })) >= font - 0.01) : undefined;
    return rowSpan ? `code-block '${e.id}' fills only ${Math.round((height / box.h) * 100)}% of its box; rowSpan ${rowSpan} fits it` : undefined;
  }
  return undefined;
}

function entityIssues(e: Entity, assets: Readonly<Record<string, Asset>>, style: ReelStyle): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!("layout" in e)) return { errors, warnings };
  const box = gridToRect(e.layout);
  switch (e.type) {
    case "headline": {
      const font = headlineFont(e, box, style);
      if (font < HEADLINE_FONT_READABLE) warnings.push(`headline '${e.id}' shrinks to ${px(font)} to fit its box; give it more room or shorten it`);
      break;
    }
    case "stat": {
      const fit = statFit(e, box);
      const quoted = e.data ? [] : e.sourceRefs.flatMap((r) => (r.kind === "url" && r.quote ? [r.quote] : []));
      if (quoted.length && !quoted.some((q) => quoteHasNumber(q, e.value))) {
        warnings.push(`stat '${e.id}' shows ${e.value}, but no quote it cites contains that number; quote the words with the figure`);
      }
      if (!fit.fits) warnings.push(`stat '${e.id}' label doesn't fit under the number; give it more room or shorten the label`);
      else if (fit.valueFont < STAT_FONT_READABLE) warnings.push(`stat '${e.id}' number shrinks to ${px(fit.valueFont)}; give it more room`);
      break;
    }
    case "chart": {
      const l = chartLayout(e, box, 1);
      const cut = l.labels.filter((x) => x.truncated).map((x) => `'${x.full}'`);
      if (cut.length) {
        const shorten = e.data ? "or show shorter names and map them to the data with data.categoryKeys" : "or shorten them";
        warnings.push(`chart '${e.id}' cuts category labels ${cut.join(", ")}; widen it, use kind "bar" for long names, ${shorten}`);
      }
      // A bar's thickness is across its category slot: width for columns, height for horizontal bars.
      if (l.bars.some((b) => (e.kind === "column" ? b.w : b.h) < MIN_BAR_WIDTH)) {
        warnings.push(`chart '${e.id}' bars are thinner than ${MIN_BAR_WIDTH}px; give it more room or fewer categories`);
      }
      if (l.plot.w < 80 || l.plot.h < 60) warnings.push(`chart '${e.id}' leaves too little room for the plot; give it more room`);
      break;
    }
    case "time-axis": {
      const l = timeAxisLayout(e, box);
      for (const [a, b] of l.collisions) {
        warnings.push(a === b ? `time-axis '${e.id}' has no room for the label of '${b}'; give it more rows` : `time-axis '${e.id}' labels '${a}' and '${b}' collide; widen the axis, give it more rows, or shorten labels`);
      }
      break;
    }
    case "table": {
      const l = tableLayout(e, box);
      if (l.overflowX) warnings.push(`table '${e.id}' is too narrow for its cells; widen it or shorten the text`);
      if (l.overflowY) warnings.push(`table '${e.id}' has more rows than fit; give it more rows or split it`);
      break;
    }
    case "icon": {
      if (iconSize(e, box) < ICON.readable) warnings.push(`icon '${e.id}' shrinks to ${px(iconSize(e, box))}; give it more room or drop its caption`);
      if (e.label && proportionalEm(e.label) * ICON.label > box.w - 2 * ICON.pad) warnings.push(`icon '${e.id}' label is wider than its box; widen it or shorten the label`);
      break;
    }
    case "list": {
      const scale = listScale(e, box);
      if (scale < LIST.readableScale) warnings.push(`list '${e.id}' shrinks to ${px(LIST.text * scale)} text to fit its box; give it more room or fewer, shorter items`);
      break;
    }
    case "image": {
      const asset = assets[e.src];
      if (!asset) {
        errors.push(`image '${e.id}': ${e.src} is not in the reel's assets folder`);
        break;
      }
      const geo = imageRect(e, asset, box);
      const placed = e.callouts.map((c) => {
        const pt = calloutPoint(c, geo);
        return { c, pt, tag: calloutTag(pt, c.label, geo.frame, c.side) };
      });
      placed.forEach(({ c, pt }, i) => {
        if (!pt.visible) warnings.push(`image '${e.id}' callout ${i} ('${c.label}') is outside the visible picture (crop or fit "cover"); move it or show more of the picture`);
      });
      const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      placed.forEach((a, i) =>
        placed.slice(i + 1).forEach((b) => {
          if (overlap(a.tag, b.tag)) warnings.push(`image '${e.id}' callout tags '${a.c.label}' and '${b.c.label}' overlap; give one a different side (above, below, left, right)`);
        }),
      );
      placed.forEach((a) =>
        placed.forEach((b) => {
          if (a !== b && b.pt.region && overlap(a.tag, b.pt.region)) warnings.push(`image '${e.id}' callout tag '${a.c.label}' covers the region of '${b.c.label}'; give it a different side`);
        }),
      );
      break;
    }
  }
  return { errors, warnings };
}

/** Whether `quote` states `value`, however it is written: 1500, 1,500, 1.5k are all taken at face value only as digits. */
function quoteHasNumber(quote: string, value: number): boolean {
  const digits = quote.replace(/(?<=\d)[,\u202f\u00a0 ](?=\d{3}\b)/g, "");
  const forms = new Set([String(value), value.toFixed(1), value.toFixed(2), String(Math.round(value))]);
  if ([...digits.matchAll(/\d+(?:\.\d+)?/g)].some((m) => forms.has(m[0]) || Number(m[0]) === value)) return true;
  // "every twelve months": small numbers are often written out.
  return quote.toLowerCase().split(/[^a-z]+/).some((w) => NUMBER_WORDS[w] === value);
}

const NUMBER_WORDS: Readonly<Record<string, number>> = Object.fromEntries(
  ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
    .map((w, i) => [w, i] as const)
    .concat([["thirty", 30], ["forty", 40], ["fifty", 50], ["hundred", 100], ["thousand", 1000]]),
);

/** Builds still running when the scene ends are cut off mid-way. */
function unfinishedBuilds(scene: Scene): string[] {
  const byId = new Map(scene.entities.map((e) => [e.id, e]));
  return scene.timeline.flatMap((a) => {
    if (a.action !== "appear") return [];
    const e = byId.get(a.target);
    if (!e || !buildsIn(e)) return [];
    const end = a.atMs + actionDuration(scene, a);
    return end > scene.durationMs ? [`'${e.id}' is still building at the end of the scene (until ${end}ms); appear it earlier or give it a shorter durationMs`] : [];
  });
}

/** Checks for headlines, stats, charts, time axes, tables and images. */
export function findVisualIssues(scene: Scene, p: string, assets: Readonly<Record<string, Asset>>, media: readonly PinnedMedia[] = [], style: ReelStyle = "studio"): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const e of scene.entities) {
    const fetched = e.type === "image" && !e.credit ? media.find((m) => m.src === e.src) : undefined;
    if (fetched) warnings.push({ path: `${p}.entities`, message: `image '${e.id}' was fetched from ${fetched.source}; credit it ("credit": "…")` });
  }
  scene.entities.forEach((e, i) => {
    const empty = underfilled(e);
    if (empty) warnings.push({ path: `${p}.entities`, message: empty });
    const r = entityIssues(e, assets, style);
    errors.push(...r.errors.map((message) => ({ path: `${p}.entities[${i}]`, message })));
    warnings.push(...r.warnings.map((message) => ({ path: `${p}.entities`, message })));
  });
  warnings.push(...unfinishedBuilds(scene).map((message) => ({ path: `${p}.timeline`, message })));
  const stats = scene.entities.filter((e) => e.type === "stat");
  const statFont = sceneStatFont(scene.entities, (e) => gridToRect(e.layout));
  if (stats.length > 1 && statFont < STAT_FONT_READABLE && stats.every((e) => e.type !== "stat" || statFit(e, gridToRect(e.layout)).valueFont >= STAT_FONT_READABLE)) {
    warnings.push({ path: `${p}.entities`, message: `stats in this scene share one size, and the longest number makes them all ${px(statFont)}; give it a wider box or shorten it` });
  }
  const lists = scene.entities.filter((e) => e.type === "list");
  const shared = sceneListScale(scene.entities, (e) => gridToRect(e.layout));
  if (lists.length > 1 && shared < LIST.readableScale && lists.every((e) => e.type !== "list" || listScale(e, gridToRect(e.layout)) >= LIST.readableScale)) {
    warnings.push({ path: `${p}.entities`, message: `lists in this scene share one size, and the tightest makes them all ${px(LIST.text * shared)}; give it more room` });
  }
  return { errors, warnings };
}
