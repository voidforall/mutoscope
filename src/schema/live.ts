import { z } from "zod";
import { ReelContext } from "./collaboration";

/**
 * A live session: the viewer watches a reel in a local browser tab and asks
 * the author's own agent about any moment, with no GitHub round-trip. The
 * conversation lives in the CLI's state dir and is never published.
 */
export const MAX_LIVE_QUESTION = 2000;
export const MAX_LIVE_ANSWER = 60_000;

export const LiveAsk = z.object({
  text: z.string().trim().min(1).max(MAX_LIVE_QUESTION),
  context: ReelContext,
});
export type LiveAsk = z.infer<typeof LiveAsk>;

/** queued → delivered (handed to a poll) → answered. */
export const LiveQuestionStatus = z.enum(["queued", "delivered", "answered"]);
export type LiveQuestionStatus = z.infer<typeof LiveQuestionStatus>;

export const LiveQuestion = z.object({
  role: z.literal("viewer"),
  id: z.string(),
  at: z.string(),
  text: z.string(),
  context: ReelContext,
  status: LiveQuestionStatus,
});
export type LiveQuestion = z.infer<typeof LiveQuestion>;

export const LiveAnswer = z.object({
  role: z.literal("agent"),
  id: z.string(),
  at: z.string(),
  /** Markdown. `?scene=…&t=…&entity=…` links seek the player in place. */
  text: z.string(),
  inReplyTo: z.array(z.string()).default([]),
});
export type LiveAnswer = z.infer<typeof LiveAnswer>;

export const LiveEntry = z.discriminatedUnion("role", [LiveQuestion, LiveAnswer]);
export type LiveEntry = z.infer<typeof LiveEntry>;

/** listening: a poll is waiting · working: questions handed over, no reply yet · offline: neither. */
export const LivePresence = z.enum(["listening", "working", "offline"]);
export type LivePresence = z.infer<typeof LivePresence>;

export const LiveSnapshot = z.object({
  entries: z.array(LiveEntry),
  presence: LivePresence,
  ended: z.boolean(),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

/** Server-sent events to the player. */
export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: LiveSnapshot }),
  z.object({ type: z.literal("reload") }),
  z.object({ type: z.literal("invalid"), message: z.string() }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;

export const LIVE_ELEMENT_ID = "mutoscope-live";

/** Embedded in the page served by a live session; absent from built/published reels. */
export const LiveConfig = z.object({
  sessionId: z.string().regex(/^[0-9a-f]{16}$/),
  token: z.string().regex(/^[0-9a-f]{32,64}$/),
});
export type LiveConfig = z.infer<typeof LiveConfig>;
