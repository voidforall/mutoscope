import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CliError } from "./reel-files";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

/** Run a binary without a shell; arguments are never interpolated. */
export async function exec(cmd: string, args: readonly string[], opts: { cwd?: string; input?: string } = {}): Promise<string> {
  try {
    const { stdout } = await run(cmd, [...args], { cwd: opts.cwd, maxBuffer: MAX_BUFFER, encoding: "utf8" });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new CliError(`\`${cmd}\` is not installed or not on PATH`);
    throw new CliError(`${cmd} ${args.slice(0, 2).join(" ")} failed: ${(err.stderr || err.message).trim()}`);
  }
}

export const gh = (args: readonly string[], cwd?: string) => exec("gh", args, { cwd });
export const git = (args: readonly string[], cwd?: string) => exec("git", args, { cwd });

export async function ghJson<T>(args: readonly string[], cwd?: string): Promise<T> {
  const out = await gh(args, cwd);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new CliError(`gh returned non-JSON output for: gh ${args.slice(0, 3).join(" ")}`);
  }
}

/** GraphQL through the author's own `gh` login; variables are passed typed, never spliced. */
export async function ghGraphql<T>(query: string, vars: Record<string, string | number>): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  const res = await ghJson<{ data?: T; errors?: { message: string }[] }>(args);
  if (res.errors?.length) throw new CliError(`GitHub GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
  if (!res.data) throw new CliError("GitHub GraphQL returned no data");
  return res.data;
}
