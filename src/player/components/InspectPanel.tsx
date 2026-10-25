import type { AnalysisUnit, Entity, Manifest, Thread } from "../../schema";
import { Icon } from "./Icon";
import { accessibleName } from "./Nodes";
import { BasisBadge, RefList } from "./Refs";

interface InspectPanelProps {
  readonly manifest: Manifest;
  readonly entity?: Entity;
  readonly units: readonly AnalysisUnit[];
  readonly threads: readonly Thread[];
  readonly onAsk: () => void;
  readonly onClear: () => void;
  readonly onOpenThreads: () => void;
}

const TYPE_NAMES: Record<Entity["type"], string> = {
  component: "Component",
  edge: "Connection",
  "code-block": "Code",
  label: "Note",
  group: "Group",
  "diff-panel": "Before / after",
  quote: "Quote",
};

export function InspectPanel({ manifest, entity, units, threads, onAsk, onClear, onOpenThreads }: InspectPanelProps) {
  if (!entity) {
    return (
      <div className="panel-body">
        <div className="empty">
          <p className="empty-title">Nothing selected</p>
          <p>Click anything on the stage to see what it is, where it lives in the source, and to ask about it. Playback pauses while you inspect.</p>
        </div>
      </div>
    );
  }
  const related = units.filter((u) => u.entities.includes(entity.id));
  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="inspect-head">
          <p className="eyebrow">{TYPE_NAMES[entity.type]}</p>
          <button className="icon-btn is-small" aria-label="Clear selection" onClick={onClear}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <h2 className={`panel-title${entity.type === "quote" ? " is-quote" : ""}`}>{entity.type === "quote" ? `“${entity.text}”` : accessibleName(entity)}</h2>
        {"sublabel" in entity && entity.sublabel && <p className="mono-sub">{entity.sublabel}</p>}
        {entity.type === "quote" && entity.attribution && <p className="mono-sub">— {entity.attribution}</p>}
        {entity.explanation ? <p className="prose">{entity.explanation}</p> : <p className="prose is-muted">No explanation was provided for this element.</p>}
      </section>
      {entity.sourceRefs.length > 0 && (
        <section className="panel-section">
          <h3 className="section-label">Source</h3>
          <RefList manifest={manifest} refs={entity.sourceRefs} />
        </section>
      )}
      {related.length > 0 && (
        <section className="panel-section">
          <h3 className="section-label">Analysis</h3>
          {related.map((u) => (
            <div key={u.id} className="unit">
              <p className="unit-title">
                {u.title} <span className={`confidence c-${u.confidence}`}>{u.confidence} confidence</span>
              </p>
              <p className="prose">{u.summary}</p>
              <ul className="claims">
                {u.claims.map((c, i) => (
                  <li key={i} className="claim">
                    <BasisBadge basis={c.basis} />
                    <p>{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      <section className="panel-section actions-row">
        <button className="btn is-primary" onClick={onAsk}>
          Ask about this
        </button>
        {threads.length > 0 && (
          <button className="btn" onClick={onOpenThreads}>
            {threads.length} discussion{threads.length > 1 ? "s" : ""}
          </button>
        )}
      </section>
    </div>
  );
}
