import { z } from "zod";

export const SCHEMA_VERSION = "0.1.0";

/** Stable identifier used in URLs, anchors and discussion metadata. */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "ids are lowercase kebab-case, 1-64 chars");
export type Id = z.infer<typeof Id>;

/** Evidence discipline: every claim says whether it is backed by evidence or inferred. */
export const Basis = z.enum(["evidence", "inference"]);
export type Basis = z.infer<typeof Basis>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const HttpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "only https:// URLs are allowed");
