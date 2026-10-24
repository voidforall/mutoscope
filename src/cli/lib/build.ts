import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReelBundle } from "../../schema";
import { loadPlayerAssets } from "./assets";
import { renderReelHtml } from "./html";

/** Write a static, self-contained reel site: index.html + the source JSON for tooling. */
export async function buildSite(bundle: ReelBundle, outDir: string): Promise<string[]> {
  const { js, css } = await loadPlayerAssets();
  await mkdir(outDir, { recursive: true });
  const files: Record<string, string> = {
    "index.html": renderReelHtml(bundle, js, css),
    "manifest.json": JSON.stringify(bundle.manifest, null, 2),
    "scenes.json": JSON.stringify({ scenes: bundle.scenes }, null, 2),
    ...(bundle.analysis ? { "analysis.json": JSON.stringify(bundle.analysis, null, 2) } : {}),
    ...(bundle.threads ? { "threads.json": JSON.stringify(bundle.threads, null, 2) } : {}),
    ".nojekyll": "",
  };
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(outDir, name), content)));
  return Object.keys(files);
}
