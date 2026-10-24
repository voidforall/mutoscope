import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Manifest, ReelBundle } from "../../schema";
import { parse, positional } from "../lib/args";
import { buildSite } from "../lib/build";
import { exec, gh, ghJson, git } from "../lib/exec";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";
import { CliError, REEL_FILES } from "../lib/reel-files";
import { scanBundle, type Finding } from "../lib/safety";

export const help =
  "publish <reel-dir> [--repo owner/repo] [--branch gh-pages] [--path reels/<id>] [--yes] [--allow-private-source]\n" +
  "                                                       Dry run unless --yes; pushes to GitHub Pages";

interface RepoInfo {
  visibility: string;
  owner: { login: string };
  name: string;
}

function targetRepo(bundle: ReelBundle, explicit?: string): string {
  const m = bundle.manifest;
  const repo = explicit ?? m.collaboration?.repository ?? (m.source.provider !== "none" ? m.source.repository : undefined);
  if (!repo) throw new CliError("No target repository", "Pass --repo owner/repo.");
  return repo;
}

async function pagesBaseUrl(repo: string, info: RepoInfo): Promise<{ url: string; enabled: boolean }> {
  try {
    const pages = await ghJson<{ html_url: string }>(["api", `repos/${repo}/pages`]);
    return { url: pages.html_url.endsWith("/") ? pages.html_url : `${pages.html_url}/`, enabled: true };
  } catch {
    const owner = info.owner.login.toLowerCase();
    const userSite = info.name.toLowerCase() === `${owner}.github.io`;
    return { url: `https://${owner}.github.io/${userSite ? "" : `${info.name}/`}`, enabled: false };
  }
}

async function sourceIsPrivate(manifest: Manifest): Promise<boolean> {
  const s = manifest.source;
  if (s.provider === "none" || !s.repository) return false;
  if (s.provider === "github" && s.visibility) return s.visibility !== "public";
  const v = await ghJson<{ visibility: string }>(["repo", "view", s.repository, "--json", "visibility"]);
  return v.visibility.toLowerCase() !== "public";
}

async function pushSite(bundle: ReelBundle, repo: string, branch: string, path: string): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), "mutoscope-publish-"));
  try {
    await git(["init", "-q"], work);
    await git(["remote", "add", "origin", `https://github.com/${repo}.git`], work);
    const hasBranch = (await git(["ls-remote", "--heads", "origin", branch], work)).trim().length > 0;
    if (hasBranch) {
      await git(["fetch", "-q", "--depth", "1", "origin", branch], work);
      await git(["checkout", "-q", "-b", branch, "FETCH_HEAD"], work);
    } else {
      await git(["checkout", "-q", "--orphan", branch], work);
    }
    await rm(join(work, path), { recursive: true, force: true });
    await buildSite(bundle, join(work, path));
    await writeFile(join(work, ".nojekyll"), "");
    await git(["add", "-A"], work);
    const m = bundle.manifest;
    await exec("git", ["-c", "user.name=mutoscope", "-c", "user.email=mutoscope@users.noreply.github.com", "commit", "-q", "-m", `mutoscope: publish ${m.id} v${m.version}`], { cwd: work });
    await git(["push", "-q", "origin", `HEAD:${branch}`], work);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function printPlan(rows: [string, string][], findings: readonly Finding[]): void {
  for (const [k, v] of rows) out(`  ${c.dim(k.padEnd(12))} ${v}`);
  for (const f of findings) out(`  ${f.severity === "block" ? c.red("BLOCK") : c.yellow("warn ")} ${c.dim(f.where)} ${f.message}`);
}

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    repo: { type: "string" },
    branch: { type: "string" },
    path: { type: "string" },
    yes: { type: "boolean" },
    "allow-private-source": { type: "boolean" },
  });
  const dir = positional(positionals, 0, "reel-dir");
  const loaded = await loadValidReel(dir);
  const repo = targetRepo(loaded, values.repo);
  const branch = values.branch ?? "gh-pages";
  const path = (values.path ?? `reels/${loaded.manifest.id}`).replace(/^\/+|\/+$/g, "");
  if (path.split("/").includes("..")) throw new CliError("--path must stay inside the branch");

  const info = await ghJson<RepoInfo>(["repo", "view", repo, "--json", "visibility,owner,name"]);
  const pages = await pagesBaseUrl(repo, info);
  const publicUrl = `${pages.url}${path}/`;
  const bundle: ReelBundle = { ...loaded, manifest: { ...loaded.manifest, publicUrl } };

  const findings: Finding[] = scanBundle(bundle);
  const privateSource = await sourceIsPrivate(bundle.manifest);
  if (privateSource && !values["allow-private-source"]) {
    findings.push({ severity: "block", where: "manifest.source", message: "source repository is private but GitHub Pages sites are publicly reachable; pass --allow-private-source only if the author accepts that" });
  }
  out(c.bold(`Publish plan for ${bundle.manifest.id} v${bundle.manifest.version}`));
  printPlan(
    [
      ["target", `${repo} (${info.visibility.toLowerCase()}) → branch ${branch}, /${path}/`],
      ["url", publicUrl],
      ["pages", pages.enabled ? "already enabled" : `will be enabled from ${branch}`],
      ["contents", `${bundle.scenes.length} scenes, ${bundle.analysis ? "analysis, " : ""}${bundle.threads ? `${bundle.threads.threads.length} threads, ` : ""}${bundle.rationale ? "rationale" : "no rationale"}`],
    ],
    findings,
  );
  if (findings.some((f) => f.severity === "block")) {
    out(c.red("✗ blocked — fix the findings above; nothing was published."));
    return 1;
  }
  if (!values.yes) {
    out(c.yellow("Dry run. Show this plan to the author; re-run with --yes only after they approve."));
    return 0;
  }
  await pushSite(bundle, repo, branch, path);
  if (!pages.enabled) await gh(["api", "-X", "POST", `repos/${repo}/pages`, "-f", `source[branch]=${branch}`, "-f", "source[path]=/"]);
  const manifestPath = join(dir, REEL_FILES.manifest);
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  await writeFile(manifestPath, `${JSON.stringify({ ...raw, publicUrl }, null, 2)}\n`);
  out(`${c.green("✓")} published → ${c.bold(publicUrl)}`, c.dim("GitHub Pages can take a minute to deploy."));
  return 0;
}
