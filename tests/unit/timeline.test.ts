import { describe, expect, it } from "vitest";
import { FULL_STAGE, captionAt, gridToRect, sceneStateAt } from "../../src/core";
import { scene } from "./fixtures";

describe("sceneStateAt", () => {
  it("shows entities from t=0 when nothing brings them in", () => {
    const s = sceneStateAt(scene(), 0);
    expect(s.entities.a?.opacity).toBe(1);
    expect(s.entities.ab?.draw).toBe(1);
    expect(s.camera).toEqual(FULL_STAGE);
  });

  it("hides entities whose first visibility action is appear", () => {
    const sc = scene({ timeline: [{ action: "appear", atMs: 1000, target: "a", durationMs: 1000 }] });
    expect(sceneStateAt(sc, 0).entities.a?.opacity).toBe(0);
    expect(sceneStateAt(sc, 1500).entities.a?.opacity).toBeCloseTo(0.5);
    expect(sceneStateAt(sc, 5000).entities.a?.opacity).toBe(1);
  });

  it("draws edges progressively on connect", () => {
    const sc = scene({ timeline: [{ action: "connect", atMs: 0, target: "ab", durationMs: 1000 }] });
    expect(sceneStateAt(sc, 0).entities.ab?.draw).toBe(0);
    expect(sceneStateAt(sc, 500).entities.ab?.draw).toBeCloseTo(0.5);
    expect(sceneStateAt(sc, 1000).entities.ab?.draw).toBe(1);
  });

  it("is deterministic: seeking equals playing", () => {
    const sc = scene({
      timeline: [
        { action: "appear", atMs: 0, target: "a" },
        { action: "highlight", atMs: 200, target: "a", durationMs: 800 },
        { action: "move", atMs: 500, target: "b", to: { col: 9, row: 4 } },
        { action: "focus", atMs: 600, target: "b" },
      ],
    });
    const direct = sceneStateAt(sc, 777);
    for (const t of [0, 100, 300, 600, 700]) sceneStateAt(sc, t);
    expect(sceneStateAt(sc, 777)).toEqual(direct);
  });

  it("moves boxes and frames the camera", () => {
    const to = { col: 9, row: 4, colSpan: 2, rowSpan: 1 };
    const sc = scene({
      timeline: [
        { action: "move", atMs: 0, target: "b", to, durationMs: 100 },
        { action: "focus", atMs: 0, target: "b", durationMs: 100 },
      ],
    });
    const end = sceneStateAt(sc, 1000);
    expect(end.entities.b?.box).toEqual(gridToRect(to));
    expect(end.camera.w).toBeLessThan(FULL_STAGE.w);
    expect(end.camera.w / end.camera.h).toBeCloseTo(16 / 9);
  });

  it("replace swaps visibility and takes the outgoing place", () => {
    const sc = scene({
      entities: [
        { id: "a", type: "component", label: "A", layout: { col: 1, row: 1 } },
        { id: "b", type: "component", label: "B", layout: { col: 7, row: 6 } },
      ],
      timeline: [{ action: "replace", atMs: 0, target: "a", with: "b", durationMs: 100 }],
    });
    expect(sceneStateAt(sc, 0).entities.b?.opacity).toBe(0);
    const end = sceneStateAt(sc, 200);
    expect(end.entities.a?.opacity).toBe(0);
    expect(end.entities.b?.opacity).toBe(1);
    expect(end.entities.b?.box).toEqual(gridToRect({ col: 1, row: 1, colSpan: 2, rowSpan: 1 }));
  });

  it("wraps groups around their children", () => {
    const sc = scene({
      entities: [
        { id: "a", type: "component", label: "A", layout: { col: 1, row: 1 } },
        { id: "b", type: "component", label: "B", layout: { col: 5, row: 3 } },
        { id: "g", type: "group", children: ["a", "b"] },
      ],
    });
    const g = sceneStateAt(sc, 0).entities.g?.box;
    const a = gridToRect({ col: 1, row: 1, colSpan: 2, rowSpan: 1 });
    expect(g!.x).toBeLessThan(a.x);
    expect(g!.y).toBeLessThan(a.y);
  });
});

describe("captionAt", () => {
  it("falls back to narration without cues", () => {
    expect(captionAt(scene(), 0)).toBe("n");
  });
  it("shows the latest started cue", () => {
    const sc = scene({ cues: [{ atMs: 0, text: "one" }, { atMs: 3000, text: "two" }] });
    expect(captionAt(sc, 2999)).toBe("one");
    expect(captionAt(sc, 3000)).toBe("two");
  });
});
