import { join } from "node:path";
import { parse, positional } from "../lib/args";
import { buildSite } from "../lib/build";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";

export const help = "build <reel-dir> [--out <dir>]                        Bundle into a static site (default <reel-dir>/dist)";

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { out: { type: "string" } });
  const dir = positional(positionals, 0, "reel-dir");
  const outDir = values.out ?? join(dir, "dist");
  const files = await buildSite(await loadValidReel(dir), outDir);
  out(`${c.green("✓")} built ${files.length} files → ${join(outDir, "index.html")}`);
  return 0;
}
