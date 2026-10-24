import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoDiscussionInfo } from "../../adapters/github/discussions";
import { Manifest } from "../../schema";
import { parse, positional } from "../lib/args";
import { gh } from "../lib/exec";
import { c, out } from "../lib/output";
import { CliError, REEL_FILES } from "../lib/reel-files";

export const help = 'collab setup <reel-dir> --repo owner/repo [--category "Walkthrough Q&A"] [--enable]';

const DEFAULT_CATEGORY = "Walkthrough Q&A";

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    repo: { type: "string" },
    category: { type: "string" },
    enable: { type: "boolean" },
  });
  if (positional(positionals, 0, "setup") !== "setup") throw new CliError("Usage: mutoscope collab setup <reel-dir> --repo owner/repo");
  const dir = positional(positionals, 1, "reel-dir");
  const repo = values.repo;
  if (!repo) throw new CliError("Missing --repo owner/repo (where viewer questions will live)");
  const category = values.category ?? DEFAULT_CATEGORY;

  let info = await repoDiscussionInfo(repo);
  if (!info.enabled && values.enable) {
    await gh(["api", "-X", "PATCH", `repos/${repo}`, "-F", "has_discussions=true"]);
    info = await repoDiscussionInfo(repo);
  }
  if (!info.enabled) {
    out(`${c.yellow("!")} Discussions are disabled on ${repo}.`, `  Re-run with --enable (the author's gh login needs admin on ${repo}).`);
    return 1;
  }
  const found = info.categories.find((x) => x.name === category);
  if (!found) {
    out(
      `${c.yellow("!")} ${repo} has no discussion category named "${category}". GitHub's API cannot create categories.`,
      `  Create it at https://github.com/${repo}/discussions/categories/new (format: Question/Answer recommended),`,
      `  or pick an existing one with --category: ${info.categories.map((x) => `"${x.name}"`).join(", ")}`,
    );
    return 1;
  }
  const path = join(dir, REEL_FILES.manifest);
  const manifest = Manifest.parse(JSON.parse(await readFile(path, "utf8")));
  const next: Manifest = {
    ...manifest,
    collaboration: { adapter: "github-discussions", repository: repo, category: found.name, categorySlug: found.slug },
  };
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
  out(`${c.green("✓")} questions from this reel will open discussions in ${repo} → ${found.name}`);
  return 0;
}
