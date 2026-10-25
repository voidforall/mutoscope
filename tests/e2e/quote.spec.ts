import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// A built reel with a pull quote on stage and a quoted url ref, opened from disk.
const run = promisify(execFile);
let root: string;
let page: string;
const LONG = "What interests me most is that it manages to maintain a somewhat consistent world without implementing any of the rules underneath.";

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mutoscope-quote-"));
  const reel = join(root, "reel");
  await cp(resolve("examples/spsc-evolution"), reel, { recursive: true });
  const scenes = JSON.parse(await readFile(join(reel, "scenes.json"), "utf8"));
  scenes.scenes[0].entities.push({
    id: "q",
    type: "quote",
    text: LONG,
    attribution: "the author",
    explanation: "The author's conclusion.",
    sourceRefs: [{ kind: "url", url: "https://example.com/blog/2026/a-very-long-post-slug-that-goes-on/#summary", quote: "a pretty weak world model" }],
    layout: { col: 2, row: 6, colSpan: 10, rowSpan: 2 },
  });
  await writeFile(join(reel, "scenes.json"), JSON.stringify(scenes));
  await run(process.execPath, [resolve("skills/mutoscope/runtime/cli.mjs"), "build", reel, "--out", join(root, "site")]);
  page = pathToFileURL(join(root, "site", "index.html")).href;
});

test.afterAll(() => rm(root, { recursive: true, force: true }));

for (const theme of ["light", "dark"] as const) {
  test(`pull quote fits its box and its source reads cleanly (${theme})`, async ({ page: p }) => {
    await p.emulateMedia({ colorScheme: theme });
    await p.goto(`${page}?scene=mutex-baseline&t=20000&entity=q`);
    await p.waitForFunction(() => (window as any).mutoscope?.ready);
    const q = p.locator(".quote-text");
    await expect(q).toContainText(LONG);
    expect(await q.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await expect(p.locator(".quote-attrib")).toHaveText("— the author");

    await expect(p.locator(".panel-title")).toHaveText(`“${LONG}”`);
    await expect(p.locator(".ref-text")).toHaveText("example.com/…/a-very-long-post-slug-that-goes-on#summary");
    await expect(p.locator(".ref-quote")).toHaveText("“a pretty weak world model”");
    const body = p.locator(".panel-body");
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}
