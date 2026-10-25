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

/**
 * When to capture a scene. `beats`: the last moment of every caption beat
 * (just before the next caption starts, or the scene's end), i.e. each beat
 * fully played out. `mid`/`end`: the scene's halfway point and its last frame.
 */
export function captureTimes(scene: Scene, at: (typeof AT)[number]): { name: string; tMs: number }[] {
  const end = { name: "end", tMs: scene.durationMs };
  const mid = { name: "mid", tMs: Math.round(scene.durationMs / 2) };
  if (at === "end") return [end];
  if (at === "mid") return [mid];
  if (at === "both") return [mid, end];
  const cues = [...scene.cues].sort((a, b) => a.atMs - b.atMs);
  if (cues.length === 0) return [end];
  return cues.map((c, i) => ({
    name: `beat${i + 1}`,
    tMs: Math.max(c.atMs, (cues[i + 1]?.atMs ?? scene.durationMs + 1) - 1),
  }));
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
    for (const [i, scene] of bundle.scenes.entries()) {
      for (const { name: m, tMs: t } of captureTimes(scene, at)) {
        await page.evaluate(`window.mutoscope.pause(); window.mutoscope.seek(${JSON.stringify(scene.id)}, ${t})`);
        await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
        const file = join(outDir, `${String(i + 1).padStart(2, "0")}-${scene.id}-${m}.png`);
        await page.locator(".stage-frame").screenshot({ path: file });
        out(`${c.green("✓")} ${file}`);
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
