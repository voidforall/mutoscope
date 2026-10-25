import type { z } from "zod";
import { ReelBundle, type Entity, type Manifest, type Scene, type SourceRef } from "../schema";
import { edgeLabelFits, edgeSegment, gridToRect, padRect, rectsOverlap, segmentHitsRect, type Rect } from "./geometry";
import { CODE_FONT_READABLE, QUOTE_FONT_READABLE, quoteFont, spanForFullSize, textFont, type TextEntity } from "./text-fit";
import { edgeEnds, sceneStateAt } from "./timeline";

export interface Issue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly Issue[];
  readonly warnings: readonly Issue[];
  readonly bundle?: ReelBundle;
}

const READING_WORDS_PER_SECOND = 3;
const OVERLAP_SAMPLE_MS = 250;

function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message }));
}

function duplicates(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function checkRefs(refs: readonly SourceRef[], manifest: Manifest, path: string): Issue[] {
  const hasBase = manifest.source.provider !== "none" && manifest.source.baseSha !== undefined;
  return refs.flatMap((r, i) =>
    r.kind === "code" && r.revision === "base" && !hasBase
      ? [{ path: `${path}[${i}]`, message: "revision 'base' needs manifest.source.baseSha" }]
      : r.kind === "code" && manifest.source.provider === "none"
        ? [{ path: `${path}[${i}]`, message: "code ref in a reel with no pinned source revision" }]
        : [],
  );
}

function checkEntities(scene: Scene, p: string): Issue[] {
  const byId = new Map(scene.entities.map((e) => [e.id, e]));
  const issues: Issue[] = duplicates(scene.entities.map((e) => e.id)).map((id) => ({
    path: `${p}.entities`,
    message: `duplicate entity id '${id}'`,
  }));
  scene.entities.forEach((e, i) => {
    const ep = `${p}.entities[${i}]`;
    if (e.type === "edge") {
      for (const end of [e.from, e.to]) {
        const target = byId.get(end);
        if (!target) issues.push({ path: ep, message: `edge endpoint '${end}' does not exist` });
        else if (target.type === "edge") issues.push({ path: ep, message: `edge endpoint '${end}' is an edge` });
      }
    }
    if (e.type === "group") {
      for (const child of e.children) {
        const target = byId.get(child);
        if (!target || child === e.id || target.type === "edge" || target.type === "group") {
          issues.push({ path: ep, message: `group child '${child}' must be an existing non-edge, non-group entity` });
        }
      }
    }
    if (e.type === "code-block") {
      const last = e.startLine + e.code.split("\n").length - 1;
      const bad = e.highlightLines.filter((n) => n < e.startLine || n > last);
      if (bad.length) issues.push({ path: ep, message: `highlightLines ${bad.join(",")} outside ${e.startLine}-${last}` });
    }
  });
  return issues;
}

const BOXED: ReadonlySet<Entity["type"]> = new Set(["component", "code-block", "label", "diff-panel", "quote"]);

function checkTimeline(scene: Scene, p: string): Issue[] {
  const byId = new Map(scene.entities.map((e) => [e.id, e]));
  return scene.timeline.flatMap((a, i): Issue[] => {
    const ap = `${p}.timeline[${i}]`;
    const issues: Issue[] = [];
    if (a.atMs > scene.durationMs) issues.push({ path: ap, message: `atMs ${a.atMs} is past the scene end` });
    const target = a.target === undefined ? undefined : byId.get(a.target);
    if (a.target !== undefined && !target) issues.push({ path: ap, message: `target '${a.target}' does not exist` });
    if (target && (a.action === "connect" || a.action === "disconnect") && target.type !== "edge") {
      issues.push({ path: ap, message: `${a.action} targets edges; '${a.target}' is a ${target.type}` });
    }
    if (target && a.action === "move" && !BOXED.has(target.type)) {
      issues.push({ path: ap, message: `cannot move a ${target.type}` });
    }
    if (a.action === "replace") {
      const incoming = byId.get(a.with);
      if (!incoming || a.with === a.target) issues.push({ path: ap, message: `replace.with '${a.with}' is invalid` });
    }
    return issues;
  });
}

function checkPacing(scene: Scene, p: string): Issue[] {
  const issues: Issue[] = [];
  const words = scene.narration.split(/\s+/).filter(Boolean).length;
  if (words / (scene.durationMs / 1000) > READING_WORDS_PER_SECOND) {
    issues.push({ path: `${p}.narration`, message: `${words} words in ${scene.durationMs}ms is too fast to read` });
  }
  scene.cues.forEach((c, i) => {
    if (c.atMs > scene.durationMs) issues.push({ path: `${p}.cues[${i}]`, message: "cue starts after the scene ends" });
  });
  return issues;
}

/** Visible boxes colliding at any sampled instant — the usual cause of an unreadable scene. */
export function findOverlaps(scene: Scene): Array<[string, string]> {
  const replacePairs = new Set(
    scene.timeline.flatMap((a) => (a.action === "replace" ? [`${a.target}|${a.with}`, `${a.with}|${a.target}`] : [])),
  );
  // Group frames extend past their children (label above, padding around), so they can collide too.
  const boxed = scene.entities.filter((e) => BOXED.has(e.type) || e.type === "group");
  const members = new Set(scene.entities.flatMap((e) => (e.type === "group" ? e.children.map((c) => `${e.id}|${c}`) : [])));
  const related = (a: string, b: string) => members.has(`${a}|${b}`) || members.has(`${b}|${a}`);
  const found = new Set<string>();
  for (let t = 0; t <= scene.durationMs; t += OVERLAP_SAMPLE_MS) {
    const { entities } = sceneStateAt(scene, t);
    for (let i = 0; i < boxed.length; i++) {
      for (let j = i + 1; j < boxed.length; j++) {
        const a = entities[boxed[i]!.id];
        const b = entities[boxed[j]!.id];
        const key = `${boxed[i]!.id}|${boxed[j]!.id}`;
        if (!a?.box || !b?.box || a.opacity < 0.5 || b.opacity < 0.5 || replacePairs.has(key) || related(boxed[i]!.id, boxed[j]!.id)) continue;
        if (rectsOverlap(a.box, b.box)) found.add(key);
      }
    }
  }
  return [...found].map((k) => k.split("|") as [string, string]);
}

/** Where a group draws its label (see Group.tsx): 16px uppercase mono from (x + 18, y + 26). */
function groupLabelRect(box: Rect, label: string): Rect {
  return { x: box.x + 14, y: box.y + 6, w: label.length * 10.3 + 8, h: 26 };
}

/** Lines are drawn this far inside their endpoint boxes' borders; ignore grazing contact. */
const CROSSING_INSET = 6;

export interface EdgeCrossing {
  readonly edge: string;
  readonly crosses: string;
  readonly what: "box" | "label";
}

/** Edges drawn through boxes they don't connect, or over a group's label, while both are visible. */
export function findEdgeCrossings(scene: Scene): EdgeCrossing[] {
  const edges = scene.entities.filter((e) => e.type === "edge");
  const others = scene.entities.filter((e) => BOXED.has(e.type) || e.type === "group");
  const found = new Map<string, EdgeCrossing>();
  for (let t = 0; t <= scene.durationMs; t += OVERLAP_SAMPLE_MS) {
    const { entities } = sceneStateAt(scene, t);
    for (const e of edges) {
      const state = entities[e.id];
      const { from, to } = edgeEnds(scene, entities, e.id);
      if (!state || !from?.box || !to?.box || state.draw < 0.95 || state.opacity * Math.min(from.opacity, to.opacity) < 0.5) continue;
      const { a, b } = edgeSegment(from.box, to.box, 8);
      for (const o of others) {
        const os = entities[o.id];
        if (!os?.box || os.opacity < 0.5 || os === from || os === to) continue;
        const hit =
          o.type === "group"
            ? o.label !== undefined && segmentHitsRect(a, b, groupLabelRect(os.box, o.label)) && { what: "label" as const }
            : segmentHitsRect(a, b, padRect(os.box, -CROSSING_INSET)) && { what: "box" as const };
        if (hit) found.set(`${e.id}|${o.id}`, { edge: e.id, crosses: o.id, what: hit.what });
      }
    }
  }
  return [...found.values()];
}

/** Labelled edges too short (in the final frame) to show their label. */
export function findCrampedEdges(scene: Scene): string[] {
  const { entities } = sceneStateAt(scene, scene.durationMs);
  return scene.entities.flatMap((e) => {
    if (e.type !== "edge" || !e.label) return [];
    const ends = edgeEnds(scene, entities, e.id);
    const from = ends.from?.box;
    const to = ends.to?.box;
    if (!from || !to) return [];
    const { a, b } = edgeSegment(from, to, 8);
    return edgeLabelFits(e.label, Math.hypot(b.x - a.x, b.y - a.y)) ? [] : [e.id];
  });
}

const fmtPx = (n: number) => `${Math.round(n)}px`;
const MAX_FONT_SPREAD = 2;

/** Code that shrinks to fit reads small, and blocks at different sizes look like a mistake. */
export function findTextSizeIssues(scene: Scene, p: string): Issue[] {
  const texts = scene.entities.filter((e): e is TextEntity => e.type === "code-block" || e.type === "diff-panel");
  const sized = texts.map((e) => ({ e, font: textFont(e, gridToRect(e.layout)) }));
  const issues: Issue[] = sized
    .filter(({ font }) => font < CODE_FONT_READABLE)
    .map(({ e, font }) => {
      const span = spanForFullSize(e);
      const fix = span ? `give it colSpan ${span.colSpan}, rowSpan ${span.rowSpan}` : "shorten its lines or split it";
      return { path: `${p}.entities`, message: `text in '${e.id}' shrinks to ${fmtPx(font)} to fit its box; ${fix}` };
    });
  for (const e of scene.entities) {
    if (e.type !== "quote") continue;
    const font = quoteFont(e.text, Boolean(e.attribution), gridToRect(e.layout));
    if (font < QUOTE_FONT_READABLE) {
      issues.push({ path: `${p}.entities`, message: `quote '${e.id}' shrinks to ${fmtPx(font)} to fit its box; give it more room or quote less` });
    }
  }
  if (sized.length > 1) {
    const fonts = sized.map((s) => s.font);
    if (Math.max(...fonts) - Math.min(...fonts) > MAX_FONT_SPREAD) {
      const list = sized.map(({ e, font }) => `'${e.id}' ${fmtPx(font)}`).join(", ");
      issues.push({ path: `${p}.entities`, message: `code renders at different sizes (${list}); widen the smaller ones or shorten their lines` });
    }
  }
  return issues;
}

const MARKDOWN = /`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/;

/** Stage text is plain: backticks, bold markers and links would show literally. */
export function findMarkdownInStageText(scene: Scene, p: string): Issue[] {
  return scene.entities.flatMap((e) => {
    const texts = [e.type === "label" || e.type === "quote" ? e.text : undefined, "label" in e ? e.label : undefined, "sublabel" in e ? e.sublabel : undefined];
    return texts.some((t) => t && MARKDOWN.test(t))
      ? [{ path: `${p}.entities`, message: `'${e.id}' has Markdown in its text (backticks, ** or links); stage text is shown as-is, so write it plain` }]
      : [];
  });
}

function checkScene(scene: Scene, index: number, manifest: Manifest): { errors: Issue[]; warnings: Issue[] } {
  const p = `scenes[${index}]`;
  const errors = [...checkEntities(scene, p), ...checkTimeline(scene, p)];
  const refIssues = [
    ...scene.entities.flatMap((e, i) => checkRefs(e.sourceRefs, manifest, `${p}.entities[${i}].sourceRefs`)),
    ...scene.claims.flatMap((c, i) => checkRefs(c.refs, manifest, `${p}.claims[${i}].refs`)),
  ];
  const warnings = [
    ...checkPacing(scene, p),
    ...(errors.length === 0
      ? findOverlaps(scene).map(([a, b]) => ({ path: `${p}.entities`, message: `'${a}' and '${b}' overlap while visible` }))
      : []),
    ...(errors.length === 0
      ? findCrampedEdges(scene).map((id) => ({ path: `${p}.entities`, message: `edge '${id}' is too short to show its label; move its ends apart` }))
      : []),
    ...findTextSizeIssues(scene, p),
    ...(errors.length === 0
      ? findEdgeCrossings(scene).map((c) => ({
          path: `${p}.entities`,
          message: c.what === "label" ? `edge '${c.edge}' runs over the label of group '${c.crosses}'; route it into the group from the side or below` : `edge '${c.edge}' runs through '${c.crosses}'; move one of them so the line goes around it`,
        }))
      : []),
    ...findMarkdownInStageText(scene, p),
    ...scene.entities
      .filter((e) => e.type === "component" && !e.explanation && e.sourceRefs.length === 0)
      .map((e) => ({ path: `${p}.entities`, message: `component '${e.id}' has no explanation or refs to inspect` })),
  ];
  return { errors: [...errors, ...refIssues], warnings };
}

/** Schema + cross-reference validation of a whole reel. */
export function validateBundle(input: unknown): ValidationResult {
  const parsed = ReelBundle.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodIssues(parsed.error), warnings: [] };
  const bundle = parsed.data;
  const { manifest, scenes } = bundle;
  const errors: Issue[] = duplicates(scenes.map((s) => s.id)).map((id) => ({
    path: "scenes",
    message: `duplicate scene id '${id}'`,
  }));
  if (manifest.entrySceneId !== undefined && !scenes.some((s) => s.id === manifest.entrySceneId)) {
    errors.push({ path: "manifest.entrySceneId", message: `scene '${manifest.entrySceneId}' does not exist` });
  }
  const warnings: Issue[] = [];
  if (manifest.collaboration && !manifest.publicUrl) {
    warnings.push({ path: "manifest.publicUrl", message: "questions will not carry a deep link until publicUrl is set" });
  }
  scenes.forEach((s, i) => {
    const r = checkScene(s, i, manifest);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });
  return errors.length ? { ok: false, errors, warnings } : { ok: true, errors, warnings, bundle };
}
