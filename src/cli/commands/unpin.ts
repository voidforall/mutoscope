import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { documentKey } from "../../core";
import { parse, positional } from "../lib/args";
import { DATA_DIR } from "../lib/data-check";
import { c, out } from "../lib/output";
import { readManifest, SOURCE_DIR, writeManifest } from "../lib/pin";
import { CliError } from "../lib/reel-files";
import { snapshotSlug, WEB_DIR } from "../lib/web-snapshot";

export const help = "unpin <reel-dir> <url|dataset.csv|assets/x.png>   Remove a pinned page, dataset or image, and its files";

async function remove(path: string): Promise<void> {
  if (existsSync(path)) await rm(path);
}

/** Undo an ingest: the manifest entry and the files it wrote. */
export async function run(argv: readonly string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  const reelDir = positional(positionals, 0, "reel-dir");
  const what = positional(positionals, 1, "url|dataset|assets/<file>");
  const manifest = await readManifest(reelDir);
  if (/^https:\/\//.test(what)) {
    const key = documentKey(what);
    const doc = manifest.documents.find((d) => documentKey(d.url) === key);
    if (!doc) throw new CliError(`${what} is not pinned`, `Pinned pages: ${manifest.documents.map((d) => d.url).join(", ") || "none"}`);
    const slug = snapshotSlug(doc.url);
    await Promise.all([".md", ".json"].map((ext) => remove(join(reelDir, SOURCE_DIR, WEB_DIR, `${slug}${ext}`))));
    await writeManifest(reelDir, { ...manifest, documents: manifest.documents.filter((d) => d !== doc) });
    out(`${c.green("✓")} unpinned ${doc.url}`);
  } else if (what.startsWith("assets/")) {
    if (!existsSync(join(reelDir, what))) throw new CliError(`${what} does not exist in ${reelDir}`);
    await remove(join(reelDir, what));
    await writeManifest(reelDir, { ...manifest, media: manifest.media.filter((m) => m.src !== what) });
    out(`${c.green("✓")} removed ${what}`);
  } else {
    const ds = manifest.datasets.find((d) => d.file === what);
    if (!ds) throw new CliError(`${what} is not a pinned dataset`, `Pinned datasets: ${manifest.datasets.map((d) => d.file).join(", ") || "none"}`);
    await remove(join(reelDir, SOURCE_DIR, DATA_DIR, ds.file));
    await writeManifest(reelDir, { ...manifest, datasets: manifest.datasets.filter((d) => d !== ds) });
    out(`${c.green("✓")} unpinned ${ds.file}`);
  }
  out(c.dim("Run validate: anything that still cites it is now an error."));
  return 0;
}
