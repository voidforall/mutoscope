import { resolveRevision, type Issue } from "../../core";
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

/**
 * Verify every code ref against the pinned revision in a local clone:
 * the file must exist at that commit and the line range must be inside it.
 * This is what catches hallucinated paths and drifted line numbers.
 */
export async function checkSourceRefs(bundle: ReelBundle, repoRoot: string): Promise<Issue[]> {
  const cache = new Map<string, string[] | null>();
  const issues: Issue[] = [];
  for (const [where, ref] of codeRefs(bundle)) {
    const sha = resolveRevision(bundle.manifest, ref);
    if (!sha) continue;
    const key = `${sha}:${ref.path}`;
    if (!cache.has(key)) {
      try {
        const text = await exec("git", ["show", `${sha}:${ref.path}`], { cwd: repoRoot });
        cache.set(key, (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n"));
      } catch {
        cache.set(key, null);
      }
    }
    const lines = cache.get(key);
    if (!lines) {
      issues.push({ path: where, message: `${ref.path} does not exist at ${sha.slice(0, 7)}` });
    } else if ((ref.endLine ?? ref.startLine ?? 0) > lines.length) {
      issues.push({ path: where, message: `${ref.path} has ${lines.length} lines; ref points past the end` });
    }
  }
  return [...issues, ...snippetDrift(bundle, cache)];
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
