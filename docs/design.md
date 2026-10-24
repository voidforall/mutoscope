# Design notes

mutoscope implements the "PR Walkthrough V0" RFC, generalised: the PR walkthrough is one **recipe** among several, and the artifact is a **reel** that plays interactively and exports to video.

## Layers

| Layer | Where | Depends on |
|---|---|---|
| Reel format (manifest, scenes, analysis, threads) | `src/schema` | zod |
| Engine — timeline, geometry, validation, deep links, discussion codec | `src/core` | schema; pure, browser- and node-safe |
| Player | `src/player` | core, React; built to one IIFE + CSS, inlined per reel |
| CLI + GitHub adapter | `src/cli`, `src/adapters/github` | core; shells out to `git`, `gh`, `ffmpeg`; Playwright optional |
| Skill | `skills/mutoscope` | the CLI only |

The skill never depends on a specific agent: steps reference CLI commands and files, not vendor tools.

## Decisions

- **Deterministic renderer, no animation library.** Scene state is `sceneStateAt(scene, t)`, folding eased timeline actions over initial state. Seeking equals playing, snapshots are exact, and MP4 export is frame capture. (RFC suggested Motion; a pure function removed a dependency and made video export trivial.)
- **Grid layout, not free coordinates.** Agents place boxes on a 12 × 8 grid; the validator samples every 250 ms for overlapping visible boxes and cramped edge labels. This is the main defence against "poor auto-generated diagrams".
- **Evidence is enforced, not suggested.** `evidence` claims must cite refs (schema-level); code refs pin SHAs; `validate --repo-root` checks paths, line ranges and verbatim snippets against the pinned commit.
- **Self-contained HTML with a hash CSP.** The reel works offline and from any host; the page cannot make network requests, so reel content cannot load or exfiltrate anything.
- **Questions via GitHub's own UI.** The player opens a prefilled `discussions/new` URL with a fenced `json mutoscope-context` block — no OAuth app, no token in the page. The CLI parses the block with the same schema.
- **Threads are baked, not fetched.** GitHub's Discussions API needs auth even for public repos, so `sync` snapshots threads into the reel on the author's machine; the player links out for anything newer.
- **Human gates are CLI-level.** `publish` and `reply` are dry runs without `--yes`, so an agent following the skill has to surface the plan/draft before anything is sent.

## Deferred

Narration audio/TTS, embedded live comments, real-time co-viewing, GitLab/Bitbucket adapters, richer primitives (sequence lanes, charts), and a remote agent bridge. The format is versioned so these can be added without breaking existing reels.
