import { describe, expect, it } from "vitest";
import {
  buildDeepLink,
  diffLines,
  formatClock,
  locate,
  parseDeepLink,
  refHref,
  refLabel,
  resolveDeepLink,
  toGlobal,
  totalDuration,
} from "../../src/core";
import { Manifest, Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const raw = exampleRaw();
const manifest = Manifest.parse(raw.manifest);
const scenes = raw.scenes.map((s) => Scene.parse(s));

describe("deep links", () => {
  it("restores scene, time and entity", () => {
    const link = parseDeepLink("?scene=happens-before&t=4200&entity=slot");
    expect(resolveDeepLink(scenes, manifest.entrySceneId, link)).toEqual({ index: 2, tMs: 4200, entityId: "slot" });
  });

  it("falls back gracefully on unknown ids", () => {
    expect(resolveDeepLink(scenes, manifest.entrySceneId, parseDeepLink("?scene=nope&t=99&entity=x"))).toEqual({
      index: 0,
      tMs: 0,
      entityId: undefined,
    });
    expect(resolveDeepLink(scenes, manifest.entrySceneId, parseDeepLink("?scene=happens-before&entity=ghost")).entityId).toBeUndefined();
  });

  it("clamps time to the scene and ignores garbage", () => {
    expect(resolveDeepLink(scenes, manifest.entrySceneId, parseDeepLink("?scene=drop-the-lock&t=999999")).tMs).toBe(15000);
    expect(parseDeepLink("?t=abc").tMs).toBeUndefined();
    expect(parseDeepLink("?t=-5").tMs).toBeUndefined();
  });

  it("builds canonical links", () => {
    expect(buildDeepLink("https://a.io/r/?old=1", { sceneId: "s", tMs: 12.9, entityId: "e" })).toBe(
      "https://a.io/r/?scene=s&t=12&entity=e",
    );
  });
});

describe("playlist", () => {
  it("maps global time to scene positions and back", () => {
    const total = totalDuration(scenes);
    expect(locate(scenes, 0)).toEqual({ index: 0, tMs: 0 });
    expect(locate(scenes, 16_000)).toEqual({ index: 1, tMs: 0 });
    expect(locate(scenes, total + 50)).toEqual({ index: scenes.length - 1, tMs: scenes.at(-1)!.durationMs });
    expect(toGlobal(scenes, { index: 2, tMs: 10 })).toBe(16_000 + 15_000 + 10);
    expect(formatClock(83_000)).toBe("01:23");
  });
});

describe("source links", () => {
  it("pins code refs to the head SHA", () => {
    const ref = { kind: "code" as const, path: "src/a b.cpp", startLine: 3, endLine: 9, revision: "head" as const };
    expect(refHref(manifest, ref)).toBe(
      "https://github.com/CharlesFrasch/cppcon2023/blob/043e9cbd8d6f36d82b538a114ded838df1553313/src/a%20b.cpp#L3-L9",
    );
    expect(refLabel(ref)).toBe("src/a b.cpp:3-9");
  });
  it("uses a single-line anchor when start and end match", () => {
    expect(refHref(manifest, { kind: "code", path: "a.h", startLine: 7, endLine: 7, revision: "head" })).toMatch(/a\.h#L7$/);
  });
  it("cannot link base refs without a base SHA", () => {
    expect(refHref(manifest, { kind: "code", path: "a", revision: "base" })).toBeUndefined();
  });
});

describe("diffLines", () => {
  it("marks removed and added lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc");
    expect(d.before.map((l) => l.kind)).toEqual(["same", "removed", "same"]);
    expect(d.after.map((l) => l.kind)).toEqual(["same", "added", "same"]);
  });
});
