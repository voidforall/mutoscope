import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join } from "node:path";
import { z } from "zod";
import { LiveEntry, type LiveAsk, type LiveEvent, type LiveQuestion, type LiveSnapshot } from "../../schema";
import { addAnswer, addQuestion, markDelivered, pendingQuestions, presenceOf, type Entries } from "./conversation";
import { sendEvent } from "./http";
import { sessionsDir } from "./paths";

export type EndedBy = "viewer" | "agent";

export type PollOutcome =
  | { readonly status: "questions"; readonly questions: readonly LiveQuestion[] }
  | { readonly status: "ended"; readonly by: EndedBy }
  | { readonly status: "browser_disconnected" }
  | { readonly status: "timeout" }
  | { readonly status: "replaced" }
  | { readonly status: "server_stopped" };

const Persisted = z.object({
  id: z.string(),
  dir: z.string(),
  token: z.string(),
  entries: z.array(LiveEntry),
  endedBy: z.enum(["viewer", "agent"]).optional(),
});
type Persisted = z.infer<typeof Persisted>;

interface Waiter {
  readonly settle: (outcome: PollOutcome | undefined) => void;
}

/** How long a waiting poll tolerates having no browser tab open before it returns. */
export const DEFAULT_GRACE_MS = 15_000;

/**
 * One reel being watched. Holds the conversation (replaced immutably on every
 * change), the open browser streams, and at most one waiting agent poll.
 */
export class LiveSession {
  private entries: Entries;
  private endedBy?: EndedBy;
  private readonly browsers = new Set<ServerResponse>();
  private waiter?: Waiter;
  private graceTimer?: NodeJS.Timeout;

  private constructor(private readonly data: Omit<Persisted, "entries" | "endedBy">, entries: Entries, endedBy: EndedBy | undefined, private readonly graceMs: number) {
    this.entries = entries;
    this.endedBy = endedBy;
  }

  static create(id: string, dir: string, graceMs = DEFAULT_GRACE_MS): LiveSession {
    return new LiveSession({ id, dir, token: randomBytes(24).toString("hex") }, [], undefined, graceMs);
  }

  static load(file: string, graceMs = DEFAULT_GRACE_MS): LiveSession | undefined {
    try {
      const p = Persisted.parse(JSON.parse(readFileSync(file, "utf8")));
      return new LiveSession({ id: p.id, dir: p.dir, token: p.token }, p.entries, p.endedBy, graceMs);
    } catch {
      return undefined;
    }
  }

  get id() { return this.data.id; }
  get dir() { return this.data.dir; }
  get token() { return this.data.token; }
  get ended(): EndedBy | undefined { return this.endedBy; }
  get idle(): boolean { return this.browsers.size === 0 && !this.waiter; }
  get browserCount(): number { return this.browsers.size; }
  get listening(): boolean { return Boolean(this.waiter); }

  snapshot(): LiveSnapshot {
    return { entries: [...this.entries], presence: presenceOf(this.entries, Boolean(this.waiter)), ended: Boolean(this.endedBy) };
  }

  attachBrowser(res: ServerResponse): void {
    this.browsers.add(res);
    clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
    sendEvent(res, { type: "state", state: this.snapshot() } satisfies LiveEvent);
    res.on("close", () => {
      this.browsers.delete(res);
      this.armGrace();
    });
  }

  broadcast(event: LiveEvent): void {
    for (const res of this.browsers) sendEvent(res, event);
  }

  ask(ask: LiveAsk): LiveQuestion {
    const id = randomUUID();
    this.update(addQuestion(this.entries, ask, id, new Date().toISOString()));
    if (this.waiter) this.deliverTo(this.waiter);
    return this.entries.find((e) => e.id === id) as LiveQuestion;
  }

  end(by: EndedBy): void {
    this.endedBy = by;
    this.settle({ status: "ended", by });
    this.persistAndBroadcast();
  }

  reopen(): void {
    this.endedBy = undefined;
    this.persistAndBroadcast();
  }

  /** Record the agent's reply (if any), then hand over questions or wait for the next one. */
  poll(reply: string | undefined, timeoutMs: number, onAbort: (fn: () => void) => void): Promise<PollOutcome | undefined> {
    if (reply !== undefined) this.update(addAnswer(this.entries, reply, randomUUID(), new Date().toISOString()));
    if (this.endedBy) return Promise.resolve({ status: "ended", by: this.endedBy });
    this.settle({ status: "replaced" });
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const waiter: Waiter = {
        settle: (outcome) => {
          if (this.waiter !== waiter) return;
          this.waiter = undefined;
          clearTimeout(timer);
          clearTimeout(this.graceTimer);
          this.graceTimer = undefined;
          this.broadcast({ type: "state", state: this.snapshot() });
          resolve(outcome);
        },
      };
      this.waiter = waiter;
      if (pendingQuestions(this.entries).length) return this.deliverTo(waiter);
      timer = setTimeout(() => waiter.settle({ status: "timeout" }), timeoutMs);
      onAbort(() => waiter.settle(undefined));
      this.broadcast({ type: "state", state: this.snapshot() });
      this.armGrace();
    });
  }

  private deliverTo(waiter: Waiter): void {
    const questions = pendingQuestions(this.entries);
    this.entries = markDelivered(this.entries, questions.map((q) => q.id));
    this.persist();
    waiter.settle({ status: "questions", questions: questions.map((q) => ({ ...q, status: "delivered" as const })) });
  }

  private settle(outcome: PollOutcome): void {
    this.waiter?.settle(outcome);
  }

  private armGrace(): void {
    if (!this.waiter || this.browsers.size > 0 || this.graceTimer) return;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = undefined;
      if (this.browsers.size === 0) this.settle({ status: "browser_disconnected" });
    }, this.graceMs);
  }

  private update(entries: Entries): void {
    this.entries = entries;
    this.persistAndBroadcast();
  }

  private persistAndBroadcast(): void {
    this.persist();
    this.broadcast({ type: "state", state: this.snapshot() });
  }

  persist(): void {
    const dir = sessionsDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `${this.id}.json`);
    const body: Persisted = { ...this.data, entries: [...this.entries], ...(this.endedBy ? { endedBy: this.endedBy } : {}) };
    writeFileSync(`${file}.tmp`, JSON.stringify(body, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }

  closeStreams(): void {
    this.settle({ status: "server_stopped" });
    for (const res of this.browsers) res.end();
  }
}
