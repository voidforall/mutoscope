import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChartEntity, ReelBundle, StatEntity } from "../../schema";
import { aggregate, filterRows, matchesShown, parseDataset, type Dataset } from "./dataset";
import { SOURCE_DIR } from "./pin";

export const DATA_DIR = "data";

interface Issue {
  readonly path: string;
  readonly message: string;
}

const fmt = (n: number) => Number(n.toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 6 });

function checkColumns(ds: Dataset, file: string, cols: readonly (string | undefined)[], where: Readonly<Record<string, string>>): string[] {
  return [...cols, ...Object.keys(where)].filter((c): c is string => c !== undefined && !ds.columns.includes(c)).map((c) => `${file} has no column '${c}' (columns: ${ds.columns.join(", ")})`);
}

function checkChart(e: ChartEntity, ds: Dataset): string[] {
  const data = e.data!;
  const missing = checkColumns(ds, data.file, [data.category, ...e.series.map((s) => s.column)], data.where);
  if (missing.length) return missing;
  const rows = filterRows(ds, data.where);
  const problems: string[] = [];
  e.categories.forEach((cat, i) => {
    const inCat = rows.filter((r) => r[data.category] === cat);
    if (inCat.length === 0) {
      problems.push(`chart '${e.id}': no rows with ${data.category} = '${cat}' in ${data.file}`);
      return;
    }
    for (const s of e.series) {
      const r = aggregate(inCat, s.column, data.aggregate);
      if (!r.ok) problems.push(`chart '${e.id}' series '${s.name}' at '${cat}': ${r.reason}`);
      else if (!matchesShown(s.values[i]!, r.value * data.scale)) {
        const how = data.aggregate === "none" ? `'${s.column}'` : `${data.aggregate} of '${s.column ?? "rows"}' over ${r.rows} rows`;
        problems.push(`chart '${e.id}' series '${s.name}' at '${cat}' shows ${fmt(s.values[i]!)}, but ${data.file} gives ${fmt(r.value * data.scale)} (${how}${data.scale !== 1 ? ` × ${data.scale}` : ""})`);
      }
    }
  });
  return problems;
}

function checkStat(e: StatEntity, ds: Dataset): string[] {
  const data = e.data!;
  const missing = checkColumns(ds, data.file, [data.column], data.where);
  if (missing.length) return missing;
  const r = aggregate(filterRows(ds, data.where), data.column, data.aggregate);
  if (!r.ok) return [`stat '${e.id}': ${r.reason}`];
  return matchesShown(e.value, r.value * data.scale) ? [] : [`stat '${e.id}' shows ${fmt(e.value)}, but ${data.file} gives ${fmt(r.value * data.scale)}`];
}

/**
 * Numbers bound to pinned datasets are recomputed from the data: a chart or
 * stat can round, but it cannot show a number the data does not support.
 */
export async function checkDatasets(bundle: ReelBundle, reelDir: string): Promise<{ errors: Issue[]; warnings: Issue[] }> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const pinned = new Map(bundle.manifest.datasets.map((d) => [d.file, d]));
  const cache = new Map<string, Dataset | null>();
  const load = async (file: string, path: string): Promise<Dataset | null> => {
    if (cache.has(file)) return cache.get(file)!;
    const pin = pinned.get(file);
    const on = join(reelDir, SOURCE_DIR, DATA_DIR, file);
    let ds: Dataset | null = null;
    if (!pin) errors.push({ path, message: `${file} is not a pinned dataset; run \`mutoscope ingest data <file-or-url> --reel <dir>\`` });
    else if (!existsSync(on)) errors.push({ path, message: `${file} is pinned but missing from ${join(SOURCE_DIR, DATA_DIR)}/; ingest it again` });
    else {
      const text = await readFile(on, "utf8");
      if (createHash("sha256").update(text, "utf8").digest("hex") !== pin.sha256) warnings.push({ path, message: `${file} changed since it was pinned; ingest it again so the manifest records this version` });
      ds = parseDataset(text, file);
    }
    cache.set(file, ds);
    return ds;
  };
  for (const [si, scene] of bundle.scenes.entries()) {
    for (const [ei, e] of scene.entities.entries()) {
      const path = `scenes[${si}].entities[${ei}]`;
      if ((e.type === "chart" || e.type === "stat") && e.data) {
        const ds = await load(e.data.file, path);
        if (ds) errors.push(...(e.type === "chart" ? checkChart(e, ds) : checkStat(e, ds)).map((message) => ({ path, message })));
      } else if ((e.type === "chart" || e.type === "stat") && pinned.size > 0) {
        warnings.push({ path, message: `${e.type} '${e.id}' is not bound to a dataset, so its numbers are unchecked; add "data": { "file": … }` });
      }
      for (const r of e.sourceRefs) if (r.kind === "data" && !pinned.has(r.file)) errors.push({ path, message: `sourceRef cites ${r.file}, which is not a pinned dataset` });
    }
    for (const [ci, c] of scene.claims.entries()) {
      for (const r of c.refs) if (r.kind === "data" && !pinned.has(r.file)) errors.push({ path: `scenes[${si}].claims[${ci}]`, message: `claim cites ${r.file}, which is not a pinned dataset` });
    }
  }
  for (const [ui, u] of (bundle.analysis?.units ?? []).entries()) {
    for (const [ci, c] of u.claims.entries()) {
      for (const r of c.refs) if (r.kind === "data" && !pinned.has(r.file)) errors.push({ path: `analysis.units[${ui}].claims[${ci}]`, message: `claim cites ${r.file}, which is not a pinned dataset` });
    }
  }
  return { errors, warnings };
}
