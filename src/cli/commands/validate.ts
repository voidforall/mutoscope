import { parse, positional } from "../lib/args";
import { c, out, printIssues } from "../lib/output";
import { validateReelDir } from "../lib/reel";

export const help = "validate <reel-dir> [--repo-root <path>] [--json]   Schema, cross-reference and (with --repo-root) source checks";

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { "repo-root": { type: "string" }, json: { type: "boolean" } });
  const dir = positional(positionals, 0, "reel-dir");
  const r = await validateReelDir(dir, values["repo-root"]);
  if (values.json) {
    out(JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings }, null, 2));
    return r.ok ? 0 : 1;
  }
  printIssues(r.errors, r.warnings);
  const scenes = r.bundle?.scenes.length;
  out(
    r.ok
      ? `${c.green("✓")} ${dir} is valid${scenes ? ` (${scenes} scenes)` : ""}${r.warnings.length ? c.yellow(` with ${r.warnings.length} warning(s)`) : ""}${values["repo-root"] ? "; source refs verified" : ""}`
      : `${c.red("✗")} ${r.errors.length} error(s)`,
  );
  return r.ok ? 0 : 1;
}
