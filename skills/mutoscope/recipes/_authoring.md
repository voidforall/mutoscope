# Writing a recipe

A recipe is one markdown file. Put custom recipes in `.mutoscope/recipes/` (project) or `~/.mutoscope/recipes/` (user); they shadow built-ins of the same name. `mutoscope recipes` lists everything it finds. Files starting with `_` are ignored.

## Frontmatter

```yaml
---
name: release-notes            # kebab-case; used as manifest.recipe
description: One sentence: what the reel explains and for whom.
inputs: What the user provides (URL, refs, files, a topic).
ingest: The command(s) to run, or "none — …" with what to read.
kinds: comma-separated analysis unit kinds that fit this source
---
```

## Body sections

1. **Goal** — one paragraph: what a viewer can do after watching.
2. **Ingest** — how to gather and pin sources; what is untrusted; what must be redacted or skipped.
3. **Analysis** — what a unit is for this source; what counts as evidence.
4. **Story arc** — 3–6 numbered scenes with their purpose and the layout pattern or actions that carry them (see `references/storyboard.md`).
5. **Kicker** — the manifest kicker format.

Keep recipes about *what to explain and in which order*. Everything about the file format, validation and publishing lives in the shared references — link to them instead of restating them.
