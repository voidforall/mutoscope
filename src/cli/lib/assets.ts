import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "./reel-files";

/**
 * The bundled CLI lives in skills/mutoscope/runtime/ next to player/; when run
 * from source (tsx) we look in the same place relative to the repo root.
 */
function candidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.MUTOSCOPE_PLAYER_DIR,
    join(here, "player"),
    resolve(here, "../../../skills/mutoscope/runtime/player"),
  ].filter((p): p is string => Boolean(p));
}

export async function loadPlayerAssets(): Promise<{ js: string; css: string }> {
  const dir = candidates().find((d) => existsSync(join(d, "player.js")) && existsSync(join(d, "player.css")));
  if (!dir) throw new CliError("Player assets not found.", "Run `npm run build` in the mutoscope repo.");
  const [js, css] = await Promise.all([readFile(join(dir, "player.js"), "utf8"), readFile(join(dir, "player.css"), "utf8")]);
  return { js, css };
}
