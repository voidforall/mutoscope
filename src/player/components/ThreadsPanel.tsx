import { useState } from "react";
import type { Manifest, Scene, Thread } from "../../schema";
import { Icon } from "./Icon";

interface ThreadsPanelProps {
  readonly manifest: Manifest;
  readonly threads: readonly Thread[];
  readonly syncedAt?: string;
  readonly scenes: readonly Scene[];
  readonly sceneId: string;
  readonly onJump: (thread: Thread) => void;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export function ThreadsPanel({ manifest, threads, syncedAt, scenes, sceneId, onJump }: ThreadsPanelProps) {
  const [scope, setScope] = useState<"scene" | "all">("scene");
  const visible = scope === "scene" ? threads.filter((t) => t.context.sceneId === sceneId) : threads;
  const collab = manifest.collaboration;
  const sceneTitle = (id: string) => scenes.find((s) => s.id === id)?.title ?? id;
  const browse = collab ? `https://github.com/${collab.repository}/discussions?discussions_q=${encodeURIComponent(`"${manifest.id}"`)}` : undefined;

  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="segmented" role="tablist" aria-label="Thread scope">
          {(["scene", "all"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} className={scope === s ? "is-on" : ""} onClick={() => setScope(s)}>
              {s === "scene" ? "This scene" : `All (${threads.length})`}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No discussions {scope === "scene" ? "on this scene" : "yet"}</p>
            <p>Questions asked from this reel appear here after the author syncs them.</p>
          </div>
        ) : (
          <ul className="threads">
            {visible.map((t) => (
              <li key={t.id} className="thread">
                <div className="thread-meta">
                  <span className={`status-pill s-${t.status}`}>{t.status}</span>
                  <span>@{t.author} · {fmtDate(t.createdAt)}</span>
                </div>
                <p className="thread-q">{t.question}</p>
                <button className="anchor-btn" onClick={() => onJump(t)}>
                  ↳ {sceneTitle(t.context.sceneId)}
                  {t.context.entityId ? ` · ${t.context.entityId}` : ""} · {(t.context.timestampMs / 1000).toFixed(1)}s
                </button>
                {t.replies.map((r, i) => (
                  <div key={i} className="reply">
                    <div className="thread-meta">
                      <span>@{r.author}</span>
                      {r.aiAssisted && <span className="ai-pill">AI-assisted</span>}
                    </div>
                    <p className="reply-body">{r.body}</p>
                  </div>
                ))}
                {t.url && (
                  <a className="ext-link" href={t.url} target="_blank" rel="noopener noreferrer">
                    Open on GitHub <Icon name="external" size={13} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel-section">
        {syncedAt && <p className="hint">Snapshot synced {fmtDate(syncedAt)}. Newer replies may exist on GitHub.</p>}
        {browse && (
          <a className="ext-link" href={browse} target="_blank" rel="noopener noreferrer">
            Browse all discussions for this reel <Icon name="external" size={13} />
          </a>
        )}
      </section>
    </div>
  );
}
