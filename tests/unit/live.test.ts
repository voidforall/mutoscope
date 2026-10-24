import { describe, expect, it } from "vitest";
import { addAnswer, addQuestion, markDelivered, pendingQuestions, presenceOf, type Entries } from "../../src/cli/live/conversation";
import { renderReelHtml } from "../../src/cli/lib/html";
import { linkKind, parseInline, parseMarkdown } from "../../src/player/markdown";
import { ReelBundle, type ReelContext } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const context: ReelContext = { reelId: "spsc-evolution", reelVersion: 1, sceneId: "drop-the-lock", timestampMs: 6000, sourceRefs: [] };
const ask = (text: string) => ({ text, context });

describe("live conversation", () => {
  it("queues, hands over, and answers questions in one batch", () => {
    let e: Entries = addQuestion([], ask("why acquire?"), "q1", "t1");
    e = addQuestion(e, ask("and relaxed?"), "q2", "t2");
    expect(pendingQuestions(e).map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(presenceOf(e, false)).toBe("offline");

    e = markDelivered(e, ["q1", "q2"]);
    expect(presenceOf(e, false)).toBe("working");
    expect(presenceOf(e, true)).toBe("listening");

    e = addAnswer(e, "Because…", "a1", "t3");
    expect(pendingQuestions(e)).toEqual([]);
    expect(e.at(-1)).toMatchObject({ role: "agent", inReplyTo: ["q1", "q2"] });
    expect(presenceOf(e, false)).toBe("offline");
  });

  it("re-hands questions that were delivered but never answered (agent restarted)", () => {
    const e = markDelivered(addQuestion([], ask("q"), "q1", "t"), ["q1"]);
    expect(pendingQuestions(e).map((q) => q.id)).toEqual(["q1"]);
  });

  it("does not answer questions that arrived after the poll returned", () => {
    let e = markDelivered(addQuestion([], ask("first"), "q1", "t"), ["q1"]);
    e = addQuestion(e, ask("second"), "q2", "t");
    e = addAnswer(e, "answer to first", "a1", "t");
    expect(pendingQuestions(e).map((q) => q.id)).toEqual(["q2"]);
  });

  it("records a reply with nothing outstanding as a plain note", () => {
    expect(addAnswer([], "I updated scene 3.", "a1", "t")).toEqual([{ role: "agent", id: "a1", at: "t", text: "I updated scene 3.", inReplyTo: [] }]);
  });

  it("never mutates the previous entries", () => {
    const before = addQuestion([], ask("q"), "q1", "t");
    const snapshot = JSON.stringify(before);
    addAnswer(markDelivered(before, ["q1"]), "a", "a1", "t");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("answer markdown", () => {
  it("classifies links: moments seek, http(s) open, everything else is inert", () => {
    expect(linkKind("?scene=happens-before&t=0")).toBe("moment");
    expect(linkKind("?entity=push-diff")).toBe("moment");
    expect(linkKind("https://github.com/a/b/blob/sha/f.hpp#L1-L2")).toBe("external");
    expect(linkKind("javascript:alert(1)")).toBe("none");
    expect(linkKind("data:text/html,<b>x</b>")).toBe("none");
    expect(linkKind("//evil.example")).toBe("none");
    expect(linkKind("?foo=bar")).toBe("none");
  });

  it("parses inline code, emphasis and links", () => {
    expect(parseInline("a `x` **b** *c* [d](?scene=s)")).toEqual([
      { t: "text", v: "a " },
      { t: "code", v: "x" },
      { t: "text", v: " " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "link", href: "?scene=s", kind: "moment", c: [{ t: "text", v: "d" }] },
    ]);
  });

  it("keeps snake_case and pointer stars as text", () => {
    expect(parseInline("memory_order_acquire and T* p")).toEqual([{ t: "text", v: "memory_order_acquire and T* p" }]);
  });

  it("parses paragraphs, headings, lists and fenced code", () => {
    const blocks = parseMarkdown("## Why\n\nOne\nline.\n\n- a\n- b\n\n1. x\n2. y\n\n```cpp\nint* p;\n```");
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "ul", "ol", "pre"]);
    expect(blocks[1]).toEqual({ t: "p", c: [{ t: "text", v: "One line." }] });
    expect(blocks[4]).toEqual({ t: "pre", lang: "cpp", v: "int* p;" });
  });

  it("treats raw HTML as text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([{ t: "p", c: [{ t: "text", v: "<img src=x onerror=alert(1)>" }] }]);
  });
});

describe("live page", () => {
  const bundle = ReelBundle.parse(exampleRaw());
  const csp = (html: string) => /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";

  it("may talk to its own origin only, and embeds the session config", () => {
    const html = renderReelHtml(bundle, "1", "a{}", { sessionId: "0123456789abcdef", token: "a".repeat(48) });
    expect(csp(html)).toContain("connect-src 'self'");
    expect(csp(html)).toContain("default-src 'none'");
    expect(html).toContain('id="mutoscope-live"');
  });

  it("built reels stay offline", () => {
    const html = renderReelHtml(bundle, "1", "a{}");
    expect(csp(html)).not.toContain("connect-src");
    expect(html).not.toContain("mutoscope-live");
  });
});
