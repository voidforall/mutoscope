---
name: codebase-tour
description: Onboard someone to a codebase, module or design progression — the main parts, how they talk, and the path a request takes.
inputs: a repository or directory (local checkout), optionally a focus question
ingest: none — read the checkout directly; pin the commit with `git rev-parse HEAD`
kinds: component, flow, mechanism, boundary, convention, performance, history
---

# Recipe: codebase-tour

Give a newcomer the mental model they would otherwise build over a week: the few components that matter, the main flow through them, and the conventions that make the code read the way it does.

## Ingest

- Work from a clean commit. Run `git status --short`; if the files you will cite have uncommitted changes, tell the author and either cite a committed SHA or ask them to commit. Pin `source.headSha` (and `repository` when it is on GitHub) in the manifest — `provider: "github"` for GitHub repos, `"git"` otherwise.
- Read entry points first (main, router, CLI, public API), then follow one representative request or job end to end.
- Read code with `git show <sha>:<path>` so line numbers match the pinned revision.

## Analysis

One unit per component or mechanism a newcomer must know, plus one for the main flow. Name responsibilities in the codebase's own vocabulary (types, module names). Conventions ("all IO goes through `Store`") are evidence only when you can cite where they hold.

## Story arc (4–6 scenes)

1. **The map** — 4–7 components on one stage with their dependencies; tone the ones the tour follows as `accent`.
2. **The main flow** — one request walked through the map with numbered edge labels.
3. **One scene per key mechanism** — zoom (`focus`) into the code that implements it.
4. **Where to start** — a `label` plus 2–3 code-blocks: the files to read first and why.

For a progression (v1 → v2 → v3 of an idea in the repo), use one scene per step, keep the layout constant, and use `replace`/`diff-panel` to show what each step adds.

## Kicker

`Codebase tour · <repo or module>`.
