import { describe, expect, it } from "vitest";
import { reduce, type PlayerState } from "../../src/player/state";
import { Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const scenes = exampleRaw().scenes.map((s) => Scene.parse(s));
const base: PlayerState = { index: 0, tMs: 0, playing: true, rate: 1 };

describe("player reducer", () => {
  it("advances time while playing and rolls into the next scene", () => {
    const s = reduce(scenes, { ...base, tMs: scenes[0]!.durationMs - 10 }, { type: "tick", dtMs: 20 });
    expect(s).toMatchObject({ index: 1, tMs: 0, playing: true });
  });

  it("applies playback rate", () => {
    expect(reduce(scenes, { ...base, rate: 2 }, { type: "tick", dtMs: 100 }).tMs).toBe(200);
  });

  it("stops at the end and restarts on play", () => {
    const last = scenes.length - 1;
    const end = reduce(scenes, { ...base, index: last, tMs: scenes[last]!.durationMs - 1 }, { type: "tick", dtMs: 50 });
    expect(end).toMatchObject({ playing: false, tMs: scenes[last]!.durationMs });
    expect(reduce(scenes, end, { type: "play" })).toMatchObject({ index: 0, tMs: 0, playing: true });
  });

  it("selecting pauses; deselecting does not resume", () => {
    const selected = reduce(scenes, base, { type: "select", id: "mutex" });
    expect(selected).toMatchObject({ playing: false, selectedId: "mutex" });
    expect(reduce(scenes, selected, { type: "select" })).toMatchObject({ playing: false, selectedId: undefined });
  });

  it("clamps seeks and drops selections that do not exist in the target scene", () => {
    const s = reduce(scenes, { ...base, selectedId: "mutex" }, { type: "seek", index: 99, tMs: -5 });
    expect(s).toMatchObject({ index: scenes.length - 1, tMs: 0, selectedId: undefined });
    const same = reduce(scenes, { ...base, selectedId: "mutex" }, { type: "seek", index: 0, tMs: 999 });
    expect(same.selectedId).toBe("mutex");
  });

  it("ignores ticks while paused", () => {
    const paused = { ...base, playing: false };
    expect(reduce(scenes, paused, { type: "tick", dtMs: 500 })).toBe(paused);
  });
});
