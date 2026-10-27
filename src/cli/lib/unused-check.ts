import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { documentKey } from "../../core";
import type { ReelBundle, SourceRef } from "../../schema";

interface Issue {
  readonly path: string;
  readonly message: string;
}

function allRefs(bundle: ReelBundle): SourceRef[] {
  return [
    ...bundle.scenes.flatMap((s) => [...s.entities.flatMap((e) => e.sourceRefs), ...s.claims.flatMap((c) => c.refs)]),
    ...(bundle.analysis?.units ?? []).flatMap((u) => [...u.refs, ...u.claims.flatMap((c) => c.refs)]),
  ];
}

async function filesUnder(dir: string, prefix = ""): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? filesUnder(join(dir, e.name), `${prefix}${e.name}/`) : Promise.resolve([`${prefix}${e.name}`]))));
  return nested.flat();
}

/** Pinned pages, datasets and images nothing uses: leftovers from exploring that clutter the manifest. */
export async function findUnused(bundle: ReelBundle, reelDir: string): Promise<Issue[]> {
  const refs = allRefs(bundle);
  const cited = new Set(refs.flatMap((r) => (r.kind === "url" ? [documentKey(r.url)] : [])));
  const data = new Set([
    ...refs.flatMap((r) => (r.kind === "data" ? [r.file] : [])),
    ...bundle.scenes.flatMap((s) => s.entities.flatMap((e) => ((e.type === "chart" || e.type === "stat") && e.data ? [e.data.file] : []))),
  ]);
  const images = new Set(bundle.scenes.flatMap((s) => s.entities.flatMap((e) => (e.type === "image" ? [e.src] : []))));
  const hint = (what: string) => `cite it, or remove it with \`mutoscope unpin <reel-dir> ${what}\``;
  return [
    ...bundle.manifest.documents.filter((d) => !cited.has(documentKey(d.url))).map((d) => ({ path: "manifest.documents", message: `${d.url} is pinned but nothing cites it; ${hint(d.url)}` })),
    ...bundle.manifest.datasets.filter((d) => !data.has(d.file)).map((d) => ({ path: "manifest.datasets", message: `${d.file} is pinned but no chart, stat or claim uses it; ${hint(d.file)}` })),
    ...(await filesUnder(join(reelDir, "assets")))
      .map((f) => `assets/${f}`)
      .filter((src) => !images.has(src) && !/\/?\.DS_Store$/.test(src))
      .map((src) => ({ path: "assets", message: `${src} is not shown by any image (unused images are not published); use it, or remove it with \`mutoscope unpin <reel-dir> ${src}\`` })),
  ];
}
