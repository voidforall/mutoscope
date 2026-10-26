---
name: concept
description: Explain an idea — an algorithm, protocol, data structure, paper or design pattern — as an animated, inspectable explainer.
inputs: a topic or question, optionally documents, papers, URLs or code that ground it
ingest: mutoscope ingest url <url> --reel <dir> for each web source; code is pinned like a codebase tour
kinds: definition, mechanism, invariant, example, tradeoff, failure-mode, comparison
---

# Recipe: concept

Teach one idea well. The viewer should be able to restate the mechanism and predict what happens in a case the reel did not show.

## Ingest

- Use the sources the user gave. If none, use well-known primary sources (papers, specs, official docs); do not invent citations.
- Pin each web source with `mutoscope ingest url <url> --reel <dir>` and read it from the snapshot it writes, so `url` refs can carry verbatim `quote`s that `validate` checks. For a single article or post the user wants explained, use the `article` recipe instead.
- If example code grounds the concept, pin it like a codebase tour (`source.provider` `git`/`github` with `headSha`); otherwise `source: { "provider": "none" }` and only `url` refs.

## Analysis

Units: the definition, the core mechanism, the invariant that makes it correct, one worked example, the main trade-off or failure mode. Claims from a cited source are evidence; your simplifications are inference — say "simplified" in the claim.

## Story arc (4–6 scenes)

1. **The problem** — what goes wrong without the idea (`removed`/`warning` tones). Open with a `headline` title card if the reel is longer than three scenes.
2. **The mechanism** — the moving parts, introduced one cue at a time.
3. **Worked example** — concrete values in `sublabel`s or `label`s, stepped with `highlight`/`move`/`connect`.
4. **Why it works** — the invariant, stated in a `label` and shown holding.
5. **Limits** — trade-off or failure mode as a `list`; a comparison with an alternative (a `table`, or a `chart` if there are numbers) if the user asked.

Prefer concrete names and numbers over abstractions on stage; put the abstraction in the narration.

## Kicker

`Explainer · <topic>`.
