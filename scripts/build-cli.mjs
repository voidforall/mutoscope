import { build } from "esbuild";
import { chmod, readFile } from "node:fs/promises";

// One dependency-free ESM file next to the player assets, so the skill
// folder is self-contained and runs anywhere Node 22 does.
const outfile = "skills/mutoscope/runtime/cli.mjs";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const playwrightVersion = lock.packages["node_modules/@playwright/test"].version;
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
  define: { __PLAYWRIGHT_VERSION__: JSON.stringify(playwrightVersion) },
});
await chmod(outfile, 0o755);
console.log(`built ${outfile}`);
