/** Font size that fits `lines` of monospace text into a box. Stage units. */
export function fitMono(lines: readonly string[], width: number, height: number, max = 20, min = 9): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const byWidth = width / (longest * 0.61);
  const byHeight = height / (lines.length * 1.5);
  return Math.max(min, Math.min(max, byWidth, byHeight));
}
