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

export const UrlRef = z.object({
  kind: z.literal("url"),
  url: HttpsUrl,
  title: z.string().min(1).max(200).optional(),
});
export type UrlRef = z.infer<typeof UrlRef>;

export const SourceRef = z.discriminatedUnion("kind", [CodeRef, UrlRef]);
export type SourceRef = z.infer<typeof SourceRef>;
