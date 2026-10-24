import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** One background server per machine; sessions are keyed by the reel directory. */
export const DEFAULT_LIVE_PORT = 4880;
export const LIVE_HOST = "127.0.0.1";

export const stateDir = () => resolve(process.env.MUTOSCOPE_STATE_DIR ?? join(homedir(), ".mutoscope", "live"));
export const serverInfoFile = () => join(stateDir(), "server.json");
export const serverLogFile = () => join(stateDir(), "server.log");
export const sessionsDir = () => join(stateDir(), "sessions");
export const framesDir = () => join(stateDir(), "frames");

export function canonicalDir(dir: string): string {
  return realpathSync(resolve(dir));
}

export function sessionIdFor(dir: string): string {
  return createHash("sha256").update(canonicalDir(dir)).digest("hex").slice(0, 16);
}

export interface ServerInfo {
  readonly pid: number;
  readonly port: number;
  readonly agentToken: string;
  /** Identifies the CLI build that started the server, so a rebuilt CLI replaces a stale one. */
  readonly build: string;
}
