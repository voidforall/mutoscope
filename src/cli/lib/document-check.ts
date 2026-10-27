import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { documentKey, type Issue } from "../../core";
import type { Claim, ReelBundle, SourceRef } from "../../schema";
import { closestPassage, plainSnapshot, quoteFound, quoteOutOfOrder } from "./quote-match";
import { sha256, WEB_DIR, type SnapshotMeta } from "./web-snapshot";

interface LoadedSnapshot {
  readonly meta: SnapshotMeta;
  readonly plain: string;
  readonly anchors: ReadonlySet<string>;
  /** Anchors marked in the snapshot text ({#id}): the ones a reader can actually land on. */
  readonly visible: readonly string[];
}

const MAX_LISTED_ANCHORS = 12;

async function loadSnapshots(reelDir: string, errors: Issue[]): Promise<Map<string, LoadedSnapshot>> {
  const dir = join(reelDir, "source", WEB_DIR);
  const byKey = new Map<string, LoadedSnapshot>();
  if (!existsSync(dir)) return byKey;
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".json"))) {
    const meta = JSON.parse(await readFile(join(dir, f), "utf8")) as SnapshotMeta;
    const mdPath = join(dir, f.replace(/\.json$/, ".md"));
    if (!existsSync(mdPath)) {
      errors.push({ path: `source/${WEB_DIR}/${f}`, message: "snapshot text is missing; re-run `mutoscope ingest url`" });
      continue;
    }
    const md = await readFile(mdPath, "utf8");
    if (sha256(md) !== meta.sha256) {
      errors.push({ path: `source/${WEB_DIR}/${f}`, message: "snapshot text was edited after ingest; re-run `mutoscope ingest url` instead of editing it" });
    }
    const visible = [...new Set([...md.matchAll(/\{#([^}]+)\}/g)].map((m) => m[1]!))];
    const loaded = { meta, plain: plainSnapshot(md), anchors: new Set(meta.anchors), visible };
    byKey.set(documentKey(meta.url), loaded);
    byKey.set(documentKey(meta.finalUrl), loaded);
  }
  return byKey;
}

interface Cited {
  readonly path: string;
  readonly refs: readonly SourceRef[];
  /** Set for evidence claims, which should quote the words that support them. */
  readonly evidence: boolean;
}

function citations(bundle: ReelBundle): Cited[] {
  const fromClaims = (claims: readonly Claim[], p: string): Cited[] =>
    claims.map((c, i) => ({ path: `${p}.claims[${i}]`, refs: c.refs, evidence: c.basis === "evidence" }));
  return [
    ...bundle.scenes.flatMap((s, si) => [
      ...fromClaims(s.claims, `scenes[${si}]`),
      ...s.entities.map((e, ei) => ({ path: `scenes[${si}].entities[${ei}].sourceRefs`, refs: e.sourceRefs, evidence: false })),
    ]),
    ...(bundle.analysis?.units ?? []).flatMap((u, ui) => [
      ...fromClaims(u.claims, `analysis.units[${ui}]`),
      { path: `analysis.units[${ui}].refs`, refs: u.refs, evidence: false },
    ]),
  ];
}

const bigrams = (s: string) => {
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
};

/** Dice similarity of two ids: "features" ~ "user-content-features", "results" ~ "S4-results". */
function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size + y.size === 0) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return (2 * shared) / (x.size + y.size);
}

/** Anchors a reader can land on, most like the one asked for; footnote anchors only when a footnote was asked for. */
function nearestAnchors(snap: LoadedSnapshot, wanted: string): string[] {
  const footnote = (x: string) => /^fn(ref)?[:-]/.test(x);
  const pool = snap.visible.length ? snap.visible : [...snap.anchors];
  return pool
    .filter((x) => footnote(x) === footnote(wanted))
    .map((x, i) => ({ x, i, score: similarity(x, wanted) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_LISTED_ANCHORS)
    .map((a) => a.x);
}

/** GitHub renders a README's "#features" link onto an element with id "user-content-features"; both resolve on the page. */
const hasAnchor = (snap: LoadedSnapshot, anchor: string) => snap.anchors.has(anchor) || snap.anchors.has(`user-content-${anchor}`);

function checkQuote(plain: string, quote: string, path: string, what: string): Issue | undefined {
  if (quoteFound(plain, quote)) return undefined;
  if (quoteOutOfOrder(plain, quote)) {
    return { path, message: `${what}: each passage joined by "…" is on the page, but not in this order; reorder them as the page does` };
  }
  const near = closestPassage(plain, quote);
  return { path, message: `${what} is not in the pinned page: "${quote.slice(0, 120)}"${near ? ` — closest passage: "${near}"` : ""}` };
}

/**
 * Check url refs against the pages pinned in source/web/: anchors must exist,
 * quotes must be verbatim, on-stage quotes too, and evidence claims should
 * carry the words that support them.
 */
export async function checkDocuments(bundle: ReelBundle, reelDir: string): Promise<{ errors: Issue[]; warnings: Issue[] }> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const snapshots = await loadSnapshots(reelDir, errors);
  for (const d of bundle.manifest.documents) {
    const snap = snapshots.get(documentKey(d.url));
    if (!snap) warnings.push({ path: "manifest.documents", message: `no snapshot of ${d.url} in source/${WEB_DIR}/; its refs can't be checked` });
    else if (snap.meta.sha256 !== d.sha256) errors.push({ path: "manifest.documents", message: `${d.url} was re-ingested; the manifest entry is stale` });
  }
  const unquoted = new Map<string, string[]>();
  for (const c of citations(bundle)) {
    let quoted = false;
    let pinnedTarget: string | undefined;
    c.refs.forEach((r, i) => {
      if (r.kind !== "url") return;
      const p = `${c.path}.refs[${i}]`.replace(/\.(sourceRefs|refs)\.refs\[/, ".$1[");
      const snap = snapshots.get(documentKey(r.url));
      if (!snap) {
        if (r.quote) warnings.push({ path: p, message: `quote can't be checked: ${documentKey(r.url)} is not pinned (run \`mutoscope ingest url\`)` });
        return;
      }
      pinnedTarget = documentKey(r.url);
      const anchor = new URL(r.url).hash.slice(1);
      if (anchor && !hasAnchor(snap, decodeURIComponent(anchor))) {
        errors.push({ path: p, message: `#${anchor} is not an anchor on the pinned page; closest: ${nearestAnchors(snap, decodeURIComponent(anchor)).join(", ")}` });
      }
      if (r.quote) {
        quoted = true;
        const issue = checkQuote(snap.plain, r.quote, p, "quote");
        if (issue) errors.push(issue);
      }
    });
    if (c.evidence && pinnedTarget && !quoted) unquoted.set(pinnedTarget, [...(unquoted.get(pinnedTarget) ?? []), c.path]);
  }
  for (const [page, paths] of unquoted) {
    warnings.push({
      path: paths.length === 1 ? paths[0]! : `${paths.length} claims`,
      message: `evidence claim${paths.length === 1 ? "" : "s"} cite ${page} without a quote; add the words that support each so they can be checked${paths.length > 1 ? `: ${paths.join(", ")}` : ""}`,
    });
  }
  bundle.scenes.forEach((s, si) =>
    s.entities.forEach((e, ei) => {
      if (e.type !== "quote") return;
      const p = `scenes[${si}].entities[${ei}]`;
      const snap = e.sourceRefs.map((r) => (r.kind === "url" ? snapshots.get(documentKey(r.url)) : undefined)).find(Boolean);
      if (!snap) return void warnings.push({ path: p, message: `quote '${e.id}' cites no pinned page, so its words can't be checked` });
      const issue = checkQuote(snap.plain, e.text, p, `quote '${e.id}'`);
      if (issue) errors.push(issue);
    }),
  );
  return { errors, warnings };
}
