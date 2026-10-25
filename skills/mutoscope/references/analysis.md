# Analysis: writing `analysis.json`

The analysis is the reel's memory: the storyboard draws from it, the Inspect panel shows it, and question answering reads it. It is recipe-neutral; each recipe lists the `kind` values that fit its sources.

```json
{
  "units": [
    {
      "id": "acquire-release",
      "kind": "mechanism",
      "title": "Acquire/release cursors replace the lock",
      "summary": "2–4 sentences: what it is and why it matters.",
      "claims": [
        { "text": "push stores pushCursor_ with release after constructing the element.", "basis": "evidence",
          "refs": [{ "kind": "code", "path": "Fifo3.hpp", "startLine": 60, "endLine": 61 }] },
        { "text": "This removes lock contention on the hot path.", "basis": "inference" }
      ],
      "entities": ["push-cursor", "slot"],
      "refs": [{ "kind": "code", "path": "Fifo3.hpp", "startLine": 54, "endLine": 77 }],
      "confidence": "high"
    }
  ]
}
```

## Evidence discipline

- `evidence` — directly visible in a cited source: code, tests, the PR description, a doc, an article, a log line. Must carry `refs`; `validate` enforces it. For a pinned web page, include the supporting words as `quote` on the url ref; `validate` checks them against the snapshot.
- `inference` — your reasoning: motivation not stated anywhere, performance effects not measured, intent read between the lines. Say so plainly; the player badges it.
- A PR description is evidence of *what the author says*, not of behaviour. "The PR says X" can be evidence; "X is faster" needs a benchmark ref or is inference.
- `confidence` is about the unit as a whole: `high` when its core claims are evidence, `low` when it rests on inference.

## Shaping units

- A unit is one idea a reviewer would discuss: a behaviour change, a moved responsibility, a new boundary, a risk. Group file-level edits into these ideas — never one unit per file.
- 3–6 units for a typical reel; merge or drop the rest (formatting, renames, generated or vendored files).
- `entities` lists the scene entity ids that depict the unit; the Inspect panel uses it to show the analysis next to the thing the viewer clicked.
- Keep line ranges tight and pinned. Re-check them with `validate --repo-root`.
