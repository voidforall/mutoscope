---
name: compare
description: Compare two to four options — tools, libraries, approaches, products — on the criteria that matter for a decision, and end in a clear, honest verdict.
inputs: the options and the decision context (what it is for, what matters); docs, benchmarks or data for each option
ingest: mutoscope ingest url <url> --reel <dir> per source; mutoscope ingest data <file-or-url> --reel <dir> for benchmark data
kinds: decision, criterion, option, measurement, trade-off, verdict
---

# Recipe: compare

The viewer should be able to make the decision: what each option is good at, where it falls short, how they measure against each other on the same criteria, and which one fits *their* situation.

## Ingest

- Pin sources **for every option equally**: official docs, changelogs, independent benchmarks. Vendor pages describe their own product; attribute their claims ("Vendor X says …").
- Benchmark numbers come from a pinned page (quoted) or a dataset (`ingest data`, bound to the chart). Note the version and date; comparisons go stale.
- Ask the user for the decision context if they did not give it (scale, team, budget, constraints). The verdict depends on it.

## Analysis

- **criteria**: 3–6 that matter for this decision, the same for every option. Name them before judging.
- **option**: what each is, in one line, from its own docs.
- **measurement**: numbers on a shared basis (same workload, same version, same date), each cited.
- **trade-off**: what you give up with each choice.
- **verdict**: which option fits which situation. It is inference unless the user supplied weights; say what it depends on.

Fairness rules: same criteria, same depth and same kind of source for every option; no option gets only its marketing claims and another only its bug reports. Mark anything you could not verify for one option as unknown rather than guessing.

## Story arc (4–7 scenes)

1. **The decision** — `headline`: the question as the viewer would ask it ("Postgres or DynamoDB for an event log?"), `eyebrow` with the context.
2. **What matters** — a `list` of the criteria, numbered by importance if the user ranked them.
3. **The contenders** — one column per option (4 columns each for three options, 6 for two): a `headline` (`size: "lg"`) on rows 1–2 above a `list` on rows 3–8 of strengths (`mark: "check"`) and weaknesses (`mark: "cross"`). Bring the columns in one cue at a time.
4. **Side by side** — a `table` of options × criteria, or a `bar` chart for a measured criterion (`highlight` the winner on it).
5. **Where each one wins** — scenarios as `label`s or a `list`, each naming the option that fits.
6. **Verdict** — `headline` with the recommendation for the stated context, and a `label` with what would change it.

## Kicker

`Compare · <option A> vs <option B>`.
