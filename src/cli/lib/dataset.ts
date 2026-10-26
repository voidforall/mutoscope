import type { Aggregate } from "../../schema";
import { CliError } from "./reel-files";

/**
 * Datasets as plain tables of strings: CSV (RFC 4180 quoting), TSV, or a
 * JSON array of flat objects. Numbers are read only when a check needs them,
 * so a column of ids or years stays exactly as written.
 */
export interface Dataset {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

export const MAX_DATASET_BYTES = 10 * 1024 * 1024;
const MAX_COLUMNS = 200;
const MAX_ROWS = 200_000;

function parseDelimited(text: string, sep: string, file: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (ch === "\r" && src[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (quoted) throw new CliError(`${file}: a quoted field is never closed`);
  if (cell !== "" || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function fromJson(text: string, file: string): Dataset {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new CliError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(data) || !data.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) {
    throw new CliError(`${file} must be a JSON array of objects (one per row)`);
  }
  const columns = [...new Set(data.flatMap((r) => Object.keys(r as object)))];
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return { columns, rows: data.map((r) => Object.fromEntries(columns.map((c) => [c, cell((r as Record<string, unknown>)[c])]))) };
}

export function parseDataset(text: string, file: string): Dataset {
  const ds = file.toLowerCase().endsWith(".json") ? fromJson(text, file) : fromTable(parseDelimited(text, file.toLowerCase().endsWith(".tsv") ? "\t" : ",", file), file);
  if (ds.columns.length > MAX_COLUMNS) throw new CliError(`${file} has ${ds.columns.length} columns; the limit is ${MAX_COLUMNS}`);
  if (ds.rows.length > MAX_ROWS) throw new CliError(`${file} has ${ds.rows.length} rows; the limit is ${MAX_ROWS}`, "Aggregate or filter it first.");
  return ds;
}

function fromTable(table: string[][], file: string): Dataset {
  const [header, ...body] = table;
  if (!header || header.every((h) => !h.trim())) throw new CliError(`${file} has no header row`);
  const columns = header.map((h, i) => h.trim() || `column_${i + 1}`);
  if (new Set(columns).size !== columns.length) throw new CliError(`${file} repeats a column name in its header`);
  body.forEach((r, i) => {
    if (r.length !== columns.length) throw new CliError(`${file}: row ${i + 2} has ${r.length} fields, the header has ${columns.length}`);
  });
  return { columns, rows: body.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]!.trim()]))) };
}

/** A cell as a number: allows thousands separators, a leading currency sign and a trailing %. NaN otherwise. */
export function toNumber(cell: string): number {
  const s = cell.trim().replace(/^[$€£¥]/, "").replace(/%$/, "").replace(/(?<=\d)[,_ ](?=\d{3}\b)/g, "");
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

export type AggregateResult = { readonly ok: true; readonly value: number; readonly rows: number } | { readonly ok: false; readonly reason: string };

/** Combine the rows' `column` values; `none` insists on exactly one row. */
export function aggregate(rows: readonly Readonly<Record<string, string>>[], column: string | undefined, how: Aggregate): AggregateResult {
  if (how === "count") return { ok: true, value: rows.length, rows: rows.length };
  if (rows.length === 0) return { ok: false, reason: "no rows match" };
  if (!column) return { ok: false, reason: "no column named" };
  if (how === "none" && rows.length > 1) return { ok: false, reason: `${rows.length} rows match; set an aggregate (sum, mean, min, max or count) or a narrower where` };
  const values = rows.map((r) => toNumber(r[column] ?? ""));
  const bad = values.findIndex((v) => Number.isNaN(v));
  if (bad >= 0) return { ok: false, reason: `'${rows[bad]![column]}' in column '${column}' is not a number` };
  const sum = values.reduce((a, b) => a + b, 0);
  const value = how === "sum" ? sum : how === "mean" ? sum / values.length : how === "min" ? Math.min(...values) : how === "max" ? Math.max(...values) : values[0]!;
  return { ok: true, value, rows: rows.length };
}

const decimalsOf = (n: number) => {
  const s = String(n);
  return s.includes("e") ? 6 : s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
};

/**
 * Whether a shown number honestly represents the data: equal up to the
 * rounding the author wrote (47 for 46.8, 3.4 for 3.41), or within 0.5%.
 */
export function matchesShown(shown: number, actual: number): boolean {
  const rounding = 0.5 * 10 ** -decimalsOf(shown);
  return Math.abs(shown - actual) <= Math.max(rounding + 1e-9, Math.abs(actual) * 0.005);
}

export interface ColumnProfile {
  readonly name: string;
  readonly numeric: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly distinct: number;
  readonly samples: readonly string[];
}

/** What each column holds, so the agent can bind charts without opening a 10 MB file. */
export function profile(ds: Dataset): ColumnProfile[] {
  return ds.columns.map((name) => {
    const cells = ds.rows.map((r) => r[name] ?? "").filter((c) => c !== "");
    const nums = cells.map(toNumber);
    const numeric = cells.length > 0 && nums.every((n) => !Number.isNaN(n));
    const distinct = [...new Set(cells)];
    return {
      name,
      numeric,
      ...(numeric ? { min: Math.min(...nums), max: Math.max(...nums) } : {}),
      distinct: distinct.length,
      samples: distinct.slice(0, 5),
    };
  });
}

export const filterRows = (ds: Dataset, where: Readonly<Record<string, string>>) =>
  ds.rows.filter((r) => Object.entries(where).every(([k, v]) => (r[k] ?? "") === v));
