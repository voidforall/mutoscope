import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, positional } from "../lib/args";
import { launchBrowser } from "../lib/browser";
import { buildSite } from "../lib/build";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";
import { CliError } from "../lib/reel-files";

export const help = "export <reel-dir> [--out reel.mp4] [--fps 30] [--theme dark|light]  Render an MP4 (needs ffmpeg)";

const FRAME = { width: 1920, height: 1080 };

function startEncoder(file: string, fps: number) {
  const ff = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", file],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise<void>((ok, fail) => {
    ff.on("error", (e) => fail(new CliError(`ffmpeg could not start: ${e.message}`, "Install ffmpeg and make sure it is on PATH.")));
    ff.on("close", (code) => (code === 0 ? ok() : fail(new CliError(`ffmpeg exited with code ${code}`))));
  });
  const write = (buf: Buffer) => new Promise<void>((ok) => (ff.stdin.write(buf) ? ok() : ff.stdin.once("drain", () => ok())));
  return { write, finish: () => (ff.stdin.end(), done) };
}

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { out: { type: "string" }, fps: { type: "string" }, theme: { type: "string" } });
  const dir = positional(positionals, 0, "reel-dir");
  const bundle = await loadValidReel(dir);
  const fps = Number(values.fps ?? 30);
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new CliError("--fps must be an integer between 1 and 60");
  const file = resolve(values.out ?? join(dir, `${bundle.manifest.id}.mp4`));
  const site = await mkdtemp(join(tmpdir(), "mutoscope-export-"));
  await buildSite(bundle, site);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: FRAME, deviceScaleFactor: 1 });
    await page.emulateMedia({ colorScheme: values.theme === "light" ? "light" : "dark", reducedMotion: "reduce" });
    await page.goto(`${pathToFileURL(join(site, "index.html")).href}?mode=video`);
    await page.waitForFunction("window.mutoscope && window.mutoscope.ready");
    const total = Number(await page.evaluate("window.mutoscope.durationMs"));
    const frames = Math.ceil((total / 1000) * fps) + 1;
    const encoder = startEncoder(file, fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate(`window.mutoscope.seekGlobal(${Math.min(total, (i * 1000) / fps)})`);
      await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
      await encoder.write(await page.screenshot({ type: "png" }));
      if (i % (fps * 10) === 0) out(c.dim(`  frame ${i}/${frames}`));
    }
    await encoder.finish();
  } finally {
    await browser.close();
    await rm(site, { recursive: true, force: true });
  }
  out(`${c.green("✓")} ${file}`);
  return 0;
}
