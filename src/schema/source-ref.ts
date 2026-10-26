import { z } from "zod";
import { HttpsUrl } from "./common";

/**
 * `head` / `base` resolve against the manifest's pinned source revisions;
 * anything else must be a full or abbreviated commit SHA.
 */
export const Revision = z.union([
  z.literal("head"),
  z.literal("base"),
  z.string().regex(/^[0-9a-f]{7,40}$/, "revision must be head, base or a commit SHA"),
]);
export type Revision = z.infer<typeof Revision>;

export const CodeRef = z
  .object({
    kind: z.literal("code"),
    path: z
      .string()
      .min(1)
      .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), "path must be repo-relative"),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    revision: Revision.default("head"),
  })
  .refine((r) => r.endLine === undefined || (r.startLine !== undefined && r.endLine >= r.startLine), {
    message: "endLine requires startLine and must be >= startLine",
  });
export type CodeRef = z.infer<typeof CodeRef>;

export const MAX_QUOTE = 400;

export const UrlRef = z.object({
  kind: z.literal("url"),
  /** May end in `#anchor`; for a pinned document, validate checks the anchor exists. */
  url: HttpsUrl,
  title: z.string().min(1).max(200).optional(),
  /** Verbatim words from the page ("…" may join separate passages); validate checks them against the pinned snapshot. */
  quote: z.string().trim().min(1).max(MAX_QUOTE).optional(),
});
export type UrlRef = z.infer<typeof UrlRef>;

/** A dataset pinned with `mutoscope ingest data`, by its file name in source/data/. */
export const DATA_FILE = /^[A-Za-z0-9][\w.-]{0,80}\.(?:csv|tsv|json)$/;

export const DataRef = z.object({
  kind: z.literal("data"),
  file: z.string().regex(DATA_FILE, "a dataset file name such as sales.csv, as pinned by ingest data"),
  /** The columns the claim or entity rests on. */
  columns: z.array(z.string().min(1).max(80)).max(8).optional(),
  /** How the numbers were derived, e.g. "sum of revenue per year". */
  note: z.string().trim().max(160).optional(),
});
export type DataRef = z.infer<typeof DataRef>;

export const SourceRef = z.discriminatedUnion("kind", [CodeRef, UrlRef, DataRef]);
export type SourceRef = z.infer<typeof SourceRef>;
