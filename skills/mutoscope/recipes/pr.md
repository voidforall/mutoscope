---
name: pr
description: Walk reviewers through a pull request or local change — what changed, why, and how behaviour differs before and after.
inputs: GitHub PR URL or number, or two local git refs (base head)
ingest: mutoscope ingest pr <url> --reel <dir>  |  mutoscope ingest git <base> <head> --reel <dir>
kinds: architecture, behavior, refactor, performance, api, bugfix, test, other
---

# Recipe: pr

Explain the *logical* change, not the diff. A reviewer who watches the reel should be able to say what moved, what now behaves differently, and where to look first.

## Ingest

- GitHub: `mutoscope ingest pr <url> --reel <dir>` → `source/pr.json` (title, body, files, SHAs), `source/diff.patch`, `source/files.json`; pins `baseSha`/`headSha` and repository visibility into the manifest.
- Local: `mutoscope ingest git <base> <head> --reel <dir> [--cwd <repo>]` → `source/diff.patch`, `source/files.json`, `source/commits.txt`.
- Read the full files around each hunk at the pinned SHAs (`git show <sha>:<path>`), not only the hunks. Fetch the PR head if it is not local: `git fetch origin pull/<n>/head`.
- If ingest reports a *large change*, pick the ≤ 5 units that carry the PR and say in the first scene what is left out. Skip lockfiles, generated and vendored code.
- If ingest flags *sensitive* files, never quote or reference them.

## Analysis

Units are semantic changes: "queue is now lock-free", "retry moved from client to middleware". Motivation comes from the PR description, linked issues, commit messages or code comments — cite them; otherwise mark motivation as inference. Tests that changed are strong evidence of intended behaviour.

## Story arc (3–5 scenes)

1. **Before** — the relevant slice of the system as it was (`revision: "base"` refs). Only the parts the change touches.
2. **The change** — `diff-panel` or `replace`/`move` on the same layout as *Before*, so the viewer sees what moved.
3. **After / behaviour** — walk one request, message or call through the new structure with sequential `connect`s and cues.
4. **Impact & trade-offs** (optional) — risks, performance, API surface; mostly `inference` claims unless benchmarks or tests back them.
5. **Where to review** (optional) — the 2–3 code-blocks a reviewer should read first.

Keep entity ids stable across scenes for the same thing (`order-queue` in every scene) so questions and analysis line up.

## Kicker

`PR #<n> · Walkthrough` (set by ingest).
