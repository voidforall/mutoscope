import { validateBundle, type ValidationResult } from "../../core";
import type { ReelBundle } from "../../schema";
import { checkDatasets } from "./data-check";
import { checkDocuments } from "./document-check";
import { checkSourceRefs } from "./source-check";
import { findUnused } from "./unused-check";
import { CliError, loadRawReel } from "./reel-files";

/**
 * Load + validate. Pinned web pages are always checked (anchors, verbatim
 * quotes), and numbers bound to pinned datasets are recomputed; with a repo root, code refs and snippets are checked against git.
 */
export async function validateReelDir(dir: string, repoRoot?: string): Promise<ValidationResult> {
  const result = validateBundle(await loadRawReel(dir));
  if (!result.ok || !result.bundle) return result;
  const docs = await checkDocuments(result.bundle, dir);
  const data = await checkDatasets(result.bundle, dir);
  const code = repoRoot ? await checkSourceRefs(result.bundle, repoRoot) : { errors: [], warnings: [] };
  const errors = [...result.errors, ...docs.errors, ...data.errors, ...code.errors];
  const unused = await findUnused(result.bundle, dir);
  return { ...result, ok: errors.length === 0, errors, warnings: [...result.warnings, ...docs.warnings, ...data.warnings, ...code.warnings, ...unused] };
}

export async function loadValidReel(dir: string): Promise<ReelBundle> {
  const r = validateBundle(await loadRawReel(dir));
  if (!r.ok || !r.bundle) {
    const first = r.errors[0];
    throw new CliError(`Reel in ${dir} is invalid: ${first?.path} — ${first?.message}`, "Run `mutoscope validate` for the full list.");
  }
  return r.bundle;
}
