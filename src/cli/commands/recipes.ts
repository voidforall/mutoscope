import { parse } from "../lib/args";
import { c, out } from "../lib/output";
import { listRecipes } from "../lib/recipes";

export const help = "recipes [--json]                                     List recipes (project, user, built-in)";

export async function run(argv: readonly string[]): Promise<number> {
  const { values } = parse(argv, { json: { type: "boolean" } });
  const recipes = await listRecipes();
  if (values.json) {
    out(JSON.stringify(recipes, null, 2));
    return 0;
  }
  for (const r of recipes) {
    out(`${c.bold(r.name.padEnd(16))} ${r.description}`, `${"".padEnd(17)}${c.dim(`inputs: ${r.inputs} · ${r.origin} · ${r.path}`)}`);
  }
  return 0;
}
