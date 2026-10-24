import { build } from "esbuild";
import { chmod } from "node:fs/promises";

// One dependency-free ESM file next to the player assets, so the skill
// folder is self-contained and runs anywhere Node 22 does.
const outfile = "skills/mutoscope/runtime/cli.mjs";
await build({
  entryPoints: ["src/cli/index.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["playwright", "@playwright/test"],
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
});
await chmod(outfile, 0o755);
console.log(`built ${outfile}`);
