import { z } from "zod";
import { Analysis } from "./analysis";
import { ThreadsFile } from "./collaboration";
import { Manifest } from "./manifest";
import { Scene } from "./scene";

/** Everything the player needs, as embedded into index.html. */
export const ReelBundle = z.object({
  manifest: Manifest,
  scenes: z.array(Scene).min(1),
  analysis: Analysis.optional(),
  threads: ThreadsFile.optional(),
  /** Author-approved design rationale (markdown), the only "memory" Q&A may use. */
  rationale: z.string().max(20_000).optional(),
});
export type ReelBundle = z.infer<typeof ReelBundle>;
