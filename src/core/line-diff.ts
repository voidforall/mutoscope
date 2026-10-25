export type DiffKind = "same" | "removed" | "added";

export interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
}

/** Line-level LCS diff; snippets are capped at 24 lines so O(n*m) is fine. */
export function diffLines(before: string, after: string): { before: DiffLine[]; after: DiffLine[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const keptA = new Set<number>();
  const keptB = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      keptA.add(i++);
      keptB.add(j++);
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  return {
    before: a.map((text, i) => ({ kind: keptA.has(i) ? "same" : "removed", text })),
    after: b.map((text, i) => ({ kind: keptB.has(i) ? "same" : "added", text })),
  };
}

/** A line standing for omitted code in a quoted excerpt: "…" or "...", optionally inside a comment. */
const ELISION = /^\s*(?:\/\/+|#|--|;+|\/\*+|\*)?\s*(?:\u2026|\.\.\.)\s*(?:\*+\/)?\s*$/;
export const isElision = (line: string): boolean => ELISION.test(line);

