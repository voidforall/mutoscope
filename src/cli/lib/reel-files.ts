import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The files an agent authors inside a reel directory. */
export const REEL_FILES = {
  manifest: "manifest.json",
  scenes: "scenes.json",
  analysis: "analysis.json",
  threads: "threads.json",
  rationale: "rationale.md",
} as const;

export class CliError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new CliError(`Could not parse ${path}: ${(e as Error).message}`);
  }
}

/** Raw (unvalidated) reel bundle from a directory. */
export async function loadRawReel(dir: string): Promise<Record<string, unknown>> {
  const p = (f: string) => join(dir, f);
  if (!existsSync(p(REEL_FILES.manifest))) {
    throw new CliError(`No ${REEL_FILES.manifest} in ${dir}`, "Run `mutoscope init <dir> --recipe <name>` first.");
  }
  if (!existsSync(p(REEL_FILES.scenes))) {
    throw new CliError(`No ${REEL_FILES.scenes} in ${dir}`, "Write the storyboard to scenes.json ({ \"scenes\": [...] }).");
  }
  const scenesFile = (await readJson(p(REEL_FILES.scenes))) as { scenes?: unknown };
  return {
    manifest: await readJson(p(REEL_FILES.manifest)),
    scenes: scenesFile?.scenes,
    ...(existsSync(p(REEL_FILES.analysis)) ? { analysis: await readJson(p(REEL_FILES.analysis)) } : {}),
    ...(existsSync(p(REEL_FILES.threads)) ? { threads: await readJson(p(REEL_FILES.threads)) } : {}),
    ...(existsSync(p(REEL_FILES.rationale)) ? { rationale: await readFile(p(REEL_FILES.rationale), "utf8") } : {}),
  };
}
