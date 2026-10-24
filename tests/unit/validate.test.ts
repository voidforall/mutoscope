import { describe, expect, it } from "vitest";
import { validateBundle } from "../../src/core";
import { exampleRaw } from "./fixtures";

const clone = <T>(v: T): T => structuredClone(v);

describe("validateBundle", () => {
  it("accepts the example reel without warnings", () => {
    const r = validateBundle(exampleRaw());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects dangling timeline targets and edge endpoints", () => {
    const raw = clone(exampleRaw()) as any;
    raw.scenes[0].timeline.push({ action: "appear", atMs: 0, target: "ghost" });
    raw.scenes[0].entities.push({ id: "bad-edge", type: "edge", from: "producer", to: "nowhere" });
    const r = validateBundle(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("'ghost'"), expect.stringContaining("'nowhere'")]),
    );
  });

  it("requires evidence claims to cite refs", () => {
    const raw = clone(exampleRaw()) as any;
    raw.scenes[0].claims.push({ text: "trust me", basis: "evidence", refs: [] });
    expect(validateBundle(raw).ok).toBe(false);
  });

  it("rejects script-bearing URLs in refs", () => {
    const raw = clone(exampleRaw()) as any;
    raw.scenes[0].entities[0].sourceRefs = [{ kind: "url", url: "javascript:alert(1)" }];
    expect(validateBundle(raw).ok).toBe(false);
  });

  it("warns about overlapping visible boxes", () => {
    const raw = clone(exampleRaw()) as any;
    raw.scenes[0].entities.find((e: any) => e.id === "note").layout = { col: 1, row: 5, colSpan: 4, rowSpan: 2 };
    const r = validateBundle(raw);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("overlap"))).toBe(true);
  });

  it("falls back on unknown entry scene with an error", () => {
    const raw = clone(exampleRaw()) as any;
    raw.manifest.entrySceneId = "missing";
    expect(validateBundle(raw).errors[0]?.path).toBe("manifest.entrySceneId");
  });
});
