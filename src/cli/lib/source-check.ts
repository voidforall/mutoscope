import { isElision, resolveRevision, type Issue } from "../../core";
import type { ReelBundle, SourceRef } from "../../schema";
import { exec } from "./exec";

function* codeRefs(bundle: ReelBundle): Generator<[string, Extract<SourceRef, { kind: "code" }>]> {
  const visit = function* (refs: readonly SourceRef[], where: string) {
    for (const [i, r] of refs.entries()) if (r.kind === "code") yield [`${where}[${i}]`, r] as [string, Extract<SourceRef, { kind: "code" }>];
  };
  for (const [si, s] of bundle.scenes.entries()) {
    for (const [ei, e] of s.entities.entries()) yield* visit(e.sourceRefs, `scenes[${si}].entities[${ei}].sourceRefs`);
    for (const [ci, c] of s.claims.entries()) yield* visit(c.refs, `scenes[${si}].claims[${ci}].refs`);
  }
  for (const [ui, u] of (bundle.analysis?.units ?? []).entries()) {
    yield* visit(u.refs, `analysis.units[${ui}].refs`);
    for (const [ci, c] of u.claims.entries()) yield* visit(c.refs, `analysis.units[${ui}].claims[${ci}].refs`);
  }
}

type CodeRef = Extract<SourceRef, { kind: "code" }>;

export { isElision };

export type ExcerptMatch = { readonly ok: true } | { readonly ok: false; readonly line: number; readonly text: string };

/**
 * Does `excerpt` quote `file` lines start..end (1-based, inclusive)? Runs of
 * lines between elision lines must each appear verbatim (indentation aside),
 * in order. On failure, reports the first excerpt line that could not be placed.
 */
export function matchExcerpt(excerpt: readonly string[], file: readonly string[], start: number, end: number): ExcerptMatch {
  const range = file.slice(start - 1, end).map((l) => l.trim());
  const chunks: { readonly at: number; readonly lines: string[] }[] = [];
  excerpt.forEach((line, i) => {
    if (isElision(line)) return void chunks.push({ at: i + 1, lines: [] });
    if (chunks.length === 0) chunks.push({ at: i, lines: [] });
    const last = chunks[chunks.length - 1]!;
    if (last.lines.length === 0) chunks[chunks.length - 1] = { at: i, lines: [line.trim()] };
    else last.lines.push(line.trim());
  });
  let from = 0;
  for (const chunk of chunks.filter((c) => c.lines.length > 0)) {
    let found = -1;
    for (let i = from; i + chunk.lines.length <= range.length && found < 0; i++) {
      if (chunk.lines.every((l, k) => range[i + k] === l)) found = i;
    }
    if (found < 0) {
      // Point at the first line of this run that breaks the best partial match.
      let best = 0;
      for (let i = from; i < range.length; i++) {
        let k = 0;
        while (k < chunk.lines.length && range[i + k] === chunk.lines[k]) k++;
        best = Math.max(best, k);
      }
      const line = chunk.at + Math.min(best, chunk.lines.length - 1);
      return { ok: false, line: line + 1, text: excerpt[line]! };
    }
    from = found + chunk.lines.length;
  }
  return { ok: true };
}

async function fileAt(cache: Map<string, string[] | null>, repoRoot: string, sha: string, path: string): Promise<string[] | null> {
  const key = `${sha}:${path}`;
  if (!cache.has(key)) {
    try {
      const text = await exec("git", ["show", key], { cwd: repoRoot });
      cache.set(key, (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n"));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key) ?? null;
}

/**
 * Verify every code ref against the pinned revision in a local clone: the
 * file must exist at that commit and the line range must be inside it. Then
 * code on stage must quote it: code blocks line for line, diff panels side by
 * side (with "…" elisions). This catches hallucinated paths, drifted line
 * numbers and "lightly edited" code.
 */
export async function checkSourceRefs(bundle: ReelBundle, repoRoot: string): Promise<{ errors: Issue[]; warnings: Issue[] }> {
  const cache = new Map<string, string[] | null>();
  const errors: Issue[] = [];
  for (const [where, ref] of codeRefs(bundle)) {
    const sha = resolveRevision(bundle.manifest, ref);
    if (!sha) continue;
    const lines = await fileAt(cache, repoRoot, sha, ref.path);
    if (!lines) {
      errors.push({ path: where, message: `${ref.path} does not exist at ${sha.slice(0, 7)}` });
    } else if ((ref.endLine ?? ref.startLine ?? 0) > lines.length) {
      errors.push({ path: where, message: `${ref.path} has ${lines.length} lines; ref points past the end` });
    }
  }
  const panels = await diffPanelDrift(bundle, repoRoot, cache);
  return { errors: [...errors, ...snippetDrift(bundle, cache), ...panels.errors], warnings: panels.warnings };
}

/** Each side of a diff panel must quote one of the panel's code refs. */
async function diffPanelDrift(bundle: ReelBundle, repoRoot: string, cache: Map<string, string[] | null>): Promise<{ errors: Issue[]; warnings: Issue[] }> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const [si, scene] of bundle.scenes.entries()) {
    for (const [ei, e] of scene.entities.entries()) {
      if (e.type !== "diff-panel") continue;
      const path = `scenes[${si}].entities[${ei}]`;
      const refs = e.sourceRefs.filter((r): r is CodeRef => r.kind === "code");
      if (refs.length === 0) {
        warnings.push({ path, message: `diff panel '${e.id}' cites no code ref, so its text can't be checked; add the base and head ranges it quotes` });
        continue;
      }
      const files = await Promise.all(
        refs.map(async (r) => {
          const sha = resolveRevision(bundle.manifest, r);
          const lines = sha ? await fileAt(cache, repoRoot, sha, r.path) : null;
          return lines ? { r, lines } : undefined;
        }),
      );
      for (const side of ["before", "after"] as const) {
        const excerpt = e[side].split("\n");
        const results = files.filter((f) => f !== undefined).map((f) => matchExcerpt(excerpt, f.lines, f.r.startLine ?? 1, f.r.endLine ?? f.lines.length));
        if (results.length === 0 || results.some((m) => m.ok)) continue;
        const worst = results.reduce((a, b) => (!a.ok && !b.ok && b.line > a.line ? b : a));
        if (!worst.ok) {
          errors.push({ path, message: `'${e.id}' ${side} side line ${worst.line} ("${worst.text.trim().slice(0, 80)}") is not in any of its code refs; quote the code verbatim, using a "…" line for omissions` });
        }
      }
    }
  }
  return { errors, warnings };
}

/** Code-block snippets must quote the pinned file verbatim (modulo indentation). */
function snippetDrift(bundle: ReelBundle, files: ReadonlyMap<string, string[] | null>): Issue[] {
  const issues: Issue[] = [];
  for (const [si, scene] of bundle.scenes.entries()) {
    for (const [ei, e] of scene.entities.entries()) {
      if (e.type !== "code-block") continue;
      const ref = e.sourceRefs.find((r) => r.kind === "code");
      const sha = ref && resolveRevision(bundle.manifest, ref);
      const file = ref?.kind === "code" && sha ? files.get(`${sha}:${ref.path}`) : undefined;
      if (!file || ref?.kind !== "code") continue;
      const bad = e.code
        .split("\n")
        .findIndex((line, i) => line.trim() !== (file[e.startLine - 1 + i] ?? "").trim());
      if (bad >= 0) {
        issues.push({
          path: `scenes[${si}].entities[${ei}]`,
          message: `snippet line ${e.startLine + bad} does not match ${ref.path} at the pinned revision`,
        });
      }
    }
  }
  return issues;
}
