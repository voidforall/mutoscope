import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "../lib/args";
import { depsDir } from "../lib/browser";
import { c, out } from "../lib/output";
import { CliError } from "../lib/reel-files";

export const help = "install-browser                                       One-time: Playwright + Chromium for snapshot, export and live frames";

declare const __PLAYWRIGHT_VERSION__: string | undefined;
/** Injected at build time from package-lock.json, so installs match the version the player is tested with. */
const PLAYWRIGHT_VERSION = typeof __PLAYWRIGHT_VERSION__ === "string" ? __PLAYWRIGHT_VERSION__ : "latest";

function runVisible(cmd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // npm is a .cmd shim on Windows, which Node only runs through a shell; the arguments are fixed, never user input.
    const child = spawn(cmd, [...args], { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", (e) => reject(new CliError(`Could not run ${cmd}: ${e.message}`)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new CliError(`${cmd} ${args[0]} exited with code ${code}`))));
  });
}

export async function run(argv: readonly string[]): Promise<number> {
  parse(argv, {});
  const dir = depsDir();
  await mkdir(dir, { recursive: true });
  if (!existsSync(join(dir, "package.json"))) {
    await writeFile(join(dir, "package.json"), `${JSON.stringify({ name: "mutoscope-deps", private: true }, null, 2)}\n`);
  }
  out(c.dim(`Installing playwright@${PLAYWRIGHT_VERSION} into ${dir} …`));
  await runVisible("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", `playwright@${PLAYWRIGHT_VERSION}`]);
  out(c.dim("Downloading Chromium …"));
  await runVisible(process.execPath, [join(dir, "node_modules", "playwright", "cli.js"), "install", "chromium"]);
  out(`${c.green("✓")} browser ready — snapshot, export and live-session frames will use it.`);
  return 0;
}
