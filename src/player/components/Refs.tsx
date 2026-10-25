import { pinnedDocumentFor, refHref, refLabel } from "../../core";
import type { Manifest, SourceRef } from "../../schema";
import { Icon } from "./Icon";

export function RefList({ manifest, refs }: { readonly manifest: Manifest; readonly refs: readonly SourceRef[] }) {
  if (refs.length === 0) return null;
  return (
    <ul className="ref-list">
      {refs.map((r, i) => {
        const href = refHref(manifest, r);
        const pinned = r.kind === "url" ? pinnedDocumentFor(manifest, r.url) : undefined;
        const title = pinned ? `Snapshot taken ${pinned.retrievedAt.slice(0, 10)} — the page may have changed since` : undefined;
        return (
          <li key={i} className={r.kind === "url" && r.quote ? "has-quote" : undefined} title={title}>
            {href ? (
              <a className="ref" href={href} target="_blank" rel="noopener noreferrer">
                <span className="ref-text">{refLabel(r)}</span>
                <Icon name="external" size={13} />
              </a>
            ) : (
              <span className="ref is-plain">
                <span className="ref-text">{refLabel(r)}</span>
              </span>
            )}
            {r.kind === "url" && r.quote && <blockquote className="ref-quote">“{r.quote}”</blockquote>}
          </li>
        );
      })}
    </ul>
  );
}

export function BasisBadge({ basis }: { readonly basis: "evidence" | "inference" }) {
  return (
    <span className={`basis basis-${basis}`} title={basis === "evidence" ? "Backed by cited source" : "Reasoned, not verified"}>
      {basis === "evidence" ? "Evidence" : "Inference"}
    </span>
  );
}
