import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildDeepLink } from "../../core";
import type { ReelBundle, ReelContext } from "../../schema";
import { launchBrowser } from "./browser";
import { buildSite } from "./build";

export interface FrameRequest {
  readonly id: string;
  readonly context: ReelContext;
}

/**
 * Render the exact moment each question was asked (entity selected) to a PNG,
 * so an agent can look at what the viewer saw. Best effort: without Playwright
 * Chromium it returns no frames and says why.
 */
export async function renderFrames(bundle: ReelBundle, requests: readonly FrameRequest[], outDir: string): Promise<{ frames: ReadonlyMap<string, string>; note?: string }> {
  if (requests.length === 0) return { frames: new Map() };
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { frames: new Map(), note: `No frame images: ${(e as Error).message}` };
  }
  const site = await mkdtemp(join(tmpdir(), "mutoscope-frame-"));
  const frames = new Map<string, string>();
  try {
    await buildSite(bundle, site);
    await mkdir(outDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    const base = pathToFileURL(join(site, "index.html")).href;
    for (const r of requests) {
      const { sceneId, timestampMs: tMs, entityId } = r.context;
      await page.goto(buildDeepLink(base, { sceneId, tMs, entityId }));
      await page.waitForFunction("window.mutoscope && window.mutoscope.ready");
      await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
      const file = join(outDir, `${r.id}.png`);
      await page.locator(".stage-frame").screenshot({ path: file });
      frames.set(r.id, file);
    }
    return { frames };
  } catch (e) {
    return { frames, note: `Some frames failed: ${(e as Error).message}` };
  } finally {
    await browser.close();
    await rm(site, { recursive: true, force: true });
  }
}
