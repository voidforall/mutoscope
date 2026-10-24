import { z } from "zod";
import { Id } from "./common";
import { SourceRef } from "./source-ref";

/** The anchor a viewer question is attached to. Stable ids, never only timestamps. */
export const ReelContext = z.object({
  reelId: Id,
  reelVersion: z.number().int().positive(),
  sceneId: Id,
  timestampMs: z.number().int().min(0),
  entityId: Id.optional(),
  sourceRefs: z.array(SourceRef).default([]),
  commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
});
export type ReelContext = z.infer<typeof ReelContext>;

export const ThreadStatus = z.enum(["open", "answered", "closed"]);
export type ThreadStatus = z.infer<typeof ThreadStatus>;

export const ThreadReply = z.object({
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
  url: z.string().optional(),
  aiAssisted: z.boolean().default(false),
});
export type ThreadReply = z.infer<typeof ThreadReply>;

/** A viewer question plus its replies, as synced from a collaboration backend. */
export const Thread = z.object({
  id: z.string(),
  number: z.number().int().positive().optional(),
  url: z.string().optional(),
  title: z.string(),
  question: z.string(),
  author: z.string(),
  createdAt: z.string(),
  status: ThreadStatus,
  context: ReelContext,
  replies: z.array(ThreadReply).default([]),
});
export type Thread = z.infer<typeof Thread>;

/** threads.json: a snapshot baked into the reel so it renders offline. */
export const ThreadsFile = z.object({
  syncedAt: z.string(),
  threads: z.array(Thread),
});
export type ThreadsFile = z.infer<typeof ThreadsFile>;
