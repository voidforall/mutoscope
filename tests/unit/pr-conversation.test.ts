import { describe, expect, it } from "vitest";
import { commitSnapshot, conversationSnapshot } from "../../src/cli/lib/pr-conversation";
import { plainSnapshot, quoteFound } from "../../src/cli/lib/quote-match";

const pr = { url: "https://github.com/o/r/pull/7", number: 7, title: "steal from the LIFO slot", body: "We now also grab the LIFO task.", author: "hawkw" };
const user = (login: string) => ({ login });

describe("PR conversation snapshot", () => {
  const snap = conversationSnapshot(
    pr,
    [{ oid: "c47b9c8".padEnd(40, "0"), messageHeadline: "only steal LIFO when queue is empty", messageBody: "" }],
    [{ id: 11, user: user("carllerche"), body: "Nice.", created_at: "2026-03-02T00:00:00Z" }],
    [
      { id: 21, user: user("Darksonn"), body: "", state: "COMMENTED", submitted_at: "2026-03-01T00:00:00Z" },
      { id: 22, user: user("Darksonn"), body: "LGTM", state: "APPROVED", submitted_at: "2026-03-03T00:00:00Z" },
    ],
    [
      { id: 31, user: user("Darksonn"), body: "This takes a second steal attempt.", path: "queue.rs", line: 455, original_line: 455, created_at: "2026-03-01T00:00:00Z" },
      { id: 32, user: user("hawkw"), body: "Good point, changed.", path: "queue.rs", line: 455, original_line: 455, in_reply_to_id: 31, created_at: "2026-03-01T01:00:00Z" },
    ],
  );

  it("uses GitHub's own anchors for comments, reviews and review threads", () => {
    expect(snap.anchors).toEqual(expect.arrayContaining(["issuecomment-11", "pullrequestreview-22", "discussion_r31", "discussion_r32"]));
    expect(snap.anchors).not.toContain("pullrequestreview-21");
  });

  it("keeps review threads together and the conversation in time order", () => {
    const at = (s: string) => snap.text.indexOf(s);
    expect(at("{#discussion_r31} @Darksonn on queue.rs:455")).toBeLessThan(at("{#discussion_r32} @hawkw replied"));
    expect(at("{#discussion_r32}")).toBeLessThan(at("{#issuecomment-11}"));
    expect(at("{#issuecomment-11}")).toBeLessThan(at("{#pullrequestreview-22} @Darksonn approved"));
  });

  it("warns that the description predates review, and lists the commits", () => {
    expect(snap.text).toContain("later commits and review may have changed the design");
    expect(snap.text).toContain("- c47b9c8 only steal LIFO when queue is empty");
  });

  it("is quotable like any pinned page", () => {
    const plain = plainSnapshot(snap.text);
    expect(quoteFound(plain, "This takes a second steal attempt.")).toBe(true);
    expect(quoteFound(plain, "We now also grab the LIFO task.")).toBe(true);
  });
});

describe("commit snapshot", () => {
  it("pins the full message at the canonical commit URL", () => {
    const s = commitSnapshot("o/r", { oid: "a".repeat(40), messageHeadline: "rt: steal", messageBody: "Body text.", authors: [{ login: "hawkw" }] });
    expect(s.url).toBe(`https://github.com/o/r/commit/${"a".repeat(40)}`);
    expect(s.text).toContain("by @hawkw");
    expect(s.text).toContain("Body text.");
  });
});
