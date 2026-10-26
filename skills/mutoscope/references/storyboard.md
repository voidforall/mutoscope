# Storyboard: writing `scenes.json`

The player owns all rendering and animation. You place entities on a grid and schedule actions on a timeline; the scene at any instant is a pure function of `(scene, t)`, so seeking, playing and video export always agree.

The file is one object with a `scenes` array, in playing order. The reel opens on the first scene unless `manifest.entrySceneId` names another one:

```json
{ "scenes": [ { "id": "intro", … }, { "id": "the-change", … } ] }
```

## Stage and grid

- Stage: 1600 × 900 units (16:9), laid out on a **12-column × 8-row grid**.
- A box is `{ "col": 1-12, "row": 1-8, "colSpan": n, "rowSpan": n }` (spans default to 2 × 1). It must stay inside the grid.
- Or name a region instead of a box: `"layout": "left"`. Regions: `full`, `center` (8 × 6, centred), `heading` (rows 1–2), `body` (rows 3–6), `footer` (rows 7–8), `top` / `bottom` (half height), `left` / `right` (half width), `left-third` / `middle-third` / `right-third`, `left-two-thirds` / `right-two-thirds`, and the quarters `top-left`, `top-right`, `bottom-left`, `bottom-right`. Neighbouring regions never overlap. `move` accepts them too (`"to": "right"`).
- One row is ~83 units tall: a component needs 1 row (title + sublabel) or 2 rows (more air).
- Code and diff text shrinks to fit its box, and `validate` warns when it drops below readable size or when blocks in one scene end up at different sizes (it suggests the span that fits). At full size a code block holds:

  | colSpan | 3 | 4 | 5 | 6 | 8 | 10 | 12 |
  |---|---|---|---|---|---|---|---|
  | characters per line | 16 | 26 | 36 | 47 | 67 | 88 | 109 |
  | without line numbers | 21 | 31 | 42 | 52 | 73 | 93 | 114 |

  | rowSpan | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|
  | lines | 4 | 7 | 10 | 14 | 17 |

  A `diff-panel` shows before and after side by side, so each side gets half the width: at colSpan 12 about 48 characters per side (with its +/− gutter), at 8 about 27, at 6 about 17. Lines are budgeted as for code, minus one row of tags.

- A `quote` sizes its text to the box. Give it about 1 column per 12 characters at 2 rows (for example, 6 × 2 for a 70-character line); `validate` warns when it would shrink too small.
- Visible boxes must not overlap — `validate` warns at every sampled instant. A group's frame wraps its **visible** children as they are right now (a child that moves stretches the frame; hidden or replaced children don't count), plus ~40 units above for its label and ~22 around, and that frame must not overlap other boxes either: leave the row above a grouped child empty and keep other content ≥ 1 row away. Edges must not run through other boxes or over a group's label; `validate` warns about both.
- Edges are straight lines aimed from one box's **centre** to the other's, clipped at their borders. So two boxes on the same row only get a horizontal edge when they also have the same `row` *and* `rowSpan` (likewise `col`/`colSpan` for vertical edges). Labelled edges need room: `validate` warns when an edge is too short for its label. Avoid diagonals crossing other boxes or labels.

## Entities

Every entity has `id` (kebab-case, unique within the scene), optional `explanation` (shown in the Inspect panel — write it for someone who paused here), `sourceRefs`, and `tone`. Text on stage is plain: no Markdown (backticks or `**` show literally; `validate` warns).

| type | required fields | optional | use for |
|---|---|---|---|
| `component` | `label` (≤ 40), `layout` | `sublabel` (≤ 60, monospace) | modules, classes, threads, services, actors |
| `edge` | `from`, `to` (non-edge ids) | `label` (≤ 40), `style` solid/dashed, `arrow` end/both/none | calls, data flow, dependencies, ordering |
| `code-block` | `code` (≤ 24 lines), `layout` | `label`, `language`, `startLine`, `highlightLines` (real line numbers), `lineNumbers` (default `true`) | the few lines that matter; with `lineNumbers: false`, any verbatim monospace text (a wire format, a log, a transcript) |
| `diff-panel` | `before`, `after` (≤ 24 lines each), `layout` | `label`, `language` | before/after comparison; line diff is computed for you |
| `label` | `text` (≤ 280), `layout` | `size` sm/md/lg/xl, `align` start/center | a takeaway sentence on stage |
| `quote` | `text` (≤ 400, verbatim), `layout` | `attribution` (≤ 80) | the line from a source that carries the point; checked against pinned pages via its `url` sourceRef |
| `group` | `children` (component/code/label/diff/quote ids) | `label` (≤ 40) | a boundary: cache line, process, team, layer |

