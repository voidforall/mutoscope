import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aggregate, matchesShown, parseDataset, profile, toNumber } from "../../src/cli/lib/dataset";
import { ingestData, ingestImage } from "../../src/cli/lib/ingest-media";
import { validateReelDir } from "../../src/cli/lib/reel";
import { Manifest } from "../../src/schema";
import { pngBytes } from "./image-assets.test";

describe("parseDataset", () => {
  it("reads CSV with quotes, CRLF and a BOM", () => {
    const ds = parseDataset('﻿year,"region, name",users\r\n2023,"EU, ""west""",1200\r\n2024,US,"1,500"\r\n', "x.csv");
    expect(ds.columns).toEqual(["year", "region, name", "users"]);
    expect(ds.rows).toEqual([
      { year: "2023", "region, name": 'EU, "west"', users: "1200" },
      { year: "2024", "region, name": "US", users: "1,500" },
    ]);
  });

  it("reads TSV and JSON arrays of objects", () => {
    expect(parseDataset("a\tb\n1\t2\n", "x.tsv").rows).toEqual([{ a: "1", b: "2" }]);
    expect(parseDataset('[{"a":1,"b":null},{"a":2,"c":{"d":1}}]', "x.json")).toEqual({ columns: ["a", "b", "c"], rows: [{ a: "1", b: "", c: "" }, { a: "2", b: "", c: '{"d":1}' }] });
  });

  it("rejects ragged rows, duplicate headers and non-tabular JSON", () => {
    expect(() => parseDataset("a,b\n1\n", "x.csv")).toThrow(/row 2 has 1 fields, the header has 2/);
    expect(() => parseDataset("a,a\n1,2\n", "x.csv")).toThrow(/repeats a column name/);
    expect(() => parseDataset('{"a":1}', "x.json")).toThrow(/array of objects/);
  });
});

describe("numbers", () => {
  it("reads formatted numbers and nothing else", () => {
    expect(toNumber("1,234,567.5")).toBe(1234567.5);
    expect(toNumber("$12")).toBe(12);
    expect(toNumber("45%")).toBe(45);
    expect(toNumber("-3e2")).toBe(-300);
    expect(toNumber("1,23")).toBeNaN();
    expect(toNumber("n/a")).toBeNaN();
  });

  it("aggregates and insists on one row for none", () => {
    const rows = [{ v: "2" }, { v: "4" }];
    expect(aggregate(rows, "v", "sum")).toMatchObject({ ok: true, value: 6 });
    expect(aggregate(rows, "v", "mean")).toMatchObject({ ok: true, value: 3 });
    expect(aggregate(rows, undefined, "count")).toMatchObject({ ok: true, value: 2 });
    expect(aggregate(rows, "v", "none")).toMatchObject({ ok: false, reason: expect.stringMatching(/2 rows match/) });
    expect(aggregate([{ v: "x" }], "v", "none")).toMatchObject({ ok: false, reason: expect.stringMatching(/not a number/) });
  });

  it("accepts honest rounding only", () => {
    expect(matchesShown(47, 46.8)).toBe(true);
    expect(matchesShown(3.4, 3.41)).toBe(true);
    expect(matchesShown(140, 140.6)).toBe(true);
    expect(matchesShown(50, 46.8)).toBe(false);
    expect(matchesShown(3.4, 3.46)).toBe(false);
  });

  it("profiles columns", () => {
    const [year, region] = profile(parseDataset("year,region\n2023,EU\n2024,US\n", "x.csv"));
    expect(year).toMatchObject({ name: "year", numeric: true, min: 2023, max: 2024 });
    expect(region).toMatchObject({ name: "region", numeric: false, distinct: 2, samples: ["EU", "US"] });
  });
});

