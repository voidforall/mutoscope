import { useMemo, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "../markdown";

interface MarkdownProps {
  readonly source: string;
  /** Called with a `?scene=…&t=…&entity=…` link the reader clicked. */
  readonly onMoment: (href: string) => void;
}

function renderInline(nodes: readonly Inline[], onMoment: (href: string) => void): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "code":
        return <code key={i}>{n.v}</code>;
      case "strong":
        return <strong key={i}>{renderInline(n.c, onMoment)}</strong>;
      case "em":
        return <em key={i}>{renderInline(n.c, onMoment)}</em>;
      case "link":
        if (n.kind === "moment") {
          return (
            <a key={i} className="md-moment" href={n.href} onClick={(e) => { e.preventDefault(); onMoment(n.href); }}>
              {renderInline(n.c, onMoment)}
            </a>
          );
        }
        if (n.kind === "external") {
          return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">{renderInline(n.c, onMoment)}</a>;
        }
        return <span key={i}>{renderInline(n.c, onMoment)}</span>;
    }
  });
}

export function Markdown({ source, onMoment }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return <p key={i}>{renderInline(b.c, onMoment)}</p>;
          case "h":
            return <p key={i} className={`md-h md-h${b.level}`}>{renderInline(b.c, onMoment)}</p>;
          case "pre":
            return <pre key={i}><code>{b.v}</code></pre>;
          case "ul":
          case "ol": {
            const List = b.t;
            return <List key={i}>{b.items.map((item, j) => <li key={j}>{renderInline(item, onMoment)}</li>)}</List>;
          }
        }
      })}
    </div>
  );
}
