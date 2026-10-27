import { describe, expect, it } from "vitest";
import { partEmphasis, partShown, sceneStateAt, validateBundle } from "../../src/core";
import { Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const list = { id: "l", type: "list", items: [{ text: "a" }, { text: "b" }, { text: "c" }], layout: "left" };
const sceneWith = (entities: object[], timeline: object[]) => Scene.parse({ id: "s", title: "S", durationMs: 20_000, narration: "n", entities, timeline });

describe("parts on cue", () => {
  it("reveals parts one appear-item at a time, each on its own cue", () => {
    const s = sceneWith([list], [
      { action: "appear", atMs: 1000, target: "l", item: 0 },
      { action: "appear", atMs: 5000, target: "l", item: 1 },
      { action: "appear", atMs: 9000, target: "l", item: 2 },
    ]);
    const at = (t: number) => sceneStateAt(s, t).entities.l!;
    expect(at(0)).toMatchObject({ opacity: 0, steps: 0 });
    expect(at(3000)).toMatchObject({ opacity: 1, steps: 1 });
    expect(partShown(at(3000), 1, 3)).toBe(0);
    expect(at(7000).steps).toBe(2);
    expect(partShown(at(7000), 1, 3)).toBe(1);
    expect(partShown(at(7000), 2, 3)).toBe(0);
    expect(at(12000).steps).toBe(3);
  });

  it("highlights one part and softly dims its siblings until restored", () => {
    const s = sceneWith([list], [
      { action: "highlight", atMs: 0, target: "l", item: 1, durationMs: 0 },
      { action: "restore", atMs: 5000, target: "l", durationMs: 0 },
    ]);
    const items = sceneStateAt(s, 1000).entities.l!.items;
    expect(partEmphasis(items, 1)).toEqual({ highlight: 1, dim: 0 });
    expect(partEmphasis(items, 0).dim).toBeGreaterThan(0.4);
    expect(partEmphasis(sceneStateAt(s, 6000).entities.l!.items, 0)).toEqual({ highlight: 0, dim: 0 });
  });

  it("fades a long build in quickly, and builds whatever replaces something", () => {
    const img = (id: string) => ({ id, type: "image", src: "assets/a.png", alt: "x", callouts: [{ x: 0.5, y: 0.5, label: "Here" }], layout: "left" });
    const s = sceneWith([img("one"), img("two"), list], [
      { action: "appear", atMs: 0, target: "l", durationMs: 20_000 },
      { action: "replace", atMs: 1000, target: "one", with: "two", durationMs: 500 },
    ]);
    expect(sceneStateAt(s, 600).entities.l!.opacity).toBe(1);
    expect(sceneStateAt(s, 2000).entities.two).toMatchObject({ opacity: 1, reveal: 1 });
  });

  it("validates item indexes against the target's parts", () => {
    const s = sceneWith([list, { id: "h", type: "headline", text: "x", layout: "heading" }], [
      { action: "appear", atMs: 0, target: "l", item: 3 },
      { action: "highlight", atMs: 0, target: "h", item: 0 },
    ]);
    const r = validateBundle({ ...exampleRaw(), scenes: [s] });
    expect(r.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(["appear item 3: 'l' has 3 items (0–2)", expect.stringMatching(/^highlight item: a headline has no parts/)]),
    );
  });
});
