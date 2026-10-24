import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { request } from "node:http";
import { CliError } from "../lib/reel-files";
import { LIVE_HOST, serverInfoFile, serverLogFile, stateDir, type ServerInfo } from "./paths";

const START_TIMEOUT_MS = 8000;
const HEALTH_TIMEOUT_MS = 800;

/** The CLI build identity: a rebuilt CLI replaces a server started by an older one. */
export function currentBuild(): string {
  const entry = process.argv[1];
  return entry && existsSync(entry) ? String(Math.round(statSync(entry).mtimeMs)) : "dev";
}

export function readServerInfo(): ServerInfo | undefined {
  try {
    return JSON.parse(readFileSync(serverInfoFile(), "utf8")) as ServerInfo;
  } catch {
    return undefined;
  }
}

interface Response {
  readonly status: number;
  readonly body: unknown;
}

function call(port: number, method: string, path: string, opts: { token?: string; body?: unknown; timeoutMs?: number } = {}): Promise<Response> {
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: LIVE_HOST,
        port,
        method,
        path,
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: text });
          }
        });
      },
    );
    if (opts.timeoutMs) req.setTimeout(opts.timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}

async function health(port: number): Promise<{ pid: number; build: string } | undefined> {
  try {
    const r = await call(port, "GET", "/health", { timeoutMs: HEALTH_TIMEOUT_MS });
    const b = r.body as { app?: string; pid?: number; build?: string } | undefined;
    return r.status === 200 && b?.app === "mutoscope-live" ? { pid: b.pid ?? 0, build: b.build ?? "" } : undefined;
  } catch {
    return undefined;
  }
}

/** A running server started by this CLI build, if any. */
export async function runningServer(): Promise<ServerInfo | undefined> {
  const info = readServerInfo();
  if (!info) return undefined;
  const h = await health(info.port);
  return h && h.pid === info.pid ? info : undefined;
}

export async function stopServer(info: ServerInfo): Promise<void> {
  await call(info.port, "POST", "/agent/stop", { token: info.agentToken, body: {} }).catch(() => undefined);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline && (await health(info.port))) await new Promise((r) => setTimeout(r, 100));
}

export async function ensureServer(port: number): Promise<ServerInfo> {
  const running = await runningServer();
  if (running && running.build === currentBuild()) return running;
  if (running) await stopServer(running);
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const log = openSync(serverLogFile(), "a", 0o600);
  const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, "live-server", "--port", String(port)], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 120));
    const info = await runningServer();
    if (info && info.pid === child.pid) return info;
    if (child.exitCode !== null) break;
  }
  throw new CliError(`The live server did not start on port ${port}`, `See ${serverLogFile()}. If the port is taken, pass --port <n>.`);
}

/** An authenticated agent request; non-2xx responses become CliErrors with the server's message. */
export async function agentCall<T>(info: ServerInfo, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await call(info.port, method, path, { token: info.agentToken, body });
  } catch (e) {
    throw new CliError(`Lost the live server: ${(e as Error).message}`, "Run `mutoscope watch <reel-dir>` to start it again.");
  }
  if (r.status < 200 || r.status >= 300) {
    const message = (r.body as { error?: string } | undefined)?.error ?? `HTTP ${r.status}`;
    throw new CliError(message);
  }
  return r.body as T;
}
