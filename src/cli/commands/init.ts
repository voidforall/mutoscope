import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Id, Manifest, SCHEMA_VERSION } from "../../schema";
import { parse, positional } from "../lib/args";
import { c, out } from "../lib/output";
import { listRecipes } from "../lib/recipes";
import { CliError, REEL_FILES } from "../lib/reel-files";

export const help = "init <reel-dir> --recipe <name> --title <text> [--id <id>] [--kicker <text>]";

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    recipe: { type: "string" },
    title: { type: "string" },
    id: { type: "string" },
    kicker: { type: "string" },
    force: { type: "boolean" },
  });
  const dir = positional(positionals, 0, "reel-dir");
  const recipe = values.recipe ?? "";
  const known = await listRecipes();
  if (!known.some((r) => r.name === recipe)) {
    throw new CliError(`Unknown recipe '${recipe}'`, `Available: ${known.map((r) => r.name).join(", ")}`);
  }
  if (existsSync(join(dir, REEL_FILES.manifest)) && !values.force) {
    throw new CliError(`${dir} already has a manifest`, "Pass --force to overwrite it.");
  }
  const id = values.id ?? basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!Id.safeParse(id).success) throw new CliError(`'${id}' is not a valid reel id`, "Use --id with lowercase kebab-case.");
  const manifest: Manifest = Manifest.parse({
    schemaVersion: SCHEMA_VERSION,
    id,
    version: 1,
    title: values.title ?? id,
    recipe,
    ...(values.kicker ? { kicker: values.kicker } : {}),
    createdAt: new Date().toISOString(),
    source: { provider: "none" },
  });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, REEL_FILES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
  const recipePath = known.find((r) => r.name === recipe)!.path;
  out(
    `${c.green("✓")} created ${join(dir, REEL_FILES.manifest)} (recipe: ${recipe})`,
    "",
    "Next:",
    `  1. Follow the recipe's Ingest section: ${recipePath}`,
    `  2. Write ${join(dir, REEL_FILES.analysis)}  — { "units": [...] }`,
    `  3. Write ${join(dir, REEL_FILES.scenes)}    — { "scenes": [...] }; the first scene is where the reel opens`,
    `  4. mutoscope validate ${dir}`,
  );
  return 0;
}
