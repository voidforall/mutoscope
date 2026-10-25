import { homedir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError } from "./reel-files";

/** The subset of Playwright's API the CLI uses; Playwright itself stays an optional dependency. */
export interface Page {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
  screenshot(o: { type: "png"; fullPage?: boolean; path?: string }): Promise<Buffer>;
  setContent(html: string): Promise<void>;
  locator(sel: string): { screenshot(o: { path?: string }): Promise<Buffer> };
  on(event: "pageerror", fn: (e: Error) => void): void;
  emulateMedia(o: { colorScheme: string; reducedMotion: string }): Promise<void>;
}

export interface Browser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page>;
  close(): Promise<void>;
}

/** Where `mutoscope install-browser` puts Playwright when the skill was installed without node_modules. */
export const depsDir = () => resolve(process.env.MUTOSCOPE_DEPS_DIR ?? join(homedir(), ".mutoscope", "deps"));

type PlaywrightModule = { chromium: { launch(): Promise<Browser> } };

async function loadPlaywright(): Promise<PlaywrightModule | undefined> {
  for (const mod of ["playwright", "@playwright/test"]) {
    try {
      return (await import(mod)) as PlaywrightModule;
    } catch {
      // not resolvable from here; try the next one
    }
  }
  try {
    const entry = createRequire(join(depsDir(), "package.json")).resolve("playwright");
    // Imported by path, a CommonJS module exposes its exports under `default`.
    const mod = (await import(pathToFileURL(entry).href)) as PlaywrightModule & { default?: PlaywrightModule };
    return mod.chromium ? mod : mod.default;
  } catch {
    return undefined;
  }
}

const INSTALL_HINT = "Run `mutoscope install-browser` once (installs Playwright + Chromium into ~/.mutoscope/deps).";

export async function launchBrowser(): Promise<Browser> {
  const pw = await loadPlaywright();
  if (!pw) throw new CliError("Playwright is not installed", INSTALL_HINT);
  try {
    return await pw.chromium.launch();
  } catch (e) {
    const first = (e as Error).message.split("\n")[0];
    throw new CliError(`Could not launch Chromium: ${first}`, INSTALL_HINT);
  }
}
