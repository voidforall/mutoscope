import { describe, expect, it } from "vitest";
import { findEdgeCrossings, segmentHitsRect } from "../../src/core";
import { Scene } from "../../src/schema";

const sceneWith = (entities: object[], timeline: object[] = []) =>
  Scene.parse({ id: "s", title: "S", durationMs: 4000, narration: "n", entities, timeline });

describe("segmentHitsRect", () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };
  it("detects crossings, including diagonal ones, and misses", () => {
    expect(segmentHitsRect({ x: 0, y: 20 }, { x: 40, y: 20 }, r)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 40, y: 40 }, r)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 40, y: 5 }, r)).toBe(false);
    expect(segmentHitsRect({ x: 0, y: 20 }, { x: 8, y: 20 }, r)).toBe(false);
  });
});

describe("findEdgeCrossings", () => {
  it("flags an edge that runs through a box it does not connect", () => {
    const s = sceneWith([
      { id: "a", type: "component", label: "A", layout: { col: 1, row: 3 } },
      { id: "mid", type: "component", label: "Mid", layout: { col: 5, row: 3 } },
      { id: "b", type: "component", label: "B", layout: { col: 9, row: 3 } },
      { id: "ab", type: "edge", from: "a", to: "b" },
    ]);
    expect(findEdgeCrossings(s)).toEqual([{ edge: "ab", crosses: "mid", what: "box" }]);
  });

  it("flags an edge running over a group's label, but not one entering the group from the side", () => {
    const s = sceneWith([
      { id: "child", type: "component", label: "Child", layout: { col: 1, row: 4, colSpan: 2 } },
      { id: "g", type: "group", label: "QUEUE::INNER (ARC-SHARED)", children: ["child"] },
      { id: "above", type: "component", label: "Above", layout: { col: 1, row: 1 } },
      { id: "beside", type: "component", label: "Beside", layout: { col: 6, row: 4 } },
      { id: "down", type: "edge", from: "above", to: "child" },
      { id: "side", type: "edge", from: "beside", to: "child" },
    ]);
    expect(findEdgeCrossings(s)).toEqual([{ edge: "down", crosses: "g", what: "label" }]);
  });

  it("ignores edges and boxes that are not visible at the same time", () => {
    const s = sceneWith(
      [
        { id: "a", type: "component", label: "A", layout: { col: 1, row: 3 } },
        { id: "mid", type: "component", label: "Mid", layout: { col: 5, row: 3 } },
        { id: "b", type: "component", label: "B", layout: { col: 9, row: 3 } },
        { id: "ab", type: "edge", from: "a", to: "b" },
      ],
      [{ atMs: 0, action: "disappear", target: "mid", durationMs: 0 }, { atMs: 1000, action: "connect", target: "ab" }],
    );
    expect(findEdgeCrossings(s)).toEqual([]);
  });
});
