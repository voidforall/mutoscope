import { timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, watch, type FSWatcher } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { z } from "zod";
import { validateBundle } from "../../core";
import { LiveAsk, MAX_LIVE_ANSWER } from "../../schema";
import { loadPlayerAssets } from "../lib/assets";
import { renderReelHtml } from "../lib/html";
import { loadRawReel, REEL_FILES } from "../lib/reel-files";
import { bearer, escapeHtml, hostAllowed, HttpError, openEventStream, readJsonBody, sameOrigin, sendHtml, sendJson } from "./http";
import { canonicalDir, LIVE_HOST, sessionIdFor, sessionsDir } from "./paths";
import { DEFAULT_GRACE_MS, LiveSession } from "./session";

export interface LiveServerOptions {
  readonly agentToken: string;
  readonly build: string;
  readonly graceMs?: number;
  /** Stop after this long with no session activity (no browser tab, no poll). */
  readonly idleMs?: number;
  readonly onStop?: () => void;
}

const MAX_POLL_MS = 60 * 60 * 1000;
const RELOAD_DEBOUNCE_MS = 250;
const HEARTBEAT_MS = 20_000;
const WATCHED = new Set<string>(Object.values(REEL_FILES));

const OpenBody = z.object({ dir: z.string().min(1), reopen: z.boolean().default(false) });
const SessionBody = z.object({ sessionId: z.string().regex(/^[0-9a-f]{16}$/) });
const PollBody = SessionBody.extend({
  reply: z.string().trim().min(1).max(MAX_LIVE_ANSWER).optional(),
  timeoutMs: z.number().int().positive().max(MAX_POLL_MS),
});

const tokenEquals = (a: string | undefined, b: string) =>
  a !== undefined && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function parseBody<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

async function loadBundle(dir: string) {
  const result = validateBundle(await loadRawReel(dir));
  if (!result.ok || !result.bundle) {
    const first = result.errors[0];
    throw new HttpError(422, `${first?.path ?? "reel"} — ${first?.message ?? "invalid"}`);
  }
  return result.bundle;
}

