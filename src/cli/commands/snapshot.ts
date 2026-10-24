import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, positional } from "../lib/args";
import { launchBrowser } from "../lib/browser";
import { buildSite } from "../lib/build";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";

export const help = "snapshot <reel-dir> [--out <dir>] [--theme light|dark] [--at end|mid|both]  PNG per scene for visual review";

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { out: { type: "string" }, theme: { type: "string" }, at: { type: "string" } });
  const dir = positional(positionals, 0, "reel-dir");
  const bundle = await loadValidReel(dir);
  const outDir = resolve(values.out ?? join(dir, "snapshots"));
  const at = values.at ?? "end";
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
      const moments = at === "both" ? ["mid", "end"] : [at];
      for (const m of moments) {
        const t = m === "mid" ? Math.round(scene.durationMs / 2) : scene.durationMs;
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
