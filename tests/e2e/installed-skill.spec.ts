import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

// What `npx skills add voidforall/mutoscope` produces: the skill folder copied
// somewhere with no node_modules above it. The committed runtime must work there.
const run = promisify(execFile);
let root: string;
let cli: string;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mutoscope-installed-"));
  await cp(resolve("skills/mutoscope"), join(root, "skill"), { recursive: true });
  await cp(resolve("examples/spsc-evolution"), join(root, "reel"), { recursive: true });
  cli = join(root, "skill", "runtime", "cli.mjs");
});

test.afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const mutoscope = (args: string[], env: Record<string, string> = {}) =>
  run(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, ...env } });

test("validates and builds a reel with no dependencies installed", async () => {
  const v = await mutoscope(["validate", "reel"]);
  expect(v.stdout).toContain("is valid");
  await mutoscope(["build", "reel", "--out", "site"]);
  expect(await readdir(join(root, "site"))).toContain("index.html");
  expect((await mutoscope(["recipes"])).stdout).toMatch(/codebase-tour/);
});

test("without a browser, snapshot points at install-browser", async () => {
  const r = mutoscope(["snapshot", "reel"], { MUTOSCOPE_DEPS_DIR: join(root, "no-deps") });
  await expect(r).rejects.toMatchObject({ stderr: expect.stringContaining("mutoscope install-browser") });
});

test("uses the Playwright that install-browser puts in the deps dir", async () => {
  // A stand-in package shaped like the real one: CommonJS that re-exports another
  // file, so Node exposes it under `default` when imported by path.
  const deps = join(root, "deps");
  const pkg = join(deps, "node_modules", "playwright");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(deps, "package.json"), "{}");
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "playwright", main: "index.js" }));
  await writeFile(join(pkg, "impl.js"), `module.exports = { chromium: { launch: async () => { throw new Error("FAKE_CHROMIUM_LAUNCHED"); } } };`);
  await writeFile(join(pkg, "index.js"), `module.exports = require("./impl.js");`);
  const r = mutoscope(["snapshot", "reel"], { MUTOSCOPE_DEPS_DIR: deps });
  await expect(r).rejects.toMatchObject({ stderr: expect.stringContaining("Could not launch Chromium: FAKE_CHROMIUM_LAUNCHED") });
});
