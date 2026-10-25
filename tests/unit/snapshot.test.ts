import { describe, expect, it } from "vitest";
import { captureTimes } from "../../src/cli/commands/snapshot";
import { scene } from "./fixtures";

describe("snapshot capture times", () => {
  const s = scene({ durationMs: 12_000, cues: [{ atMs: 4000, text: "b" }, { atMs: 0, text: "a" }, { atMs: 9000, text: "c" }] });

  it("captures each caption beat fully played out, just before the next begins", () => {
    expect(captureTimes(s, "beats")).toEqual([
      { name: "beat1", tMs: 3999 },
      { name: "beat2", tMs: 8999 },
      { name: "beat3", tMs: 12_000 },
    ]);
  });

  it("falls back to the last frame without captions, and keeps mid/end/both", () => {
    expect(captureTimes(scene({ durationMs: 12_000 }), "beats")).toEqual([{ name: "end", tMs: 12_000 }]);
    expect(captureTimes(s, "both").map((t) => t.tMs)).toEqual([6000, 12_000]);
  });
});
