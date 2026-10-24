# Publishing and collaboration

## What a published reel contains

`mutoscope build` writes a static folder: `index.html` (the player and all reel data inlined — it works offline and from any static host), plus `manifest.json`, `scenes.json`, `analysis.json`, `threads.json` for tooling. `rationale.md` text is embedded when present. `source/` is **never** published.

The page has a strict Content-Security-Policy: only the bundled player script runs, and it cannot make network requests. Questions leave the page only when the viewer clicks through to GitHub.

## Enabling questions (optional)

```bash
mutoscope collab setup <reel-dir> --repo owner/repo [--category "Walkthrough Q&A"] [--enable]
```

- Discussions must be enabled on the repo (`--enable` turns them on with the author's `gh` login; ask first).
- GitHub's API cannot create discussion categories. If the category is missing, the command prints a link; the author creates it (Question/Answer format) or picks an existing one with `--category`.
- Viewers ask by opening a prefilled GitHub "new discussion" page — they sign in with their own account; no token is ever embedded in the reel.

## Publishing

```bash
mutoscope publish <reel-dir> [--repo owner/repo] [--path reels/<id>]         # dry run: prints plan + findings
mutoscope publish <reel-dir> [--repo owner/repo] [--path reels/<id>] --yes   # only after explicit approval
```

1. Run the dry run and show the author the plan verbatim: target repo and visibility, branch, path, public URL, contents.
2. Findings marked **BLOCK** stop the publish: secrets in any string, sensitive files referenced, or a private source going to a public Pages site. Fix the content; never work around a block. `--allow-private-source` exists for authors who knowingly accept that the reel (code snippets included) becomes public — only pass it when they say so after seeing the warning.
3. Re-run with `--yes` only after the author approves *this* plan. Approval for one reel or destination does not carry over to another.

`--yes` pushes the site to the `gh-pages` branch under `reels/<id>/`, enables Pages if needed, and writes `publicUrl` back to the manifest so questions carry working deep links.

Any other static host: `mutoscope build <reel-dir> --out <dir>` and upload the folder.

## Keeping threads in the reel

`mutoscope sync <reel-dir>` snapshots the reel's discussions into `threads.json`; rebuild or republish to show them in the player's Threads tab and as badges on the entities they are about. Bump `manifest.version` when you change the content of a published reel so anchors record which version a question was asked against.
