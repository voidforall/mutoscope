/**
 * Verbatim-quote checks against a pinned snapshot. Matching forgives what
 * changes in copy-paste — typographic quotes and dashes, case, whitespace,
 * the snapshot's own markup — and nothing else. "…" (or "...") in a quote
 * joins passages that must appear in that order.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The snapshot as plain text, one block per line: no heading marks, anchors, bullets, quote marks or fences. */
export function plainSnapshot(markdown: string): string {
  let inFence = false;
  const lines: string[] = [];
  for (const raw of markdown.split("\n")) {
    if (/^\s*(?:> )*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (raw.startsWith("<!--")) continue;
    // Code is quoted verbatim: a YAML "- key" or a log line starting "- " keeps its dash.
    const line = inFence
      ? raw
      : raw
          .replace(/^(?:> )+/, "")
          .replace(/^#{1,6} /, "")
          .replace(/^- /, "")
          .replace(/^\{#[^}]+\} /, "")
          .replace(/ ?\{#[^}]+\}$/, "");
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}

/** Only the ellipsis character joins passages: "..." is often part of the quoted text itself (logs, progress lines). */
const ELLIPSIS = /\s*…\s*/;

export function quoteFound(haystackPlain: string, quote: string): boolean {
  const hay = normalizeText(haystackPlain);
  let from = 0;
  for (const part of quote.split(ELLIPSIS).map(normalizeText).filter(Boolean)) {
    const at = hay.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/** True when every "…"-joined passage is on the page but not in the quoted order. */
export function quoteOutOfOrder(haystackPlain: string, quote: string): boolean {
  const parts = quote.split(ELLIPSIS).filter((p) => p.trim());
  return parts.length > 1 && parts.every((p) => quoteFound(haystackPlain, p)) && !quoteFound(haystackPlain, quote);
}

const words = (s: string) => normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 || /\p{N}/u.test(w));

/** The snapshot sentence sharing the most words with `quote`, to show where it probably came from. */
export function closestPassage(haystackPlain: string, quote: string): string | undefined {
  const want = new Set(words(quote));
  if (want.size === 0) return undefined;
  let best: { score: number; text: string } | undefined;
  for (const sentence of haystackPlain.split(/(?<=[.!?])\s+|\n+/)) {
    const score = words(sentence).filter((w) => want.has(w)).length / want.size;
    if (!best || score > best.score) best = { score, text: sentence.trim() };
  }
  return best && best.score >= 0.4 ? best.text.slice(0, 240) : undefined;
}
