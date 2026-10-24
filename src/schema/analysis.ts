import { z } from "zod";
import { Basis, Confidence, Id } from "./common";
import { SourceRef } from "./source-ref";

/** One assertion with its epistemic status. Evidence claims must cite refs. */
export const Claim = z
  .object({
    text: z.string().min(1).max(600),
    basis: Basis,
    refs: z.array(SourceRef).default([]),
  })
  .refine((c) => c.basis === "inference" || c.refs.length > 0, {
    message: "an evidence claim must cite at least one ref",
  });
export type Claim = z.infer<typeof Claim>;

/**
 * Analysis IR: the recipe-neutral layer between raw sources and the storyboard.
 * A recipe decides which `kind` values make sense (e.g. "behavior", "refactor"
 * for code changes; "mechanism", "tradeoff" for concepts).
 */
export const AnalysisUnit = z.object({
  id: Id,
  kind: Id,
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  claims: z.array(Claim).default([]),
  entities: z.array(z.string().min(1)).default([]),
  refs: z.array(SourceRef).default([]),
  confidence: Confidence,
});
export type AnalysisUnit = z.infer<typeof AnalysisUnit>;

export const Analysis = z.object({
  units: z.array(AnalysisUnit).min(1),
});
export type Analysis = z.infer<typeof Analysis>;
