import { validateBundle, type ValidationResult } from "../../core";
import type { ReelBundle } from "../../schema";
import { checkSourceRefs } from "./source-check";
import { CliError, loadRawReel } from "./reel-files";

/** Load + validate; with a repo root also verify refs and snippets against git. */
export async function validateReelDir(dir: string, repoRoot?: string): Promise<ValidationResult> {
  const result = validateBundle(await loadRawReel(dir));
  if (!result.ok || !result.bundle || !repoRoot) return result;
  const refIssues = await checkSourceRefs(result.bundle, repoRoot);
  return refIssues.length ? { ...result, ok: false, errors: [...result.errors, ...refIssues] } : result;
}

export async function loadValidReel(dir: string): Promise<ReelBundle> {
  const r = validateBundle(await loadRawReel(dir));
  if (!r.ok || !r.bundle) {
    const first = r.errors[0];
    throw new CliError(`Reel in ${dir} is invalid: ${first?.path} — ${first?.message}`, "Run `mutoscope validate` for the full list.");
  }
  return r.bundle;
}
