---
name: incident
description: Replay an incident or postmortem — timeline, blast radius, root cause and fixes — as a reel the team can question.
inputs: incident notes, timeline, logs, dashboards exports, the fixing PRs
ingest: none — read the provided material; ingest fixing PRs with `mutoscope ingest pr` into a separate reel if they need their own walkthrough
kinds: trigger, propagation, detection, mitigation, root-cause, contributing-factor, action-item
---

# Recipe: incident

Blameless and precise: what happened, in what order, why it spread, how it was stopped, and what changes now.

## Ingest

- Collect the timeline with absolute timestamps and their source (alert, log line, chat message). Each timeline claim is evidence only with a ref (a `url` to the dashboard/log/ticket, or a `code` ref for config and code).
- Redact customer data, credentials, internal hostnames the author has not cleared, and people's names unless the author wants them. `publish` blocks obvious secrets but cannot recognise personal data.
- Pin the code and config at the incident-time commit, not today's.

## Analysis

Units follow the incident's causal chain. Root cause and contributing factors are frequently `inference` until the postmortem confirms them — label accordingly, with `confidence` reflecting the state of the investigation.

## Story arc (4–6 scenes)

1. **Normal operation** — the involved services and the healthy flow.
2. **Trigger** — the change or event, highlighted; cues carry the timestamps. A `time-axis` of the whole incident (`at` in minutes from the start, `when` as "14:02 UTC", `spans` for degraded and outage periods) gives viewers the shape before the details.
3. **Propagation** — `warning`/`removed` tones spreading along edges; `disconnect` for broken paths.
4. **Detection & mitigation** — what alerted, what was done, when it recovered; impact as `stat`s (duration, error rate, requests lost), or a `chart` bound to an exported metrics CSV (`ingest data`).
5. **Root cause** — focus on the code/config with a code-block.
6. **Action items** — a `list` with `style: "checks"` of each fix, with owners only if the author approves names.

## Kicker

`Incident · <id or date>`.
