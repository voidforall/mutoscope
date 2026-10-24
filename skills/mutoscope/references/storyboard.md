# Storyboard: writing `scenes.json`

The player owns all rendering and animation. You place entities on a grid and schedule actions on a timeline; the scene at any instant is a pure function of `(scene, t)`, so seeking, playing and video export always agree.

## Stage and grid

- Stage: 1600 × 900 units (16:9), laid out on a **12-column × 8-row grid**.
- A box is `{ "col": 1-12, "row": 1-8, "colSpan": n, "rowSpan": n }` (spans default to 2 × 1). It must stay inside the grid.
- One row is ~83 units tall: a component needs 1 row (title + sublabel) or 2 rows (more air). Code needs ~1 row per 3 lines (≥ 3 rows for 8–10 lines).
- Visible boxes must not overlap — `validate` warns at every sampled instant. Groups are the exception: they wrap their children automatically and need ~40 units of headroom above the children for their label, so leave the row above a grouped child empty or keep it ≥ 1 row away from other content.
- Edges are straight lines between box borders. Labelled edges need room: `validate` warns when an edge is too short for its label. Prefer aligned boxes (same row → horizontal edge, same column → vertical edge); avoid diagonals crossing other boxes or labels.

## Entities

Every entity has `id` (kebab-case, unique within the scene), optional `explanation` (shown in the Inspect panel — write it for someone who paused here), `sourceRefs`, and `tone`.

| type | required fields | optional | use for |
|---|---|---|---|
| `component` | `label` (≤ 40), `layout` | `sublabel` (≤ 60, monospace) | modules, classes, threads, services, actors |
| `edge` | `from`, `to` (non-edge ids) | `label` (≤ 40), `style` solid/dashed, `arrow` end/both/none | calls, data flow, dependencies, ordering |
| `code-block` | `code` (≤ 24 lines), `layout` | `label`, `language`, `startLine`, `highlightLines` (real line numbers) | the few lines that matter |
| `diff-panel` | `before`, `after` (≤ 24 lines each), `layout` | `label`, `language` | before/after comparison; line diff is computed for you |
| `label` | `text` (≤ 280), `layout` | `size` sm/md/lg/xl, `align` start/center | a takeaway sentence on stage |
| `group` | `children` (component/code/label/diff ids) | `label` (≤ 40) | a boundary: cache line, process, team, layer |

Tones carry meaning — use them consistently across the reel: `neutral` (default), `accent` (the protagonist of this scene), `added` (new / good path), `removed` (old / failing path), `warning` (contention, risk), `muted` (context).

Code snippets are quotes. Copy them from the pinned revision (`git show <sha>:<path>`), keep original line numbers in `startLine`, dedent consistently, and cite the same range in `sourceRefs`. `validate --repo-root` rejects snippets that do not match the file.

## Timeline

`timeline` is a list of actions `{ "atMs": n, "action": …, "target": id, "durationMs"?: n }`:

| action | effect | default ms |
|---|---|---|
| `appear` / `disappear` | fade in / out | 500 / 400 |
| `connect` / `disconnect` | draw / undraw an **edge** | 700 / 400 |
| `highlight` / `dim` / `restore` | emphasise / de-emphasise / back to normal | 400 |
| `move` | slide a boxed entity to `"to": { box }` | 800 |
| `replace` | fade `target` out while `"with": id` fades in at the target's place | 700 |
| `focus` | camera frames `target`; omit `target` to return to the full stage | 900 |

Visibility rule: an entity whose first visibility action is `appear`/`connect` (or that is the `with` of a `replace`) starts hidden; everything else is visible from t = 0. Edges also fade with their endpoints.

## Scenes

```json
{
  "id": "queue-refactor",
  "title": "Replacing the mutex queue",
  "kicker": "The change",
  "durationMs": 16000,
  "narration": "One or two sentences that tell this scene's point.",
  "cues": [{ "atMs": 0, "text": "Caption shown from 0 ms" }, { "atMs": 6000, "text": "Next caption" }],
  "entities": [ … ],
  "timeline": [ … ],
  "claims": [{ "text": "…", "basis": "evidence", "refs": [{ "kind": "code", "path": "src/q.cpp", "startLine": 40, "endLine": 85 }] }]
}
```

- `title` ≤ 80 chars, `kicker` ≤ 30 (a chapter word: *Before*, *The change*, *Impact*).
- Pacing: 12–25 s per scene, 3–6 scenes per reel. Narration ≤ 3 words per second of `durationMs`. One cue per beat; schedule the matching action at the cue's `atMs`.
- Build up, don't dump: bring entities in over the first ~3 s, then spend the scene on the *change* (highlight, connect, replace, focus). End every scene in a state worth pausing on — snapshots and viewers both land there.
- `claims` are what the scene asserts. They render with Evidence / Inference badges, so the viewer can tell verified behaviour from your reasoning.
- `manifest.entrySceneId` must name a scene (usually the first).

## Source refs

`{ "kind": "code", "path": "repo/relative.ts", "startLine": 10, "endLine": 20, "revision": "head" }` — `revision` is `head` (default), `base` (needs `baseSha`) or a SHA. Links resolve to the pinned commit on GitHub. `{ "kind": "url", "url": "https://…", "title": "…" }` for docs and papers (https only).

## Layout patterns that read well

- **Pipeline** — components left→right on one row, edges between neighbours, a code-block or label underneath (rows 5–8).
- **Before → after** — a `diff-panel` across rows 1–6, a centered takeaway `label` on rows 7–8.
- **Hand-off** — two actors on the outer columns, the shared thing in the middle, numbered edge labels (`① …`, `② …`) connected one cue at a time.
- **Boundary** — `group`s around what shares a resource; move or replace members to show the boundary changing.
- **Zoom** — `focus` on a code-block for its key beat, then `focus` with no target to pull back.
