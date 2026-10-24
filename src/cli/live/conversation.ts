import type { LiveAnswer, LiveAsk, LiveEntry, LivePresence, LiveQuestion } from "../../schema";

/**
 * Pure state transitions for a live session's conversation. The server owns
 * the I/O; everything that decides who sees what lives here.
 */
export type Entries = readonly LiveEntry[];

const isQuestion = (e: LiveEntry): e is LiveQuestion => e.role === "viewer";

export function addQuestion(entries: Entries, ask: LiveAsk, id: string, at: string): Entries {
  return [...entries, { role: "viewer", id, at, text: ask.text, context: ask.context, status: "queued" }];
}

/** Questions a poll should hand over: new ones, plus any handed over earlier but never answered. */
export function pendingQuestions(entries: Entries): LiveQuestion[] {
  return entries.filter(isQuestion).filter((q) => q.status !== "answered");
}

export function markDelivered(entries: Entries, ids: readonly string[]): Entries {
  const set = new Set(ids);
  return entries.map((e) => (isQuestion(e) && set.has(e.id) && e.status === "queued" ? { ...e, status: "delivered" as const } : e));
}

/** The agent's reply answers everything it was handed; with nothing outstanding it is a plain note. */
export function addAnswer(entries: Entries, text: string, id: string, at: string): Entries {
  const answered = entries.filter(isQuestion).filter((q) => q.status === "delivered").map((q) => q.id);
  const set = new Set(answered);
  const marked = entries.map((e) => (isQuestion(e) && set.has(e.id) ? { ...e, status: "answered" as const } : e));
  const answer: LiveAnswer = { role: "agent", id, at, text, inReplyTo: answered };
  return [...marked, answer];
}

export function presenceOf(entries: Entries, polling: boolean): LivePresence {
  if (polling) return "listening";
  return entries.some((e) => isQuestion(e) && e.status === "delivered") ? "working" : "offline";
}