### Beyond boxes and arrows

Not every scene is a diagram. Choose the form that carries the point: a sentence that should land gets a `headline`, a number that matters gets a `stat`, a trend gets a `chart`, a sequence of dates gets a `time-axis`, a real screen or figure gets an `image`, a comparison of a few attributes gets a `table`.

| type | required fields | optional | use for |
|---|---|---|---|
| `headline` | `text` (≤ 160), `layout` | `eyebrow` (≤ 40, small caps line above), `size` lg/xl/display (max 48/72/112 px; shrinks to fit), `align` center/start, `reveal` fade/words/typewriter | title cards, chapter breaks, the thesis, a closing line |
| `stat` | `value` (number), `label` (≤ 80), `layout` | `prefix` (≤ 4, "$"), `suffix` (≤ 10, "%", "×", " ms"), `decimals`, `from` (count-up start, default 0), `note` (≤ 60, "down from 2.1 s"), `countUp` (default true) | one figure per stat; three side by side make a scoreboard |
| `chart` | `kind` bar/column/line/area, `categories` (≤ 16, ≤ 24 chars), `series` (1–4 × `{ name, values, tone? }`), `layout` | `title`, `unit` ("k", "%", " ms"), `min`/`max` (axis; default 0 to a rounded max), `highlight` (categories to emphasise; the rest mute), `valueLabels` (default true) | `column` for a few periods, `bar` for long category names or rankings, `line`/`area` for trends; at most ~8 categories reads well |
| `time-axis` | `events` (1–12 × `{ at, label ≤ 40, when?, detail? ≤ 60, tone? }`), `layout` | `title`, `spans` (≤ 6 eras `{ from, to, label, tone? }`), `min`/`max` | history, how something evolved, an incident timeline; `at` is any increasing number (a year, a day, a version) and `when` is how it is printed |
| `image` | `src` (`assets/…` png/jpg/webp/gif/svg), `alt` (≤ 200), `layout` | `fit` contain/cover, `caption` (≤ 140), `credit` (≤ 80), `callouts` (≤ 6 × `{ x, y, label, w?, h? }`, fractions of the image) | screenshots, figures from a paper, photos, product tours |
| `table` | `columns` (≤ 6), `rows` (≤ 10, each cell ≤ 40 chars), `layout` | `title`, `highlightRows` (0-based), `align` (per column start/center/end) | a few options against a few attributes; numbers align `end` |
| `list` | `items` (1–8 × `{ text ≤ 100, detail? ≤ 120, mark?, tone? }`), `layout` | `title`, `style` bullets/numbered/checks; per item `mark` check/cross/dot/none | steps, key points, prerequisites, pros (`check`) and cons (`cross`), open questions |

Images live in the reel's `assets/` folder (≤ 5 MB each, 20 MB in all) and are embedded into the page, so nothing loads from the network. Put only images you may publish there: screenshots you took, figures with a `credit`, or files the user gave you. Never hotlink or invent one. `mutoscope ingest image <file-or-url> --reel <dir>` copies one in (metadata such as GPS location removed) and remembers a download's origin; `validate` then asks for its `credit`. A callout `{ "x": 0.7, "y": 0.2, "label": "Search" }` points at a spot; add `w`/`h` to outline a region. With `fit: "cover"` the picture is cropped, and `validate` warns when that hides a callout.

**Builds.** Entities with parts build them in during their `appear`: `headline`/`label` with `reveal: "words"` or `"typewriter"`, a `stat` counting up, chart bars growing one after another and lines drawing left to right, time-axis events arriving as the line sweeps past, table rows sliding in, image callouts one by one. Without `durationMs` an appear lasts as long as the content needs (about 0.2 s a word, 1.6 s for a stat, 1.2 s + 0.15 s a bar). Set `durationMs` to pace it against the narration. `validate` warns when a build is still running at the scene's end.

**Numbers from data.** A `chart` or `stat` can name where its numbers come from, and `validate` recomputes them from a dataset pinned with `mutoscope ingest data`:

```json
{ "type": "chart", "kind": "column", "categories": ["2023", "2024"],
  "series": [{ "name": "Users (k)", "values": [4.6, 5.6], "column": "users" }],
  "data": { "file": "users.csv", "category": "year", "aggregate": "sum", "where": { "plan": "paid" }, "scale": 0.001 } }
{ "type": "stat", "value": 1500, "label": "EU users in 2024",
  "data": { "file": "users.csv", "column": "users", "where": { "year": "2024", "region": "EU" } } }
```

