import { CliError } from "./reel-files";

const TIMEOUT_MS = 30_000;
const USER_AGENT = "mutoscope (+https://github.com/voidforall/mutoscope)";

export interface Fetched {
  readonly finalUrl: string;
  readonly bytes: Buffer;
  readonly contentType: string;
}

/**
 * Download a public https resource: https end to end (redirects included),
 * time-limited, and cut off past `maxBytes` so a hostile server can't fill
 * the disk. `allow` tests the content type before the body is read.
 */
export async function fetchBytes(url: string, opts: { readonly maxBytes: number; readonly accept: string; readonly allow: RegExp; readonly what: string; readonly hint?: string }): Promise<Fetched> {
  if (!/^https:\/\//i.test(url)) throw new CliError(`Only https:// URLs can be fetched (${url})`);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": USER_AGENT, accept: opts.accept } });
  } catch (e) {
    throw new CliError(`Could not fetch ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new CliError(`Fetching ${url} returned HTTP ${res.status}`);
  if (!res.url.startsWith("https://")) throw new CliError(`${url} redirected to a non-https address (${res.url})`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!opts.allow.test(contentType)) throw new CliError(`${url} is ${contentType || "an unknown type"}, not ${opts.what}`, opts.hint);
  const reader = res.body?.getReader();
  if (!reader) throw new CliError(`${url} returned no body`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > opts.maxBytes) {
      await reader.cancel();
      throw new CliError(`${url} is larger than ${opts.maxBytes / 1024 / 1024} MB`);
    }
    chunks.push(value);
  }
  return { finalUrl: res.url, bytes: Buffer.concat(chunks), contentType };
}
