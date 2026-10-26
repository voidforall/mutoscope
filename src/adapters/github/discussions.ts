import { ANSWER_MARKER, isAgentAnswer, parseDiscussionBody, stripAnswerFooter } from "../../core";
import type { Thread, ThreadStatus } from "../../schema";
import { ghGraphql } from "../../cli/lib/exec";
import { CliError } from "../../cli/lib/reel-files";

const PAGE = 50;

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface RawComment {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  author: { login: string } | null;
}

export interface RawDiscussion {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  createdAt: string;
  closed: boolean;
  isAnswered: boolean | null;
  author: { login: string } | null;
  comments: { nodes: RawComment[] };
}

/** A synced thread plus the provider id needed to reply. */
export interface DiscussionThread extends Thread {
  readonly discussionId: string;
}

const splitRepo = (repo: string) => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new CliError(`Expected owner/repo, got '${repo}'`);
  return { owner, name };
};

export async function repoDiscussionInfo(repo: string): Promise<{ id: string; enabled: boolean; categories: Category[] }> {
  const { owner, name } = splitRepo(repo);
  const data = await ghGraphql<{
    repository: { id: string; hasDiscussionsEnabled: boolean; discussionCategories: { nodes: Category[] } };
  }>(
    `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id hasDiscussionsEnabled discussionCategories(first:50){nodes{id name slug}}}}`,
    { owner, name },
  );
  return {
    id: data.repository.id,
    enabled: data.repository.hasDiscussionsEnabled,
    categories: data.repository.discussionCategories.nodes,
  };
}

const AUTHOR = (a: { login: string } | null) => a?.login ?? "ghost";

function replyBody(body: string): string {
  return isAgentAnswer(body) ? stripAnswerFooter(body) : body.replace(ANSWER_MARKER, "").trim();
}

export function toThread(d: RawDiscussion, reelId: string): DiscussionThread | null {
  const parsed = parseDiscussionBody(d.body);
  if (!parsed.ok || parsed.context.reelId !== reelId) return null;
  const replies = d.comments.nodes.map((c) => ({
    author: AUTHOR(c.author),
    body: replyBody(c.body),
    createdAt: c.createdAt,
    url: c.url,
    aiAssisted: isAgentAnswer(c.body),
  }));
  const status: ThreadStatus = d.closed ? "closed" : d.isAnswered || replies.some((r) => r.aiAssisted) ? "answered" : "open";
  return {
    id: `gh-${d.number}`,
    discussionId: d.id,
    number: d.number,
    url: d.url,
    title: d.title,
    question: parsed.question,
    author: AUTHOR(d.author),
    createdAt: d.createdAt,
    status,
    context: parsed.context,
    replies,
  };
}

/** Every discussion in the category whose context block names this reel. */
export async function fetchReelThreads(repo: string, categoryName: string, reelId: string): Promise<DiscussionThread[]> {
  const info = await repoDiscussionInfo(repo);
  if (!info.enabled) throw new CliError(`Discussions are disabled on ${repo}`, "Run `mutoscope collab setup` for instructions.");
  const category = info.categories.find((c) => c.name === categoryName);
  if (!category) throw new CliError(`No discussion category '${categoryName}' in ${repo}`);
  const { owner, name } = splitRepo(repo);
  const data = await ghGraphql<{ repository: { discussions: { nodes: RawDiscussion[] } } }>(
    `query($owner:String!,$name:String!,$cat:ID!,$n:Int!){repository(owner:$owner,name:$name){discussions(first:$n,categoryId:$cat,orderBy:{field:CREATED_AT,direction:DESC}){nodes{id number title url body createdAt closed isAnswered author{login} comments(first:30){nodes{id body url createdAt author{login}}}}}}}`,
    { owner, name, cat: category.id, n: PAGE },
  );
  return data.repository.discussions.nodes.map((d) => toThread(d, reelId)).filter((t): t is DiscussionThread => t !== null);
}

export async function postDiscussionReply(discussionId: string, body: string): Promise<string> {
  const data = await ghGraphql<{ addDiscussionComment: { comment: { url: string } } }>(
    `mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{url}}}`,
    { id: discussionId, body },
  );
  return data.addDiscussionComment.comment.url;
}