`category` is the column whose values are the chart's `categories`; each series names its `column`. Rows that share a category combine by `aggregate` (`none` requires exactly one row; `sum`, `mean`, `min`, `max`, `count`). `where` keeps rows whose columns equal the given strings; `scale` multiplies the data before comparing. Shown values may be rounded, but must round to what the data gives. Once a reel pins a dataset, `validate` warns about charts and stats that are not bound.

**Backdrop.** A scene's `backdrop` is `dots` (default), `plain`, `grid` (graph paper, good behind charts) or `spotlight` (a soft glow, good for title cards).

`validate` warns when a headline shrinks below 28 px, a stat's number below 44 px, a chart cuts a category label or crowds its bars, time-axis labels collide, or a table runs out of room, and each warning says what to change.

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
| `replace` | fade `target` out while `"with": id` fades in **at the target's current box** (its own `layout` is ignored from then on); edges attached to `target` carry over to `with`. If `with` belongs to a different group, that group's frame jumps to the new place: use `disappear` + `appear` (or `move`) to change groups | 700 |
| `focus` | camera frames `target`; omit `target` to return to the full stage | 900 |

Visibility rule: an entity whose first visibility action is `appear`/`connect` (or that is the `with` of a `replace`) starts hidden; everything else is visible from t = 0. Edges also fade with their endpoints, and a group with no `appear`/`disappear` of its own is visible exactly while any of its children is.

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
- Pacing: 12–25 s per scene. The recipe's story arc sets how many scenes (usually 3–7). Narration ≤ 3 words per second of `durationMs`. One cue per beat; schedule the matching action at the cue's `atMs`.
- Build up, don't dump: bring entities in over the first ~3 s, then spend the scene on the *change* (highlight, connect, replace, focus). End every scene in a state worth pausing on — snapshots and viewers both land there.
- `claims` are what the scene asserts. They render with Evidence / Inference badges, so the viewer can tell verified behaviour from your reasoning.
- Put scenes in playing order; leave `manifest.entrySceneId` unset unless the reel should open somewhere other than the first scene.

## Source refs

`{ "kind": "code", "path": "repo/relative.ts", "startLine": 10, "endLine": 20, "revision": "head" }` — `revision` is `head` (default), `base` (needs `baseSha`) or a SHA. Links resolve to the pinned commit on GitHub. `{ "kind": "url", "url": "https://…#section", "title": "…", "quote": "verbatim words" }` for web pages (https only). `{ "kind": "data", "file": "users.csv", "columns": ["users"], "note": "sum per year" }` for a pinned dataset (shown with a link to where it was downloaded from). Pin pages with `mutoscope ingest url`. `validate` then checks that the `#section` anchor exists and that `quote` appears word for word in the snapshot ("…" joins separate passages). Evidence claims citing a pinned page should carry a quote.

## Layout patterns that read well

- **Pipeline** — components left→right on one row, edges between neighbours, a code-block or label underneath (rows 5–8).
- **Before → after** — a `diff-panel` across rows 1–6, a centered takeaway `label` on rows 7–8.
- **Hand-off** — two actors on the outer columns, the shared thing in the middle, numbered edge labels (`① …`, `② …`) connected one cue at a time.
- **Boundary** — `group`s around what shares a resource; move or replace members to show the boundary changing.
- **Zoom** — `focus` on a code-block for its key beat, then `focus` with no target to pull back.
- **Title card** — `backdrop: "spotlight"`, one `headline` (`size: "display"`, `reveal: "words"`, an `eyebrow`) in `center`, one quiet `label` below. Use it to open the reel and to break chapters.
- **Scoreboard** — a `headline` in `heading`, then two to four `stat`s side by side in rows 3–6 (`left-third`/`middle-third`/`right-third` boxes trimmed to rows 3–6), each appearing on its cue.
- **Chart + takeaway** — a `chart` in `top` or rows 1–6, a `label` in `footer` that says what the chart means; `highlight` the category the label is about.
- **Split screen** — an `image` or `chart` in `left-two-thirds`, a `table` or `label`s in `right-third`.
- **Timeline** — a `headline` in `heading`, a `time-axis` in rows 3–8; `spans` for eras; tone the event the scene is about `accent`.

Vary the forms across a reel: a reel that is all boxes and arrows, or all charts, is harder to watch than one that alternates.
