import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { documentKey } from "../../core";
import { Manifest, type PinnedDocument } from "../../schema";
import { CliError, REEL_FILES } from "./reel-files";
import { sha256, SNAPSHOT_BANNER, snapshotSlug, WEB_DIR, type SnapshotMeta } from "./web-snapshot";

export const SOURCE_DIR = "source";

export interface SnapshotDraft {
  readonly url: string;
  readonly finalUrl?: string;
  readonly title?: string;
  readonly text: string;
  readonly anchors: readonly string[];
}

export async function readManifest(reelDir: string): Promise<Manifest> {
  const path = join(reelDir, REEL_FILES.manifest);
  if (!existsSync(path)) throw new CliError(`No manifest in ${reelDir}`, "Run `mutoscope init` first.");
  return Manifest.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function writeManifest(reelDir: string, manifest: Manifest): Promise<void> {
  await writeFile(join(reelDir, REEL_FILES.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Write snapshots to source/web/ (readable .md + .json meta with anchors and
 * hash) and pin them in manifest.documents, replacing earlier pins of the
 * same pages. Returns where each snapshot was written.
 */
export async function pinSnapshots(reelDir: string, drafts: readonly SnapshotDraft[]): Promise<{ readonly draft: SnapshotDraft; readonly file: string }[]> {
  const manifest = await readManifest(reelDir);
  const dir = join(reelDir, SOURCE_DIR, WEB_DIR);
  await mkdir(dir, { recursive: true });
  const retrievedAt = new Date().toISOString();
  const written: { draft: SnapshotDraft; file: string }[] = [];
  const docs: PinnedDocument[] = [];
  for (const d of drafts) {
    const md = [SNAPSHOT_BANNER, `<!-- ${d.url} · retrieved ${retrievedAt} -->`, "", ...(d.title ? [`# ${d.title}`, ""] : []), d.text, ""].join("\n");
    const slug = snapshotSlug(d.url);
    const meta: SnapshotMeta = { url: d.url, finalUrl: d.finalUrl ?? d.url, ...(d.title ? { title: d.title } : {}), retrievedAt, sha256: sha256(md), anchors: d.anchors };
    await writeFile(join(dir, `${slug}.md`), md);
    await writeFile(join(dir, `${slug}.json`), `${JSON.stringify(meta, null, 2)}\n`);
    docs.push({ url: d.url, ...(d.title ? { title: d.title.slice(0, 200) } : {}), retrievedAt, sha256: meta.sha256 });
    written.push({ draft: d, file: join(dir, `${slug}.md`) });
  }
  const keys = new Set(docs.map((d) => documentKey(d.url)));
  await writeManifest(reelDir, { ...manifest, documents: [...manifest.documents.filter((d) => !keys.has(documentKey(d.url))), ...docs] });
  return written;
}
