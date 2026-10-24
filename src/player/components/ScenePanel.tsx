import type { Manifest, Scene } from "../../schema";
import { formatClock } from "../../core";
import { BasisBadge, RefList } from "./Refs";

interface ScenePanelProps {
  readonly manifest: Manifest;
  readonly scenes: readonly Scene[];
  readonly index: number;
  readonly onJump: (index: number) => void;
}

export function ScenePanel({ manifest, scenes, index, onJump }: ScenePanelProps) {
  const scene = scenes[index]!;
  return (
    <div className="panel-body">
      <section className="panel-section">
        <p className="eyebrow">
          Scene {index + 1} of {scenes.length}
          {scene.kicker ? ` · ${scene.kicker}` : ""}
        </p>
        <h2 className="panel-title">{scene.title}</h2>
        <p className="prose">{scene.narration}</p>
      </section>
      {scene.claims.length > 0 && (
        <section className="panel-section">
          <h3 className="section-label">Claims in this scene</h3>
          <ul className="claims">
            {scene.claims.map((c, i) => (
              <li key={i} className="claim">
                <BasisBadge basis={c.basis} />
                <p>{c.text}</p>
                <RefList manifest={manifest} refs={c.refs} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel-section">
        <h3 className="section-label">Scenes</h3>
        <ol className="chapters">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <button className={`chapter-btn${i === index ? " is-current" : ""}`} onClick={() => onJump(i)} aria-current={i === index}>
                <span className="chapter-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="chapter-name">
                  {s.kicker && <span className="chapter-kicker">{s.kicker}</span>}
                  {s.title}
                </span>
                <span className="chapter-dur">{formatClock(s.durationMs)}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
