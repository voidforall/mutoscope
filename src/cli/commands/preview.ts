import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parse, positional } from "../lib/args";
import { buildSite } from "../lib/build";
import { c, out } from "../lib/output";
import { loadValidReel } from "../lib/reel";

export const help = "preview <reel-dir> [--port 4870]                     Build and serve locally";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parse(argv, { port: { type: "string" }, host: { type: "string" } });
  const dir = positional(positionals, 0, "reel-dir");
  const root = resolve(join(dir, "dist"));
  await buildSite(await loadValidReel(dir), root);
  const port = Number(values.port ?? 4870);
  const host = values.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok, fail) => server.once("error", fail).listen(port, host, ok));
  out(`${c.green("✓")} previewing ${c.bold(`http://${host}:${port}/`)}  ${c.dim("(Ctrl-C to stop)")}`);
  await new Promise(() => undefined);
  return 0;
}
