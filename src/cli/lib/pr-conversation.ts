/**
 * A pull request's conversation and commit messages as pinned snapshots, so
 * a reel can quote the discussion that shaped the final code — not only the
 * description, which is often written for an earlier design. Anchors are the
 * ones GitHub itself uses on the PR page, so cited links land on the comment.
 */
export interface PrCommit {
  readonly oid: string;
  readonly messageHeadline: string;
  readonly messageBody: string;
  readonly authors?: readonly { readonly login?: string; readonly name?: string }[];
}

interface Authored {
  readonly id: number;
  readonly user: { readonly login: string } | null;
  readonly body: string | null;
}

export interface IssueComment extends Authored {
  readonly created_at: string;
}

export interface Review extends Authored {
  readonly state: string;
  readonly submitted_at: string | null;
}

export interface ReviewComment extends Authored {
  readonly path: string;
  readonly line: number | null;
  readonly original_line: number | null;
  readonly in_reply_to_id?: number;
  readonly created_at: string;
}

export interface SnapshotInput {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly anchors: readonly string[];
}

const who = (a: Authored) => `@${a.user?.login ?? "ghost"}`;
const day = (iso: string | null) => (iso ?? "").slice(0, 10);
const body = (s: string | null) => (s ?? "").replace(/\r\n?/g, "\n").trim();

/** One block per message: an anchored header line, then the message text. */
function block(anchor: string, header: string, text: string): string {
  return [`{#${anchor}} ${header}`, ...(text ? [text] : [])].join("\n\n");
}

export function conversationSnapshot(
  pr: { readonly url: string; readonly number: number; readonly title: string; readonly body: string; readonly author: string },
  commits: readonly PrCommit[],
  comments: readonly IssueComment[],
  reviews: readonly Review[],
  reviewComments: readonly ReviewComment[],
): SnapshotInput {
  const anchors: string[] = [];
  const timeline: { at: string; text: string }[] = [];
  for (const c of comments) {
    anchors.push(`issuecomment-${c.id}`);
    timeline.push({ at: c.created_at, text: block(`issuecomment-${c.id}`, `${who(c)} commented on ${day(c.created_at)}:`, body(c.body)) });
  }
  for (const r of reviews) {
    if (!body(r.body) && r.state === "COMMENTED") continue;
    anchors.push(`pullrequestreview-${r.id}`);
    const verdict = r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "requested changes" : "reviewed";
    timeline.push({ at: r.submitted_at ?? "", text: block(`pullrequestreview-${r.id}`, `${who(r)} ${verdict} on ${day(r.submitted_at)}:`, body(r.body)) });
  }
  // Review threads stay together: the first comment on a line, then its replies.
  const roots = reviewComments.filter((c) => !c.in_reply_to_id);
  for (const root of roots) {
    const thread = [root, ...reviewComments.filter((c) => c.in_reply_to_id === root.id)];
    const line = root.line ?? root.original_line;
    const where = `${root.path}${line ? `:${line}` : ""}`;
    const text = thread
      .map((c, i) => {
        anchors.push(`discussion_r${c.id}`);
        return block(`discussion_r${c.id}`, i === 0 ? `${who(c)} on ${where} (${day(c.created_at)}):` : `${who(c)} replied (${day(c.created_at)}):`, body(c.body));
      })
      .join("\n\n");
    timeline.push({ at: root.created_at, text });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  const commitList = commits.map((c) => `- ${c.oid.slice(0, 7)} ${c.messageHeadline}`).join("\n");
  const text = [
    `Opened by @${pr.author}. The description below is what the author wrote when opening the PR; later commits and review may have changed the design.`,
    body(pr.body) || "(no description)",
    `## Commits`,
    commitList || "(none)",
    `## Conversation`,
    ...(timeline.length ? timeline.map((t) => t.text) : ["(no comments)"]),
  ].join("\n\n");
  return { url: pr.url, title: `${pr.title} (#${pr.number})`, text, anchors };
}

export function commitSnapshot(repository: string, c: PrCommit): SnapshotInput {
  const authors = (c.authors ?? []).map((a) => (a.login ? `@${a.login}` : a.name)).filter(Boolean).join(", ");
  return {
    url: `https://github.com/${repository}/commit/${c.oid}`,
    title: c.messageHeadline,
    text: [`Commit ${c.oid}${authors ? ` by ${authors}` : ""}.`, c.messageHeadline, body(c.messageBody)].filter(Boolean).join("\n\n"),
    anchors: [],
  };
}