describe("datasets end to end", () => {
  let dir: string;
  let reel: string;
  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    dir = await mkdtemp(join(tmpdir(), "mutoscope-data-"));
    reel = join(dir, "reel");
    await import("node:fs/promises").then((fs) => fs.mkdir(reel));
    const manifest = Manifest.parse({ schemaVersion: "0.1.0", id: "d", title: "D", recipe: "data-story", createdAt: "2026-10-26T00:00:00Z", source: { provider: "none" } });
    await writeFile(join(reel, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(dir, "users.csv"), "year,region,users\n2023,EU,1200\n2023,US,3400\n2024,EU,1500\n2024,US,4100\n");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  const scenes = (entities: object[]) => writeFile(join(reel, "scenes.json"), JSON.stringify({ scenes: [{ id: "s", title: "S", durationMs: 10000, narration: "n", entities }] }));
  const chart = (values: number[], extra: object = {}) => ({
    id: "c",
    type: "chart",
    kind: "column",
    categories: ["2023", "2024"],
    series: [{ name: "Users", values, column: "users" }],
    data: { file: "users.csv", category: "year", aggregate: "sum", ...extra },
    layout: "full",
  });

  it("pins a dataset and recomputes bound charts and stats", async () => {
    await ingestData(join(dir, "users.csv"), reel, {});
    const manifest = JSON.parse(await readFile(join(reel, "manifest.json"), "utf8"));
    expect(manifest.datasets[0]).toMatchObject({ file: "users.csv", rows: 4, columns: ["year", "region", "users"] });
    expect(manifest.datasets[0].source).toBeUndefined();

    await scenes([chart([4.6, 5.6], { scale: 0.001 }), { id: "st", type: "stat", value: 1500, label: "EU users in 2024", data: { file: "users.csv", column: "users", where: { year: "2024", region: "EU" } }, layout: { col: 1, row: 1, colSpan: 4, rowSpan: 3 } }]);
    const ok = await validateReelDir(reel);
    expect(ok.errors).toEqual([]);

    await scenes([chart([4600, 9999]), { id: "st", type: "stat", value: 1600, label: "EU users", data: { file: "users.csv", column: "users", where: { year: "2024", region: "EU" } }, layout: { col: 1, row: 1, colSpan: 4, rowSpan: 3 } }]);
    const bad = (await validateReelDir(reel)).errors.map((e) => e.message);
    expect(bad).toEqual(
      expect.arrayContaining([
        "chart 'c' series 'Users' at '2024' shows 9,999, but users.csv gives 5,600 (sum of 'users' over 2 rows)",
        "stat 'st' shows 1,600, but users.csv gives 1,500",
      ]),
    );
  });

  it("explains missing columns, ambiguous rows and unbound numbers", async () => {
    await ingestData(join(dir, "users.csv"), reel, {});
    await scenes([chart([4600, 5600], { aggregate: "none" }), { id: "s2", type: "stat", value: 1, label: "x", layout: { col: 1, row: 1, colSpan: 4, rowSpan: 3 } }]);
    const r = await validateReelDir(reel);
    expect(r.errors.map((e) => e.message)).toContain("chart 'c' series 'Users' at '2023': 2 rows match; set an aggregate (sum, mean, min, max or count) or a narrower where");
    expect(r.warnings.map((w) => w.message)).toContain(`stat 's2' is not bound to a dataset, so its numbers are unchecked; add "data": { "file": … }`);
    await scenes([chart([1, 2], { category: "yr" })]);
    expect((await validateReelDir(reel)).errors.map((e) => e.message)).toContain("users.csv has no column 'yr' (columns: year, region, users)");
  });

  it("copies local images into assets without their metadata", async () => {
    const png = Buffer.concat([pngBytes(4, 3).subarray(0, 33), Buffer.from([0, 0, 0, 3, 0x74, 0x45, 0x58, 0x74, 0x47, 0x50, 0x53, 0, 0, 0, 0])]);
    await writeFile(join(dir, "My Shot!.png"), png);
    await ingestImage(join(dir, "My Shot!.png"), reel, {});
    const copied = await readFile(join(reel, "assets", "My-Shot.png"));
    expect(copied.toString("latin1")).not.toContain("GPS");
    expect(JSON.parse(await readFile(join(reel, "manifest.json"), "utf8")).media).toEqual([]);
  });
});
