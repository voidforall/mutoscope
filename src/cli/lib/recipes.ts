import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RecipeInfo {
  readonly name: string;
  readonly description: string;
  readonly inputs: string;
  readonly ingest?: string;
  readonly path: string;
  readonly origin: "project" | "user" | "built-in";
}

/** Project recipes shadow user recipes, which shadow built-ins. */
export function recipeDirs(cwd = process.cwd()): { dir: string; origin: RecipeInfo["origin"] }[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const builtIn = [resolve(here, "../recipes"), resolve(here, "../../../skills/mutoscope/recipes")].find((d) => existsSync(d));
  return [
    { dir: join(cwd, ".mutoscope", "recipes"), origin: "project" as const },
    { dir: join(homedir(), ".mutoscope", "recipes"), origin: "user" as const },
    ...(builtIn ? [{ dir: builtIn, origin: "built-in" as const }] : []),
  ];
}

export function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  return Object.fromEntries(
    m[1]!
      .split("\n")
      .map((l) => /^([\w-]+):\s*(.*)$/.exec(l))
      .filter((x): x is RegExpExecArray => x !== null)
      .map((x) => [x[1]!, x[2]!.trim()]),
  );
}

export async function listRecipes(cwd?: string): Promise<RecipeInfo[]> {
  const seen = new Map<string, RecipeInfo>();
  for (const { dir, origin } of recipeDirs(cwd)) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort()) {
      const path = join(dir, f);
      const fm = parseFrontmatter(await readFile(path, "utf8"));
      const name = fm.name ?? f.replace(/\.md$/, "");
      if (seen.has(name)) continue;
      seen.set(name, { name, description: fm.description ?? "", inputs: fm.inputs ?? "", ingest: fm.ingest, path, origin });
    }
  }
  return [...seen.values()];
}
