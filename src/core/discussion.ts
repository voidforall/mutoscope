import { ReelContext, type GithubDiscussionsCollab, type Manifest, type Scene } from "../schema";
import { refLabel } from "./source-links";

/**
 * The wire format between the player (writer) and the author's local agent
 * (reader). Human-readable markdown plus one fenced, schema-validated JSON
 * block, so an agent never has to guess the anchor from prose.
 */
export const CONTEXT_FENCE = "mutoscope-context";
export const ANSWER_MARKER = "<!-- mutoscope:answer -->";
export const TITLE_PREFIX = "[Reel]";
const MAX_TITLE_QUESTION = 90;

export interface QuestionDraft {
  readonly question: string;
  readonly context: ReelContext;
  readonly deepLink?: string;
}

export function discussionTitle(question: string): string {
  const firstLine = question.trim().split("\n")[0] ?? "";
  const short = firstLine.length > MAX_TITLE_QUESTION ? `${firstLine.slice(0, MAX_TITLE_QUESTION - 1)}…` : firstLine;
  return `${TITLE_PREFIX} ${short}`;
}

export function discussionBody(draft: QuestionDraft, scene: Scene | undefined): string {
  const { context } = draft;
  const entity = scene?.entities.find((e) => e.id === context.entityId);
  const lines = [
    "## Question",
    "",
    draft.question.trim(),
    "",
    "## Reel context",
    "",
    `- Reel: \`${context.reelId}\` (v${context.reelVersion})`,
    `- Scene: \`${context.sceneId}\`${scene ? ` — ${scene.title}` : ""}`,
    ...(context.entityId ? [`- Entity: \`${context.entityId}\`${entity && "label" in entity && entity.label ? ` — ${entity.label}` : ""}`] : []),
    `- Timestamp: ${context.timestampMs}ms`,
    ...context.sourceRefs.map((r) => `- Source: \`${refLabel(r)}\``),
    ...(context.commit ? [`- Commit: \`${context.commit}\``] : []),
    ...(draft.deepLink ? ["", "## Link", "", draft.deepLink] : []),
    "",
    `\`\`\`json ${CONTEXT_FENCE}`,
    JSON.stringify(context, null, 2),
    "```",
  ];
  return lines.join("\n");
}

export function newDiscussionUrl(collab: GithubDiscussionsCollab, title: string, body: string): string {
  const url = new URL(`https://github.com/${collab.repository}/discussions/new`);
  url.searchParams.set("category", collab.categorySlug);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}

export function buildContext(
  manifest: Manifest,
  scene: Scene,
  tMs: number,
  entityId: string | undefined,
): ReelContext {
  const entity = scene.entities.find((e) => e.id === entityId);
  return {
    reelId: manifest.id,
    reelVersion: manifest.version,
    sceneId: scene.id,
    timestampMs: Math.floor(tMs),
    ...(entity ? { entityId: entity.id } : {}),
    sourceRefs: entity?.sourceRefs ?? [],
    ...(manifest.source.provider !== "none" ? { commit: manifest.source.headSha } : {}),
  };
}

export type ParsedQuestion =
  | { readonly ok: true; readonly question: string; readonly context: ReelContext }
  | { readonly ok: false; readonly reason: string };

const FENCE_RE = new RegExp("```json " + CONTEXT_FENCE + "\\s*\\n([\\s\\S]*?)\\n```");

/** Parse an untrusted discussion body. Never throws. */
export function parseDiscussionBody(body: string): ParsedQuestion {
  const match = FENCE_RE.exec(body);
  if (!match) return { ok: false, reason: "no mutoscope-context block" };
  let raw: unknown;
  try {
    raw = JSON.parse(match[1]!);
  } catch {
    return { ok: false, reason: "context block is not valid JSON" };
  }
  const parsed = ReelContext.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `context block invalid: ${parsed.error.issues[0]?.message}` };
  const q = /## Question\s*\n([\s\S]*?)(?:\n## |\n```|$)/.exec(body);
  return { ok: true, question: (q?.[1] ?? "").trim(), context: parsed.data };
}

export function isAgentAnswer(body: string): boolean {
  return body.includes(ANSWER_MARKER);
}

/**
 * What posting `body` would do beyond answering: @mentions notify people, and
 * links or `owner/repo#n` references to other repositories' issues and PRs put
 * a cross-reference on their timelines. Code spans and blocks are inert.
 */
export function answerSideEffects(body: string, ownRepo: string): string[] {
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const effects: string[] = [];
  for (const m of prose.matchAll(/(?<![\w/@.])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\b/g)) effects.push(`@${m[1]} will be notified`);
  const refs = new Set<string>();
  for (const m of prose.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues|discussions)\/(\d+)/g)) refs.add(`${m[1]}#${m[2]}`);
  for (const m of prose.matchAll(/(?<![\w/])([\w.-]+\/[\w.-]+)#(\d+)\b/g)) refs.add(`${m[1]}#${m[2]}`);
  for (const r of refs) {
    if (r.split("#")[0]!.toLowerCase() !== ownRepo.toLowerCase()) effects.push(`${r} will show a cross-reference to this discussion`);
  }
  return effects;
}

/** Every published answer carries a visible AI-assistance notice and a machine marker. */
export function withAnswerFooter(answer: string, approver: string): string {
  return [
    answer.trim(),
    "",
    "---",
    `<sub>AI-assisted answer drafted with mutoscope from the pinned source; reviewed and approved by @${approver}.</sub>`,
    "",
    ANSWER_MARKER,
  ].join("\n");
}
