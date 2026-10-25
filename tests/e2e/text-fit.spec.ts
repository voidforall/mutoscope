import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { componentTextFits, gridToRect } from "../../src/core";

// Calibrates validate's component-text estimate against the real renderer:
// whatever validate says fits must not be clipped in the browser.
const run = promisify(execFile);
const LABELS = ["Core 1", "Worker A", "LIFO slot · victim task", "Supervised fine-tuning", "Qwen2.5-Coder-0.5B, prompted", "WorldTUI · 360M params", "Memory tests are short-gap", "Monochrome ASCII only", "Teacher minus layer 7 only"];
const SUBS = [undefined, "producer", "never yields", "Core.lifo_slot: Option<..>", "notifies victim, then spins", "ShellBench 52/106 · readbacks 2/13", "0–1 commands between write & read"];
const SPANS = [
  { colSpan: 2, rowSpan: 1 },
  { colSpan: 3, rowSpan: 1 },
  { colSpan: 4, rowSpan: 1 },
  { colSpan: 2, rowSpan: 2 },
];

interface Case {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly span: (typeof SPANS)[number];
}
const cases: Case[] = LABELS.flatMap((label, li) => SUBS.flatMap((sublabel, si) => SPANS.map((span, pi) => ({ id: `c-${li}-${si}-${pi}`, label, sublabel, span }))));
const PER_SCENE = 8;

let root: string;
let page: string;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mutoscope-fit-"));
  const reel = join(root, "reel");
  await cp(resolve("examples/spsc-evolution"), reel, { recursive: true });
  const raw = JSON.parse(await readFile(join(reel, "scenes.json"), "utf8"));
  const base = raw.scenes[0];
  const scenes = [];
  for (let i = 0; i < cases.length; i += PER_SCENE) {
    const entities = cases.slice(i, i + PER_SCENE).map((c, k) => ({
      id: c.id,
      type: "component",
      label: c.label,
      ...(c.sublabel ? { sublabel: c.sublabel } : {}),
      explanation: "x",
      // Two columns of four, far enough apart that nothing overlaps.
      layout: { col: k < 4 ? 1 : 7, row: (k % 4) * 2 + 1, ...c.span },
    }));
    scenes.push({ ...base, id: `fit-${i / PER_SCENE}`, entities, timeline: [], claims: [], cues: [] });
  }
  await writeFile(join(reel, "scenes.json"), JSON.stringify({ scenes }));
  await rm(join(reel, "analysis.json"));
  const { entrySceneId: _entry, ...manifest } = JSON.parse(await readFile(join(reel, "manifest.json"), "utf8"));
  await writeFile(join(reel, "manifest.json"), JSON.stringify(manifest));
  await run(process.execPath, [resolve("skills/mutoscope/runtime/cli.mjs"), "build", reel, "--out", join(root, "site")]);
  page = pathToFileURL(join(root, "site", "index.html")).href;
});

test.afterAll(() => rm(root, { recursive: true, force: true }));

test("validate never calls clipped component text a fit", async ({ page: p }) => {
  const clipped = new Map<string, boolean>();
  for (let s = 0; s * PER_SCENE < cases.length; s++) {
    await p.goto(`${page}?scene=fit-${s}&t=0`);
    await p.waitForFunction(() => (window as any).mutoscope?.ready);
    const found = await p.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".node-component")].map((node) => {
        const box = node.getBoundingClientRect();
        const parts = [...node.querySelectorAll<HTMLElement>(".node-title, .node-sub")];
        // Flex layout squeezes a line by a pixel or two invisibly; losing a quarter line or more is visible.
        const clamped = parts.some((el) => el.scrollHeight - el.clientHeight > 6);
        const spills = parts.some((el) => {
          const r = el.getBoundingClientRect();
          return r.top < box.top + 1 || r.bottom > box.bottom - 1;
        });
        return { id: node.dataset.entity!, clipped: clamped || spills };
      }),
    );
    for (const f of found) clipped.set(f.id, f.clipped);
  }
  expect(clipped.size).toBe(cases.length);
  const missed = cases.filter((c) => clipped.get(c.id) && componentTextFits(c, gridToRect({ col: 1, row: 1, ...c.span })));
  const overcautious = cases.filter((c) => !clipped.get(c.id) && !componentTextFits(c, gridToRect({ col: 1, row: 1, ...c.span })));
  expect(missed.map((c) => `${c.label} / ${c.sublabel} @ ${c.span.colSpan}x${c.span.rowSpan}`)).toEqual([]);
  // Erring toward a warning is fine, but not so often that warnings become noise.
  expect(overcautious.length / cases.length).toBeLessThan(0.1);
});
