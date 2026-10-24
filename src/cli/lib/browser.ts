import { CliError } from "./reel-files";

/** The subset of Playwright's API the CLI uses; Playwright itself stays an optional dependency. */
export interface Page {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
  screenshot(o: { type: "png" }): Promise<Buffer>;
  locator(sel: string): { screenshot(o: { path: string }): Promise<unknown> };
  on(event: "pageerror", fn: (e: Error) => void): void;
  emulateMedia(o: { colorScheme: string; reducedMotion: string }): Promise<void>;
}

export interface Browser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page>;
  close(): Promise<void>;
}

export async function launchBrowser(): Promise<Browser> {
  for (const mod of ["playwright", "@playwright/test"]) {
    try {
      const pw = (await import(mod)) as { chromium: { launch(): Promise<Browser> } };
      return await pw.chromium.launch();
    } catch {
      // try the next module name
    }
  }
  throw new CliError("Playwright Chromium is not available", "In the mutoscope repo: `npm install && npx playwright install chromium`.");
}
