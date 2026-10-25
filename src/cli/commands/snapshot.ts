import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, positional } from "../lib/args";
import { launchBrowser } from "../lib/browser";
import { buildSite } from "../lib/build";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";
import { CliError } from "../lib/reel-files";
import type { Scene } from "../../schema";

export const help = "snapshot <reel-dir> [--out <dir>] [--theme light|dark] [--at beats|end|mid|both]  PNGs for visual review";

const AT = ["beats", "end", "mid", "both"] as const;
const TRANSITION_SHARE = 0.3;

/**
 * When to capture a scene. `beats`: every caption beat fully played out:
 * just before the next caption (or the scene's end), or before any action
 * that starts in the beat's last 30% as a transition into the next one. `mid`/`end`: the scene's halfway point and its last frame.
 */
export function captureTimes(scene: Scene, at: (typeof AT)[number]): { name: string; tMs: number }[] {
  const end = { name: "end", tMs: scene.durationMs };
  const mid = { name: "mid", tMs: Math.round(scene.durationMs / 2) };
  if (at === "end") return [end];
  if (at === "mid") return [mid];
  if (at === "both") return [mid, end];
  const cues = [...scene.cues].sort((a, b) => a.atMs - b.atMs);
  if (cues.length === 0) return [end];
  return cues.map((c, i) => {
    const end = cues[i + 1]?.atMs ?? scene.durationMs + 1;
    // Actions starting in a beat's last stretch lead into the next one (an early fade-out); capture before them.
    const tail = end - (end - c.atMs) * TRANSITION_SHARE;
    const lead = scene.timeline.filter((a) => a.atMs >= tail && a.atMs < end).reduce((t, a) => Math.min(t, a.atMs), end);
    return { name: `beat${i + 1}`, tMs: Math.max(c.atMs, lead - 1) };
  });
}

const SHEET_WIDTH = 1640;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** All of a scene's frames on one page, two per row, labelled with their time: one image to review instead of many. */
function sheetHtml(title: string, frames: readonly { name: string; tMs: number; png: Buffer }[]): string {
  const tiles = frames
    .map((f) => `<figure><img src="data:image/png;base64,${f.png.toString("base64")}"><figcaption>${escapeHtml(f.name)} · ${(f.tMs / 1000).toFixed(1)}s</figcaption></figure>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#2a2824;font:14px system-ui;color:#e8e2d6}
h1{margin:0 0 12px;font-size:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}
figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{margin-top:4px;color:#b8b0a2}
</style><h1>${escapeHtml(title)}</h1><main>${tiles}</main>`;
}

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { out: { type: "string" }, theme: { type: "string" }, at: { type: "string" } });
  const dir = positional(positionals, 0, "reel-dir");
  const bundle = await loadValidReel(dir);
  const outDir = resolve(values.out ?? join(dir, "snapshots"));
  const at = (values.at ?? "beats") as (typeof AT)[number];
  if (!AT.includes(at)) throw new CliError(`--at must be one of ${AT.join(", ")}`);
  const site = await mkdtemp(join(tmpdir(), "mutoscope-snap-"));
  await buildSite(bundle, site);
  await mkdir(outDir, { recursive: true });
  const browser = await launchBrowser();
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ colorScheme: values.theme === "light" ? "light" : "dark", reducedMotion: "reduce" });
    await page.goto(pathToFileURL(join(site, "index.html")).href);
    await page.waitForFunction("window.mutoscope && window.mutoscope.ready");
    const sheetPage = await browser.newPage({ viewport: { width: SHEET_WIDTH, height: 600 }, deviceScaleFactor: 1 });
    for (const [i, scene] of bundle.scenes.entries()) {
      const prefix = join(outDir, `${String(i + 1).padStart(2, "0")}-${scene.id}`);
      const frames: { name: string; tMs: number; png: Buffer }[] = [];
      for (const { name: m, tMs: t } of captureTimes(scene, at)) {
        await page.evaluate(`window.mutoscope.pause(); window.mutoscope.seek(${JSON.stringify(scene.id)}, ${t})`);
        await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
        const file = `${prefix}-${m}.png`;
        frames.push({ name: m, tMs: t, png: await page.locator(".stage-frame").screenshot({ path: file }) });
        out(`${c.green("✓")} ${file}`);
      }
      if (frames.length > 1) {
        await sheetPage.setContent(sheetHtml(scene.title, frames));
        await sheetPage.screenshot({ type: "png", fullPage: true, path: `${prefix}-sheet.png` });
        out(`${c.green("✓")} ${prefix}-sheet.png ${c.dim(`(${frames.length} frames on one page)`)}`);
      }
    }
  } finally {
    await browser.close();
    await rm(site, { recursive: true, force: true });
  }
  if (errors.length) {
    out(...errors.map((e) => `${c.red("page error")} ${e}`));
    return 1;
  }
  return 0;
}
