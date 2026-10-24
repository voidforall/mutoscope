import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_BODY_BYTES = 256 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "expected application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
} as const;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}

export function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" }).end(html);
}

export function openEventStream(res: ServerResponse): void {
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
  res.write(": mutoscope\n\n");
}

export function sendEvent(res: ServerResponse, data: unknown): void {
  if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Only answer requests addressed to this loopback server by name, which
 * defeats DNS-rebinding pages that resolve their own hostname to 127.0.0.1.
 */
export function hostAllowed(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host ?? "";
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Browser writes must come from the session page itself. */
export function sameOrigin(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

export function bearer(req: IncomingMessage): string | undefined {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : undefined;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
