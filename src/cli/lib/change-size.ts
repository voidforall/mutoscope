export interface ChangedFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

const MAX_FILES = 40;
const MAX_LINES = 3000;
export const SENSITIVE_PATH = /(^|\/)(\.env(\..+)?|id_[rd]sa|[^/]*\.pem|[^/]*\.p12|credentials(\.json)?|\.npmrc|\.netrc)$/i;

export function sizeVerdict(files: readonly ChangedFile[]): { additions: number; deletions: number; warning?: string } {
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  const big = files.length > MAX_FILES || additions + deletions > MAX_LINES;
  return {
    additions,
    deletions,
    ...(big ? { warning: `large change (${files.length} files, ${additions + deletions} lines): group into ≤ 5 semantic units and skip generated/vendored files` } : {}),
  };
}

export function scanPaths(files: readonly ChangedFile[]): string[] {
  return files.map((f) => f.path).filter((p) => SENSITIVE_PATH.test(p));
}
