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

- GitHub: `mutoscope ingest pr <url> --reel <dir>` → `source/pr.json` (title, body, files, SHAs), `source/diff.patch`, `source/files.json`; pins `baseSha`/`headSha` and repository visibility into the manifest. It also pins the PR **conversation** (description, comments, reviews, review threads) and **every commit message** as snapshots in `source/web/`, with GitHub's own anchors (`#issuecomment-…`, `#pullrequestreview-…`, `#discussion_r…`).
- Local: `mutoscope ingest git <base> <head> --reel <dir> [--cwd <repo>]` → `source/diff.patch`, `source/files.json`, `source/commits.txt`.
- Read the full files around each hunk at the pinned SHAs, not only the hunks. Always write the revision as `git show "${sha}:${path}"` with braces: in zsh, `$sha:t…` is a path modifier and silently mangles the argument. A blob-less clone is enough: `git clone --filter=blob:none <repo-url>`, then `git fetch origin pull/<n>/head` if the head is not on a branch. Never build or run it.
- The pinned head can be a merge commit ("Merge branch 'main'"); the pinned base is the merge-base, so `base..head` is still exactly the PR's change.
- **The final diff is the truth.** The description is written when the PR opens; review and later commits often change the design. Read the conversation and commit snapshots, and describe what the final code does. When the description and the code disagree, follow the code, and cite the commit or review comment that changed it.
- If ingest reports a *large change*, pick the ≤ 5 units that carry the PR and say in the first scene what is left out. Skip lockfiles, generated and vendored code.
- If ingest flags *sensitive* files, never quote or reference them.

## Analysis

Units are semantic changes: "queue is now lock-free", "retry moved from client to middleware". Motivation comes from the PR description, review threads, commit messages, linked issues or code comments. Cite them as url refs with a verbatim `quote`, for example `{ "kind": "url", "url": "https://github.com/<repo>/pull/<n>#discussion_r123", "quote": "…" }` or a `…/commit/<sha>` URL; validate checks the words. Otherwise mark motivation as inference. Tests that changed are strong evidence of intended behaviour.

## Story arc (3–5 scenes)

1. **Before** — the relevant slice of the system as it was (`revision: "base"` refs). Only the parts the change touches.
2. **The change** — `diff-panel` or `replace`/`move` on the same layout as *Before*, so the viewer sees what moved. A diff panel quotes code: cite the base and head ranges in its `sourceRefs`, copy both sides verbatim, and mark any omitted lines with a line containing only `…` (or `// …`). `validate --repo-root` checks each side against those ranges.
3. **After / behaviour** — walk one request, message or call through the new structure with sequential `connect`s and cues.
4. **Impact & trade-offs** (optional) — risks, performance, API surface; mostly `inference` claims unless benchmarks or tests back them.
5. **Where to review** (optional) — the 2–3 code-blocks a reviewer should read first.

Keep entity ids stable across scenes for the same thing (`order-queue` in every scene) so questions and analysis line up.

## Kicker

`PR #<n> · Walkthrough` (set by ingest).