function errorPage(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title><body style="font:15px/1.6 system-ui;max-width:640px;margin:12vh auto;padding:0 16px;background:#f4f1ea;color:#1f1b14">
<h1 style="font-size:20px">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p style="color:#8a8172">Fix the reel, then refresh this page.</p></body>`;
}

/** The background server behind `mutoscope watch` / `poll`. Loopback only. */
export function createLiveServer(opts: LiveServerOptions): { server: Server; sessions: ReadonlyMap<string, LiveSession> } {
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const sessions = new Map<string, LiveSession>();
  const watchers = new Map<string, FSWatcher>();
  if (existsSync(sessionsDir())) {
    for (const f of readdirSync(sessionsDir()).filter((n) => n.endsWith(".json"))) {
      const s = LiveSession.load(join(sessionsDir(), f), graceMs);
      if (s && existsSync(s.dir)) sessions.set(s.id, s);
    }
  }

  const watchReel = (s: LiveSession) => {
    if (watchers.has(s.id)) return;
    let timer: NodeJS.Timeout | undefined;
    const w = watch(s.dir, (_event, name) => {
      if (!name || !WATCHED.has(String(name))) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await loadBundle(s.dir);
          s.broadcast({ type: "reload" });
        } catch (e) {
          s.broadcast({ type: "invalid", message: (e as Error).message });
        }
      }, RELOAD_DEBOUNCE_MS);
    });
    w.on("error", () => watchers.delete(s.id));
    watchers.set(s.id, w);
  };

  const sessionOr404 = (id: string) => {
    const s = sessions.get(id);
    if (!s) throw new HttpError(404, "no such session");
    return s;
  };

  async function agentRoute(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (!tokenEquals(bearer(req), opts.agentToken)) throw new HttpError(401, "unauthorized");
    if (req.method === "GET" && path === "/agent/sessions") {
      return sendJson(res, 200, [...sessions.values()].map((s) => ({ sessionId: s.id, dir: s.dir, ended: s.ended ?? null, browsers: s.browserCount, listening: s.listening })));
    }
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");
    const raw = await readJsonBody(req);
    if (path === "/agent/open") {
      const body = parseBody(OpenBody, raw);
      const dir = canonicalDir(body.dir);
      await loadBundle(dir);
      const id = sessionIdFor(dir);
      const existing = sessions.get(id);
      if (existing?.ended === "viewer" && !body.reopen) {
        return sendJson(res, 409, { error: "The viewer ended this session from the browser. Pass --reopen only if they asked to continue." });
      }
      const s = existing ?? LiveSession.create(id, dir, graceMs);
      if (existing?.ended) existing.reopen();
      s.persist();
      sessions.set(id, s);
      watchReel(s);
      return sendJson(res, 200, { sessionId: id, path: `/s/${id}/`, resumed: Boolean(existing) });
    }
    if (path === "/agent/poll") {
      const body = parseBody(PollBody, raw);
      const s = sessionOr404(body.sessionId);
      const outcome = await s.poll(body.reply, body.timeoutMs, (fn) => res.on("close", () => !res.writableFinished && fn()));
      if (outcome) sendJson(res, 200, outcome);
      return;
    }
    if (path === "/agent/end") {
      const s = sessionOr404(parseBody(SessionBody, raw).sessionId);
      s.end("agent");
      return sendJson(res, 200, { ended: true });
    }
    if (path === "/agent/stop") {
      sendJson(res, 200, { stopping: true });
      return void setImmediate(stop);
    }
    throw new HttpError(404, "not found");
  }

  async function browserRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const m = /^\/s\/([0-9a-f]{16})(\/.*)?$/.exec(url.pathname);
    if (!m) throw new HttpError(404, "not found");
    const s = sessionOr404(m[1]!);
    const sub = m[2] ?? "";
    if (req.method === "GET" && sub === "") {
      res.writeHead(302, { location: `/s/${s.id}/${url.search}` }).end();
      return;
    }
    if (req.method === "GET" && sub === "/") {
      try {
        const [bundle, assets] = await Promise.all([loadBundle(s.dir), loadPlayerAssets()]);
        return sendHtml(res, 200, renderReelHtml(bundle, assets.js, assets.css, { sessionId: s.id, token: s.token }));
      } catch (e) {
        return sendHtml(res, 200, errorPage("This reel has errors", (e as Error).message));
      }
    }
    if (req.method === "GET" && sub === "/events") {
      if (!tokenEquals(url.searchParams.get("token") ?? undefined, s.token)) throw new HttpError(401, "unauthorized");
      openEventStream(res);
      const beat = setInterval(() => res.write(": beat\n\n"), HEARTBEAT_MS);
      res.on("close", () => clearInterval(beat));
      return s.attachBrowser(res);
    }
    if (req.method === "POST" && (sub === "/ask" || sub === "/end")) {
      if (!sameOrigin(req, boundPort()) || !tokenEquals(req.headers["x-mutoscope-token"] as string | undefined, s.token)) {
        throw new HttpError(403, "forbidden");
      }
      if (s.ended) throw new HttpError(409, "this session has ended");
      if (sub === "/end") {
        s.end("viewer");
        return sendJson(res, 200, { ended: true });
      }
      const ask = parseBody(LiveAsk, await readJsonBody(req));
      const bundle = await loadBundle(s.dir);
      if (ask.context.reelId !== bundle.manifest.id) throw new HttpError(400, "question is for a different reel");
      return sendJson(res, 200, s.ask(ask));
    }
    throw new HttpError(404, "not found");
  }

  const server = createServer(async (req, res) => {
    try {
      if (!hostAllowed(req, boundPort())) throw new HttpError(421, "misdirected request");
      const url = new URL(req.url ?? "/", `http://${LIVE_HOST}:${boundPort()}`);
      if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { app: "mutoscope-live", pid: process.pid, build: opts.build });
      if (url.pathname.startsWith("/agent/")) return await agentRoute(req, res, url.pathname);
      return await browserRoute(req, res, url);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      sendJson(res, status, { error: e instanceof HttpError ? e.message : "internal error" });
    }
  });

  const boundPort = () => (server.address() as AddressInfo).port;

  let idleSince = Date.now();
  const idleCheck = opts.idleMs
    ? setInterval(() => {
        const busy = [...sessions.values()].some((s) => !s.idle);
        if (busy) idleSince = Date.now();
        else if (Date.now() - idleSince > opts.idleMs!) stop();
      }, Math.min(opts.idleMs, 60_000))
    : undefined;

  function stop(): void {
    clearInterval(idleCheck);
    for (const w of watchers.values()) w.close();
    for (const s of sessions.values()) s.closeStreams();
    server.close(() => opts.onStop?.());
    server.closeAllConnections();
  }
  server.on("close", () => clearInterval(idleCheck));

  return { server, sessions };
}
