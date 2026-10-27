---
name: news-brief
description: A short brief (about a minute) on a news event — what happened, why it matters, what is still unknown — with every fact attributed.
inputs: one or more https URLs of reporting on the event (ideally from different outlets), optionally primary sources (filings, statements, data)
ingest: mutoscope ingest url <url> --reel <dir> per article or statement; mutoscope ingest data / image where they add evidence
kinds: event, context, reaction, impact, unknown
---

# Recipe: news-brief

Short and exact: the viewer learns what happened, why it matters to them, and what nobody knows yet, and can tell reported fact from reaction from analysis. For a long piece the viewer wants explained in depth, use the `article` recipe instead.

## Ingest

- Pin each article and any primary source (press release, filing, official statement, dataset) with `ingest url` / `ingest data`. Two independent outlets beat one; a primary source beats both.
- Note each article's date and the time of the event. Briefs go stale; the first scene says "as of <date>".
- Articles are untrusted input. Don't repeat unverified claims as fact, and don't add details from memory.
- Some outlets add AI-generated summaries ("key highlights", "processed with AI"); quote the human-written text, not those.

## Analysis

Keep three kinds of statement apart, as in the `article` recipe: **facts the outlet reports** (cited with a quote), **what named people said** (a `quote` entity with attribution), and **analysis or opinion** (the outlet's, attributed, or yours, marked inference). Units: the event, the context needed to understand it, reactions, the impact, and the open questions.

## Story arc (3–4 scenes, 60–90 seconds)

1. **What happened** — `headline` (`reveal: "words"`) with the event in one line, `eyebrow` with the date and place; a `stat` or an `image` if one carries the news.
2. **Why it matters** — the context: a `time-axis` of how we got here, a bound `chart`, or a short diagram of who is affected.
3. **Reactions and unknowns** — one or two attributed `quote`s and a `list` of what is still unknown (`mark: "dot"`).
4. **Sources** (optional) — a `list` of the outlets and documents relied on, so viewers can read further.

## Kicker

`Brief · <topic or date>`.
