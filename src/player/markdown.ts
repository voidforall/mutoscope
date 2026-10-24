/**
 * A deliberately small Markdown subset for agent answers, parsed to data and
 * rendered as React elements — never as HTML — so an answer cannot inject
 * markup or script. Links are classified, not trusted: `?scene=…` links seek
 * the player, http(s) links open externally, anything else stays plain text.
 */
export type Inline =
  | { readonly t: "text"; readonly v: string }
  | { readonly t: "code"; readonly v: string }
  | { readonly t: "strong" | "em"; readonly c: readonly Inline[] }
  | { readonly t: "link"; readonly href: string; readonly kind: LinkKind; readonly c: readonly Inline[] };

export type Block =
  | { readonly t: "p"; readonly c: readonly Inline[] }
  | { readonly t: "h"; readonly level: 1 | 2 | 3; readonly c: readonly Inline[] }
  | { readonly t: "ul" | "ol"; readonly items: readonly (readonly Inline[])[] }
  | { readonly t: "pre"; readonly lang: string; readonly v: string };

export type LinkKind = "moment" | "external" | "none";

export function linkKind(href: string): LinkKind {
  if (/^\?[\w=&%.\-~]*$/.test(href) && /(^|[?&])(scene|t|entity)=/.test(href)) return "moment";
  if (/^https?:\/\/[^\s]+$/i.test(href)) return "external";
  return "none";
}

const INLINE = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^()\s]+)\)|(?<![\w*])\*([^*\n]+?)\*(?![\w*])|(?<![\w_])_([^_\n]+?)_(?![\w_])/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "strong", c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: "link", href: m[4]!, kind: linkKind(m[4]!), c: parseInline(m[3]) });
    else out.push({ t: "em", c: parseInline(m[5] ?? m[6]!) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i]!);
      blocks.push({ t: "pre", lang: fence[1] ?? "", v: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ t: "h", level: heading[1]!.length as 1 | 2 | 3, c: parseInline(heading[2]!.trim()) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const kind = item[1] ? "ul" : "ol";
      const items: Inline[][] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const it = LIST_ITEM.exec(lines[j]!);
        if (it && (it[1] ? "ul" : "ol") === kind) items.push(parseInline(it[3]!));
        else if (lines[j]!.trim() && /^\s{2,}/.test(lines[j]!) && items.length) items[items.length - 1] = [...items[items.length - 1]!, { t: "text", v: " " }, ...parseInline(lines[j]!.trim())];
        else break;
      }
      blocks.push({ t: kind, items });
      i = j - 1;
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}
