import { useState } from "react";
import { buildContext, buildDeepLink, discussionBody, discussionTitle, newDiscussionUrl, refLabel } from "../../core";
import type { Entity, Manifest, Scene } from "../../schema";
import { accessibleName } from "./Nodes";

interface AskPanelProps {
  readonly manifest: Manifest;
  readonly scene: Scene;
  readonly tMs: number;
  readonly entity?: Entity;
  readonly baseUrl: string;
}

const MAX_QUESTION = 2000;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AskPanel({ manifest, scene, tMs, entity, baseUrl }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<string>();
  const context = buildContext(manifest, scene, tMs, entity?.id);
  const link = buildDeepLink(baseUrl, { sceneId: scene.id, tMs: context.timestampMs, entityId: context.entityId });
  const trimmed = question.trim();
  const body = discussionBody({ question: trimmed, context, deepLink: link }, scene);
  const collab = manifest.collaboration;

  const submit = () => {
    if (!collab || !trimmed) return;
    window.open(newDiscussionUrl(collab, discussionTitle(trimmed), body), "_blank", "noopener,noreferrer");
    setStatus("Opened GitHub in a new tab — review and press “Start discussion” there.");
  };
  const copyBody = async () => {
    const ok = await copy(`${discussionTitle(trimmed || "Question")}\n\n${body}`);
    setStatus(ok ? "Question and context copied." : "Copy failed — select the preview text instead.");
  };

  return (
    <div className="panel-body">
      <section className="panel-section">
        <p className="eyebrow">Ask about the current moment</p>
        <div className="context-chips" aria-label="Question context">
          <span className="chip"><b>Scene</b>{scene.title}</span>
          {entity && <span className="chip"><b>Entity</b>{accessibleName(entity)}</span>}
          <span className="chip"><b>At</b>{(context.timestampMs / 1000).toFixed(1)}s</span>
          {context.sourceRefs.map((r, i) => (
            <span className="chip is-mono" key={i}>{refLabel(r)}</span>
          ))}
        </div>
        {!entity && <p className="hint">Tip: select an element on the stage first to anchor your question to it.</p>}
        <label className="field-label" htmlFor="ask-q">Your question</label>
        <textarea
          id="ask-q"
          className="textarea"
          rows={5}
          maxLength={MAX_QUESTION}
          placeholder={entity ? `Why does ${accessibleName(entity)} work this way?` : "What would you like explained?"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="actions-row">
          {collab ? (
            <button className="btn is-primary" disabled={!trimmed} onClick={submit}>
              Open as GitHub discussion
            </button>
          ) : null}
          <button className={`btn${collab ? "" : " is-primary"}`} disabled={!trimmed} onClick={copyBody}>
            Copy question
          </button>
        </div>
        {status && <p className="status" role="status">{status}</p>}
        <p className="hint">
          {collab
            ? `Nothing is sent from this page. GitHub opens with your question and this context prefilled in ${collab.repository} → ${collab.category}.`
            : "This reel has no discussion backend configured. Copy the question with its context and share it however you like."}
        </p>
      </section>
    </div>
  );
}
