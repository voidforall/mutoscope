import { useEffect, useRef } from "react";
import type { LiveEntry, LiveQuestion, ReelContext, Scene } from "../../schema";
import type { LiveSession } from "../live";
import { Markdown } from "./Markdown";
import { accessibleName } from "./Nodes";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const PRESENCE = {
  listening: { tone: "on", label: "Agent listening" },
  working: { tone: "busy", label: "Agent is answering…" },
  offline: { tone: "off", label: "No agent listening" },
} as const;

export function Presence({ live }: { readonly live: LiveSession }) {
  const s = live.snapshot;
  const { tone, label } = !live.connected
    ? { tone: "off", label: "Reconnecting…" }
    : s?.ended
      ? { tone: "off", label: "Session ended" }
      : PRESENCE[s?.presence ?? "offline"];
  return (
    <span className={`presence is-${tone}`} role="status">
      <span className="presence-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function anchorParts(scenes: readonly Scene[], c: ReelContext): string[] {
  const scene = scenes.find((s) => s.id === c.sceneId);
  const entity = scene?.entities.find((e) => e.id === c.entityId);
  return [scene?.title ?? c.sceneId, entity ? accessibleName(entity) : c.entityId, `${(c.timestampMs / 1000).toFixed(1)}s`].filter((p): p is string => Boolean(p));
}

/** "Scene · entity · 6.0s", wrapping only between parts so refs like `Fifo3.hpp:54-63` never split. */
export function Anchor({ scenes, context }: { readonly scenes: readonly Scene[]; readonly context: ReelContext }) {
  const parts = anchorParts(scenes, context);
  return (
    <span className="anchor-parts">
      {parts.map((p, i) => (
        <span key={i} className="anchor-part">{i > 0 ? `· ${p}` : p}</span>
      ))}
    </span>
  );
}

const MESSAGE_SCROLL_MARGIN = 12;

const WAITING: Record<LiveQuestion["status"], string | undefined> = {
  queued: "Waiting for your agent to pick this up",
  delivered: "Your agent is reading the source…",
  answered: undefined,
};

interface ConversationProps {
  readonly entries: readonly LiveEntry[];
  readonly scenes: readonly Scene[];
  readonly onJump: (context: ReelContext) => void;
  readonly onMoment: (href: string) => void;
}

export function Conversation({ entries, scenes, onJump, onMoment }: ConversationProps) {
  const newest = useRef<HTMLLIElement>(null);
  // Bring the newest message's top into view inside the panel only; scrollIntoView would also scroll the page.
  useEffect(() => {
    const el = newest.current;
    const box = el?.closest(".panel-body");
    if (!el || !box || box.scrollHeight <= box.clientHeight) return;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - MESSAGE_SCROLL_MARGIN;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <section className="panel-section conversation">
        <div className="empty">
          <p className="empty-title">Pause anywhere and ask</p>
          <p>Your question goes to the agent in your terminal with this exact moment attached. Answers appear here, with links that jump the reel to what they explain.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="panel-section conversation" aria-label="Conversation with your agent">
      <ol className="messages">
        {entries.map((e, i) =>
          e.role === "viewer" ? (
            <li key={e.id} ref={i === entries.length - 1 ? newest : undefined} className="msg is-viewer">
              <div className="msg-meta">
                <span>You</span>
                <span>{fmtTime(e.at)}</span>
              </div>
              <button className="anchor-btn" onClick={() => onJump(e.context)}>↳ <Anchor scenes={scenes} context={e.context} /></button>
              <p className="msg-text">{e.text}</p>
              {WAITING[e.status] && <p className={`msg-wait is-${e.status}`}>{WAITING[e.status]}</p>}
            </li>
          ) : (
            <li key={e.id} ref={i === entries.length - 1 ? newest : undefined} className="msg is-agent">
              <div className="msg-meta">
                <span>Agent</span>
                <span className="ai-pill">AI</span>
                <span>{fmtTime(e.at)}</span>
              </div>
              <Markdown source={e.text} onMoment={onMoment} />
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
