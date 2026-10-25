import { describe, expect, it } from "vitest";
import { codeBlockFont, CODE_FONT_MAX, findTextSizeIssues, gridToRect, resolveDeepLink, validateBundle } from "../../src/core";
import { Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const code = (id: string, text: string, layout: object, extra: object = {}) => ({ id, type: "code-block", code: text, layout, ...extra });
const sceneWith = (entities: object[]) => Scene.parse({ id: "s", title: "S", durationMs: 10_000, narration: "n", entities, timeline: [] });

describe("code text sizing", () => {
  it("warns when code shrinks below readable size, and says which span fits", () => {
    const s = sceneWith([code("input", "INPUT_START 'l' INPUT_END", { col: 5, row: 1, colSpan: 3, rowSpan: 2 })]);
    const [issue] = findTextSizeIssues(s, "scenes[0]");
    expect(issue?.message).toMatch(/'input' shrinks to 1\dpx to fit its box; give it colSpan 4, rowSpan 2/);
  });

  it("warns when code blocks in one scene render at different sizes", () => {
    const s = sceneWith([
      code("a", "short", { col: 1, row: 1, colSpan: 4, rowSpan: 3 }),
      code("b", "a considerably longer line of code here", { col: 6, row: 1, colSpan: 4, rowSpan: 3 }),
    ]);
    expect(findTextSizeIssues(s, "p").map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/code renders at different sizes \('a' 20px, 'b' \d+px\)/)]),
    );
  });

  it("fits more text without the line-number gutter", () => {
    const box = gridToRect({ col: 1, row: 1, colSpan: 3, rowSpan: 2 });
    const text = "INPUT_START 'l' INPUT_END";
    expect(codeBlockFont({ code: text, lineNumbers: true }, box)).toBeLessThan(CODE_FONT_MAX);
    expect(codeBlockFont({ code: text, lineNumbers: false }, box)).toBeGreaterThan(codeBlockFont({ code: text, lineNumbers: true }, box));
  });

  it("is quiet when everything renders at full size", () => {
    const s = sceneWith([code("a", "x = 1", { col: 1, row: 1, colSpan: 4, rowSpan: 2 }), code("b", "y = 2", { col: 6, row: 1, colSpan: 4, rowSpan: 2 })]);
    expect(findTextSizeIssues(s, "p")).toEqual([]);
  });
});

describe("entry scene", () => {
  it("is optional and defaults to the first scene", () => {
    const raw = structuredClone(exampleRaw()) as any;
    delete raw.manifest.entrySceneId;
    const r = validateBundle(raw);
    expect(r.ok).toBe(true);
    expect(resolveDeepLink(r.bundle!.scenes, r.bundle!.manifest.entrySceneId, {}).index).toBe(0);
  });

  it("must exist when set", () => {
    const raw = structuredClone(exampleRaw()) as any;
    raw.manifest.entrySceneId = "nope";
    expect(validateBundle(raw).errors.map((e) => e.path)).toContain("manifest.entrySceneId");
  });
});
