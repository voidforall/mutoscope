import type { Asset, Entity, Scene } from "../schema";
import { buildsIn } from "./build";
import { chartLayout } from "./chart-layout";
import { gridToRect } from "./geometry";
import { timeAxisLayout } from "./time-axis-layout";
import { actionDuration } from "./timeline";
import { calloutPoint, HEADLINE_FONT_READABLE, headlineFont, imageRect, STAT_FONT_READABLE, statFit, tableLayout } from "./visual-fit";

interface Issue {
  readonly path: string;
  readonly message: string;
}

const px = (n: number) => `${Math.round(n)}px`;
const MIN_BAR_WIDTH = 6;

function entityIssues(e: Entity, assets: Readonly<Record<string, Asset>>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!("layout" in e)) return { errors, warnings };
  const box = gridToRect(e.layout);
  switch (e.type) {
    case "headline": {
      const font = headlineFont(e, box);
      if (font < HEADLINE_FONT_READABLE) warnings.push(`headline '${e.id}' shrinks to ${px(font)} to fit its box; give it more room or shorten it`);
      break;
    }
    case "stat": {
      const fit = statFit(e, box);
      if (!fit.fits) warnings.push(`stat '${e.id}' label doesn't fit under the number; give it more room or shorten the label`);
      else if (fit.valueFont < STAT_FONT_READABLE) warnings.push(`stat '${e.id}' number shrinks to ${px(fit.valueFont)}; give it more room`);
      break;
    }
    case "chart": {
      const l = chartLayout(e, box, 1);
      const cut = l.labels.filter((x) => x.truncated).map((x) => `'${x.full}'`);
      if (cut.length) warnings.push(`chart '${e.id}' cuts category labels ${cut.join(", ")}; widen it, use kind "bar" for long names, or shorten them`);
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
    case "image": {
      const asset = assets[e.src];
      if (!asset) {
        errors.push(`image '${e.id}': ${e.src} is not in the reel's assets folder`);
        break;
      }
      const { frame, image } = imageRect(e, asset, box);
      e.callouts.forEach((c, i) => {
        if (!calloutPoint(c, frame, image).visible) warnings.push(`image '${e.id}' callout ${i + 1} ('${c.label}') is cropped out by fit "cover"; use fit "contain" or move it`);
      });
      break;
    }
  }
  return { errors, warnings };
}

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
export function findVisualIssues(scene: Scene, p: string, assets: Readonly<Record<string, Asset>>): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  scene.entities.forEach((e, i) => {
    const r = entityIssues(e, assets);
    errors.push(...r.errors.map((message) => ({ path: `${p}.entities[${i}]`, message })));
    warnings.push(...r.warnings.map((message) => ({ path: `${p}.entities`, message })));
  });
  warnings.push(...unfinishedBuilds(scene).map((message) => ({ path: `${p}.timeline`, message })));
  return { errors, warnings };
}
