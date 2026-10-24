import { mkdtemp, rm, writeFile, cp, mkdir } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionIdFor } from "../../src/cli/live/paths";
import { createLiveServer } from "../../src/cli/live/server";

const AGENT = "f".repeat(64);
let root: string;
let reel: string;
let port: number;
let close: () => Promise<void>;

interface Res {
  readonly status: number;
  readonly body: any;
}

/** Raw HTTP so tests control Host and Origin exactly as a browser or attacker would send them. */
function http(method: string, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}): Promise<Res> {
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: { host: `127.0.0.1:${port}`, ...(payload ? { "content-type": "application/json" } : {}), ...opts.headers },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            // html
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

const agent = (path: string, body?: unknown) => http(body === undefined ? "GET" : "POST", path, { headers: { authorization: `Bearer ${AGENT}` }, body });

async function openSession() {
  const r = await agent("/agent/open", { dir: reel });
  expect(r.status).toBe(200);
  return r.body as { sessionId: string; path: string };
}

async function tokenFor(path: string): Promise<string> {
  const page = await http("GET", path);
  return JSON.parse(/id="mutoscope-live">([^<]+)</.exec(page.body)![1]!).token;
}

const context = { reelId: "spsc-evolution", reelVersion: 1, sceneId: "drop-the-lock", timestampMs: 6000, sourceRefs: [] };

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mutoscope-live-"));
  process.env.MUTOSCOPE_STATE_DIR = join(root, "state");
  const player = join(root, "player");
  await mkdir(player);
  await writeFile(join(player, "player.js"), "void 0");
  await writeFile(join(player, "player.css"), "body{}");
  process.env.MUTOSCOPE_PLAYER_DIR = player;
  reel = join(root, "reel");
  await cp(join(import.meta.dirname, "../../examples/spsc-evolution"), reel, { recursive: true });
  const { server } = createLiveServer({ agentToken: AGENT, build: "test", graceMs: 300 });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  close = () => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()); });
});

afterAll(async () => {
  await close();
  await rm(root, { recursive: true, force: true });
});

describe("live server guards", () => {
  it("rejects agent calls without the agent token", async () => {
    expect((await http("POST", "/agent/open", { body: { dir: reel } })).status).toBe(401);
    expect((await http("POST", "/agent/open", { headers: { authorization: "Bearer nope" }, body: { dir: reel } })).status).toBe(401);
  });

  it("refuses requests addressed to another host name (DNS rebinding)", async () => {
    expect((await http("GET", "/health", { headers: { host: `evil.example:${port}` } })).status).toBe(421);
  });

  it("serves the session page with a same-origin-only CSP", async () => {
    const { path } = await openSession();
    const page = await http("GET", path);
    expect(page.status).toBe(200);
    expect(page.body).toContain("connect-src 'self'");
    expect(page.body).toContain(`"sessionId":"${sessionIdFor(reel)}"`);
  });

  it("only accepts questions from the session page itself", async () => {
    const { sessionId, path } = await openSession();
    const token = await tokenFor(path);
    const ask = (headers: Record<string, string>) => http("POST", `/s/${sessionId}/ask`, { headers, body: { text: "q", context } });
    expect((await ask({ origin: "https://evil.example", "x-mutoscope-token": token })).status).toBe(403);
    expect((await ask({ origin: `http://127.0.0.1:${port}` })).status).toBe(403);
    expect((await ask({ origin: `http://127.0.0.1:${port}`, "x-mutoscope-token": "0".repeat(48) })).status).toBe(403);
    const wrongReel = await http("POST", `/s/${sessionId}/ask`, {
      headers: { origin: `http://127.0.0.1:${port}`, "x-mutoscope-token": token },
      body: { text: "q", context: { ...context, reelId: "other" } },
    });
    expect(wrongReel.status).toBe(400);
  });
});

describe("live poll lifecycle", () => {
  it("hands a question to a waiting poll, records the reply, then times out quietly", async () => {
    const { sessionId, path } = await openSession();
    const token = await tokenFor(path);
    const waiting = agent("/agent/poll", { sessionId, timeoutMs: 5000 });
    await new Promise((r) => setTimeout(r, 50));
    const asked = await http("POST", `/s/${sessionId}/ask`, {
      headers: { origin: `http://127.0.0.1:${port}`, "x-mutoscope-token": token },
      body: { text: "  Why acquire?  ", context },
    });
    expect(asked.status).toBe(200);
    const got = await waiting;
    expect(got.body.status).toBe("questions");
    expect(got.body.questions).toHaveLength(1);
    expect(got.body.questions[0]).toMatchObject({ text: "Why acquire?", status: "delivered", context: { sceneId: "drop-the-lock" } });

    // A poll without a reply re-hands the unanswered question (the agent may have restarted).
    const again = await agent("/agent/poll", { sessionId, timeoutMs: 1000 });
    expect(again.body.questions.map((q: { id: string }) => q.id)).toEqual([got.body.questions[0].id]);

    const replied = await agent("/agent/poll", { sessionId, timeoutMs: 100, reply: "Because release/acquire pair." });
    expect(replied.body.status).toBe("timeout");
  });

  it("returns browser_disconnected when no tab is open past the grace period", async () => {
    const { sessionId } = await openSession();
    const r = await agent("/agent/poll", { sessionId, timeoutMs: 5000 });
    expect(r.body.status).toBe("browser_disconnected");
  });

  it("tells the agent when the viewer ends the session, and refuses a silent reopen", async () => {
    const { sessionId, path } = await openSession();
    const token = await tokenFor(path);
    const waiting = agent("/agent/poll", { sessionId, timeoutMs: 5000 });
    await new Promise((r) => setTimeout(r, 50));
    await http("POST", `/s/${sessionId}/end`, { headers: { origin: `http://127.0.0.1:${port}`, "x-mutoscope-token": token }, body: {} });
    expect((await waiting).body).toEqual({ status: "ended", by: "viewer" });
    expect((await agent("/agent/open", { dir: reel })).status).toBe(409);
    expect((await agent("/agent/open", { dir: reel, reopen: true })).status).toBe(200);
  });
});
