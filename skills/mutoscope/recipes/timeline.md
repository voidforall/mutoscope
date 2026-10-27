---
name: timeline
description: Tell how something came to be — a technology, a project, a company, a field — as a history of turning points on a time axis.
inputs: the subject, plus sources (histories, release notes, changelogs, articles, a repo's history)
ingest: mutoscope ingest url <url> --reel <dir> per source; mutoscope ingest image <file-or-url> --reel <dir> for period images
kinds: origin, era, turning-point, actor, cause, consequence, today
---

# Recipe: timeline

The viewer should see the whole arc at a glance, understand the three or four turning points that shaped it and why they happened, and know where things stand today.

## Ingest

- Changelogs on GitHub: pin the raw file at a commit, `https://raw.githubusercontent.com/<org>/<repo>/<sha>/CHANGELOG.md` (a `github.com/…/blob/…` URL is fetched raw automatically, but `master` moves).
- Every date and event comes from a pinned source: `ingest url` for histories, release notes, announcements, Wikipedia-style overviews (check them against primary sources where you can). For a repository's own history, its tags and changelog are primary sources.
- Images from the period (a screenshot of version 1, a photo, a diagram) via `ingest image`, each with a `credit`. Only images the reel may publish.
- Sources disagree about dates more often than you would think; when they do, say so or pick the primary source.

## Analysis

- **origin**: where it started and the problem it answered.
- **era**: a stretch with one character ("hardware terminals", "the browser wars"); these become `spans`.
- **turning-point**: an event after which things went differently, with its **cause** and **consequence**. Causes are often inference: label them.
- **actor**: people or organisations, named only as the sources name them.
- **today**: the current state, dated.

Cite each event `{ "kind": "url", "url": "…#<section>", "quote": "<the sentence with the date>" }`. Interpretations of why history went one way are inference.

## Story arc (4–7 scenes)

1. **Title card** — `headline` naming the arc ("Fifty years of the terminal"), `eyebrow` with the date range, `backdrop: "spotlight"`.
2. **The whole arc** — one `time-axis` with every event and the eras as `spans`. Bring events in on their cues (`appear` with `item`, in the order you listed them) so the line keeps pace with the narration. Tone the turning points `accent`.
3. **Turning points** (1–3 scenes) — each: a `headline` (`size: "lg"`) with the year and what changed, and the evidence: a period `image`, a `quote`, a `stat` ("from 300 to 30,000 users"), or a before/after diagram.
4. **Where it stands** — the `time-axis` again with the latest event highlighted (`highlight` with `item`), and a `list` of open questions.

Use `when` for how dates print ("Q3 2019", "v1.0"), `at` for position (a decimal year, a version number).

## Kicker

`History · <subject>`.
