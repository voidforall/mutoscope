import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Scene, type ReelBundle } from "../../src/schema";

const EXAMPLE = join(import.meta.dirname, "../../examples/spsc-evolution");
const read = (f: string): unknown => JSON.parse(readFileSync(join(EXAMPLE, f), "utf8"));

/** The raw example reel, exactly as an agent would author it. */
export function exampleRaw(): { manifest: unknown; scenes: unknown[]; analysis: unknown } {
  return {
    manifest: read("manifest.json"),
    scenes: (read("scenes.json") as { scenes: unknown[] }).scenes,
    analysis: read("analysis.json"),
  };
}

export function exampleBundle(): ReelBundle {
  return exampleRaw() as unknown as ReelBundle;
}

/** A minimal scene for focused timeline tests. */
export function scene(overrides: Partial<Record<string, unknown>> = {}): Scene {
  return Scene.parse({
    id: "s",
    title: "S",
    durationMs: 10_000,
    narration: "n",
    entities: [
      { id: "a", type: "component", label: "A", layout: { col: 1, row: 1 } },
      { id: "b", type: "component", label: "B", layout: { col: 5, row: 1 } },
      { id: "ab", type: "edge", from: "a", to: "b" },
    ],
    timeline: [],
    ...overrides,
  });
}
