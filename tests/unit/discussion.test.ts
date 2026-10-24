import { describe, expect, it } from "vitest";
import {
  ANSWER_MARKER,
  buildContext,
  discussionBody,
  discussionTitle,
  isAgentAnswer,
  newDiscussionUrl,
  parseDiscussionBody,
  withAnswerFooter,
} from "../../src/core";
import { Manifest, Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const raw = exampleRaw();
const manifest = Manifest.parse(raw.manifest);
const scene = Scene.parse(raw.scenes[0]);

describe("discussion codec", () => {
  it("round-trips context through the markdown body", () => {
    const context = buildContext(manifest, scene, 4200.7, "mutex");
    const body = discussionBody({ question: "Why one mutex?\nSecond line.", context, deepLink: "https://x.io/?scene=a" }, scene);
    const parsed = parseDiscussionBody(body);
    expect(parsed).toEqual({ ok: true, question: "Why one mutex?\nSecond line.", context });
    expect(context.timestampMs).toBe(4200);
    expect(context.commit).toBe(manifest.source.provider !== "none" ? manifest.source.headSha : undefined);
    expect(body).toContain("Scene: `mutex-baseline` — One lock guards everything");
  });

  it("drops unknown entities from the context", () => {
    expect(buildContext(manifest, scene, 0, "nope").entityId).toBeUndefined();
  });

  it("rejects bodies without a valid context block", () => {
    expect(parseDiscussionBody("hello").ok).toBe(false);
    expect(parseDiscussionBody("```json mutoscope-context\n{bad\n```").ok).toBe(false);
    expect(parseDiscussionBody('```json mutoscope-context\n{"reelId":"X"}\n```').ok).toBe(false);
  });

  it("truncates long titles", () => {
    const t = discussionTitle("x".repeat(200));
    expect(t.startsWith("[Reel] ")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(7 + 90);
  });

  it("builds a prefilled GitHub URL", () => {
    const url = new URL(
      newDiscussionUrl({ adapter: "github-discussions", repository: "o/r", category: "Q", categorySlug: "q-a" }, "T", "B"),
    );
    expect(url.pathname).toBe("/o/r/discussions/new");
    expect(url.searchParams.get("category")).toBe("q-a");
    expect(url.searchParams.get("body")).toBe("B");
  });

  it("marks answers as AI-assisted", () => {
    const body = withAnswerFooter("Because.", "alice");
    expect(isAgentAnswer(body)).toBe(true);
    expect(body).toContain("AI-assisted");
    expect(body).toContain("@alice");
    expect(body.endsWith(ANSWER_MARKER)).toBe(true);
  });
});
