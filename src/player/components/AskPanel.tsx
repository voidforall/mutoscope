import { useState, type KeyboardEvent } from "react";
import { buildContext, buildDeepLink, discussionBody, discussionTitle, newDiscussionUrl, refLabel } from "../../core";
import { MAX_LIVE_QUESTION, type Entity, type Manifest, type ReelContext, type Scene } from "../../schema";
import type { LiveSession } from "../live";
import { Anchor, Conversation, Presence } from "./Conversation";
import { accessibleName } from "./Nodes";

interface AskPanelProps {
  readonly manifest: Manifest;
  readonly scenes: readonly Scene[];
  readonly scene: Scene;
  readonly tMs: number;
  readonly entity?: Entity;
  readonly baseUrl: string;
  readonly live?: LiveSession;
  /** Called right before a question goes to the live agent (the player pauses on it). */
  readonly onAsking: () => void;
  readonly onJump: (context: ReelContext) => void;
  readonly onMoment: (href: string) => void;
}

const SUBMIT_HINT = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘↵" : "Ctrl ↵";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AskPanel({ manifest, scenes, scene, tMs, entity, baseUrl, live, onAsking, onJump, onMoment }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<{ readonly ok: boolean; readonly text: string }>();
  const [sending, setSending] = useState(false);
  const context = buildContext(manifest, scene, tMs, entity?.id);
  const link = buildDeepLink(baseUrl, { sceneId: scene.id, tMs: context.timestampMs, entityId: context.entityId });
  const trimmed = question.trim();
  const body = discussionBody({ question: trimmed, context, deepLink: link }, scene);
  const collab = manifest.collaboration;
  const ended = live?.snapshot?.ended ?? false;

  const openDiscussion = () => {
    if (!collab || !trimmed) return;
    window.open(newDiscussionUrl(collab, discussionTitle(trimmed), body), "_blank", "noopener,noreferrer");
    setStatus({ ok: true, text: "Opened GitHub in a new tab — review and press “Start discussion” there." });
  };
  const copyBody = async () => {
    const ok = await copy(`${discussionTitle(trimmed || "Question")}\n\n${body}`);
    setStatus(ok ? { ok: true, text: "Question and context copied." } : { ok: false, text: "Copy failed — select the text instead." });
  };
  const askAgent = async () => {
    if (!live || !trimmed || sending || ended) return;
    onAsking();
    setSending(true);
    try {
      await live.ask(trimmed, context);
      setQuestion("");
      setStatus(undefined);
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setSending(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (live && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void askAgent();
    }
  };

  const composer = (
    <section className={`panel-section${live ? " composer" : ""}`}>
      {!live && <p className="eyebrow">Ask about the current moment</p>}
      {live ? (
        <p className="context-line" aria-label="Question context">
          <span className="context-line-label">About</span> <Anchor scenes={scenes} context={context} />
        </p>
      ) : (
        <div className="context-chips" aria-label="Question context">
          <span className="chip"><b>Scene</b>{scene.title}</span>
          {entity && <span className="chip"><b>Entity</b>{accessibleName(entity)}</span>}
          <span className="chip"><b>At</b>{(context.timestampMs / 1000).toFixed(1)}s</span>
          {context.sourceRefs.map((r, i) => (
            <span className="chip is-mono" key={i}>{refLabel(r)}</span>
          ))}
        </div>
      )}
      {!entity && !live && <p className="hint">Tip: select an element on the stage first to anchor your question to it.</p>}
      <label className={live ? "visually-hidden" : "field-label"} htmlFor="ask-q">Your question</label>
      <textarea
        id="ask-q"
        className="textarea"
        rows={live ? 3 : 5}
        maxLength={MAX_LIVE_QUESTION}
        disabled={ended}
        placeholder={live && !entity ? "Ask about this moment — or click an element first to anchor it" : entity ? `Why does ${accessibleName(entity)} work this way?` : "What would you like explained?"}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="actions-row">
        {live && (
          <button className="btn is-primary" disabled={!trimmed || sending || ended} onClick={askAgent}>
            Ask agent <kbd className="kbd-hint">{SUBMIT_HINT}</kbd>
          </button>
        )}
        {collab && (
          <button className={`btn${live ? "" : " is-primary"}`} disabled={!trimmed} onClick={openDiscussion}>
            {live ? "GitHub discussion" : "Open as GitHub discussion"}
          </button>
        )}
        <button className={`btn${collab || live ? "" : " is-primary"}`} disabled={!trimmed} onClick={copyBody}>
          Copy question
        </button>
      </div>
      {status && <p className={`status${status.ok ? "" : " is-error"}`} role="status">{status.text}</p>}
      {!live && (
        <p className="hint">
          {collab
            ? `Nothing is sent from this page. GitHub opens with your question and this context prefilled in ${collab.repository} → ${collab.category}.`
            : "This reel has no discussion backend configured. Copy the question with its context and share it however you like."}
        </p>
      )}
      {live && !ended && (
        <button className="link-btn" onClick={() => void live.end().catch((e: Error) => setStatus({ ok: false, text: e.message }))}>
          End session
        </button>
      )}
    </section>
  );

  if (!live) return <div className="panel-body">{composer}</div>;
  return (
    <div className="panel-body ask-live">
      <section className="panel-section conversation-head">
        <p className="eyebrow">Ask your agent</p>
        <Presence live={live} />
      </section>
      <Conversation entries={live.snapshot?.entries ?? []} scenes={scenes} onJump={onJump} onMoment={onMoment} />
      {composer}
    </div>
  );
}
