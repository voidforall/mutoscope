import { z } from "zod";
import { Analysis } from "./analysis";
import { ThreadsFile } from "./collaboration";
import { Manifest } from "./manifest";
import { IMAGE_SRC, Scene } from "./scene";

export const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;

/** An image from the reel's assets/ folder, embedded so the page never touches the network. */
export const Asset = z.strictObject({
  mime: z.enum(IMAGE_MIME),
  width: z.number().positive(),
  height: z.number().positive(),
  dataUri: z.string().regex(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/, "not a base64 image data URI"),
});
export type Asset = z.infer<typeof Asset>;

/** Everything the player needs, as embedded into index.html. */
export const ReelBundle = z.strictObject({
  manifest: Manifest,
  scenes: z.array(Scene).min(1),
  analysis: Analysis.optional(),
  threads: ThreadsFile.optional(),
  /** Author-approved design rationale (markdown), the only "memory" Q&A may use. */
  rationale: z.string().max(20_000).optional(),
  /** Images referenced by image entities, keyed by their `src`. Filled in by the CLI from assets/. */
  assets: z.record(z.string().regex(IMAGE_SRC), Asset).optional(),
});
export type ReelBundle = z.infer<typeof ReelBundle>;
