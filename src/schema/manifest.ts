import { z } from "zod";
import { HttpsUrl, Id, SCHEMA_VERSION } from "./common";
import { DATA_FILE } from "./source-ref";
import { ReelStyle } from "./stage";
import { IMAGE_SRC } from "./visuals";

const Sha = z.string().regex(/^[0-9a-f]{40}$/, "pin full 40-char commit SHAs");
const RepoSlug = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo");

export const GithubSource = z.strictObject({
  provider: z.literal("github"),
  repository: RepoSlug,
  prNumber: z.number().int().positive().optional(),
  baseSha: Sha.optional(),
  headSha: Sha,
  url: HttpsUrl.optional(),
  visibility: z.enum(["public", "private", "internal"]).optional(),
});

export const GitSource = z.strictObject({
  provider: z.literal("git"),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1),
  baseSha: Sha.optional(),
  headSha: Sha,
  /** Optional GitHub slug so code refs can still link out. */
  repository: RepoSlug.optional(),
});

export const NoSource = z.strictObject({ provider: z.literal("none") });

export const ReelSource = z.discriminatedUnion("provider", [GithubSource, GitSource, NoSource]);
export type ReelSource = z.infer<typeof ReelSource>;

/** A web page snapshotted by `mutoscope ingest url`; refs to it are checked against the snapshot. */
export const PinnedDocument = z.strictObject({
  url: HttpsUrl,
  title: z.string().max(200).optional(),
  retrievedAt: z.string().datetime({ offset: true }),
  /** sha256 of the snapshot text in source/web/. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type PinnedDocument = z.infer<typeof PinnedDocument>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** A dataset copied into source/data/ by `mutoscope ingest data`; charts and stats bound to it are checked against it. */
export const PinnedDataset = z.strictObject({
  file: z.string().regex(DATA_FILE),
  /** Where it was downloaded from; absent for a local file. */
  source: HttpsUrl.optional(),
  title: z.string().max(200).optional(),
  retrievedAt: z.string().datetime({ offset: true }),
  sha256: Sha256,
  rows: z.number().int().min(0),
  columns: z.array(z.string()).max(200),
});
export type PinnedDataset = z.infer<typeof PinnedDataset>;

/** An image fetched into assets/ by `mutoscope ingest image`, with where it came from. */
export const PinnedMedia = z.strictObject({
  src: z.string().regex(IMAGE_SRC),
  source: HttpsUrl,
  retrievedAt: z.string().datetime({ offset: true }),
  sha256: Sha256,
});
export type PinnedMedia = z.infer<typeof PinnedMedia>;

export const GithubDiscussionsCollab = z.strictObject({
  adapter: z.literal("github-discussions"),
  repository: RepoSlug,
  category: z.string().min(1),
  /** Category slug used to prefill github.com/<repo>/discussions/new. */
  categorySlug: z.string().regex(/^[a-z0-9-]+$/),
});
export type GithubDiscussionsCollab = z.infer<typeof GithubDiscussionsCollab>;

export const Collaboration = z.discriminatedUnion("adapter", [GithubDiscussionsCollab]);
export type Collaboration = z.infer<typeof Collaboration>;

export const Manifest = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  /** Bumped on every rebuild that changes content; anchors record it. */
  version: z.number().int().positive().default(1),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(240).optional(),
  /** Name of the recipe that produced this reel, e.g. "pr" or "concept". */
  recipe: Id,
  /** The stage's palette and display type. */
  style: ReelStyle.default("studio"),
  /** Short kicker shown above the title, e.g. "PR #142 · Walkthrough". */
  kicker: z.string().max(60).optional(),
  createdAt: z.string().datetime({ offset: true }),
  source: ReelSource,
  documents: z.array(PinnedDocument).default([]),
  datasets: z.array(PinnedDataset).default([]),
  media: z.array(PinnedMedia).default([]),
  /** Scene a plain link opens on; defaults to the first scene. */
  entrySceneId: Id.optional(),
  collaboration: Collaboration.optional(),
  /** Where the reel is (or will be) published; used for deep links in discussions. */
  publicUrl: HttpsUrl.optional(),
});
export type Manifest = z.infer<typeof Manifest>;
