import { z } from "zod";
import { HttpsUrl, Id, SCHEMA_VERSION } from "./common";

const Sha = z.string().regex(/^[0-9a-f]{40}$/, "pin full 40-char commit SHAs");
const RepoSlug = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo");

export const GithubSource = z.object({
  provider: z.literal("github"),
  repository: RepoSlug,
  prNumber: z.number().int().positive().optional(),
  baseSha: Sha.optional(),
  headSha: Sha,
  url: HttpsUrl.optional(),
  visibility: z.enum(["public", "private", "internal"]).optional(),
});

export const GitSource = z.object({
  provider: z.literal("git"),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1),
  baseSha: Sha.optional(),
  headSha: Sha,
  /** Optional GitHub slug so code refs can still link out. */
  repository: RepoSlug.optional(),
});

export const NoSource = z.object({ provider: z.literal("none") });

export const ReelSource = z.discriminatedUnion("provider", [GithubSource, GitSource, NoSource]);
export type ReelSource = z.infer<typeof ReelSource>;

export const GithubDiscussionsCollab = z.object({
  adapter: z.literal("github-discussions"),
  repository: RepoSlug,
  category: z.string().min(1),
  /** Category slug used to prefill github.com/<repo>/discussions/new. */
  categorySlug: z.string().regex(/^[a-z0-9-]+$/),
});
export type GithubDiscussionsCollab = z.infer<typeof GithubDiscussionsCollab>;

export const Collaboration = z.discriminatedUnion("adapter", [GithubDiscussionsCollab]);
export type Collaboration = z.infer<typeof Collaboration>;

export const Manifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  /** Bumped on every rebuild that changes content; anchors record it. */
  version: z.number().int().positive().default(1),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(240).optional(),
  /** Name of the recipe that produced this reel, e.g. "pr" or "concept". */
  recipe: Id,
  /** Short kicker shown above the title, e.g. "PR #142 · Walkthrough". */
  kicker: z.string().max(60).optional(),
  createdAt: z.string().datetime({ offset: true }),
  source: ReelSource,
  entrySceneId: Id,
  collaboration: Collaboration.optional(),
  /** Where the reel is (or will be) published; used for deep links in discussions. */
  publicUrl: HttpsUrl.optional(),
});
export type Manifest = z.infer<typeof Manifest>;
