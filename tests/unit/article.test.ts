import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDocuments } from "../../src/cli/lib/document-check";
import { closestPassage, plainSnapshot, quoteFound, quoteOutOfOrder } from "../../src/cli/lib/quote-match";
import { htmlToSnapshot, sha256, snapshotSlug } from "../../src/cli/lib/web-snapshot";
import { findTextSizeIssues, validateBundle } from "../../src/core";
import { ReelBundle, Scene } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const PAGE = `<!doctype html><html><head><title>Fallback</title><meta property="og:title" content="WorldTUI: a model that pretends to be a terminal">
<script>document.write("ignore me")</script><style>p{}</style></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article>
  <h1>WorldTUI</h1>
  <p>I fine-tuned a 360M-parameter model to act as a terminal. There&rsquo;s no shell behind it.</p>
  <h2 id="rows-in-parallel">Rows in parallel</h2>
  <p>Large-frame p95 latency dropped from 6.7&nbsp;s to 0.87&nbsp;s.<sup id="fnref:1"><a href="#fn:1">1</a></sup></p>
  <ul><li>vim opened on row 3</li><li>snake got extra food</li></ul>
  <blockquote><p>That's chance.</p></blockquote>
  <pre><code>ROW_0 COPY 1
ROW_1 COPY 2</code></pre>
  <section><h3><a id="distilling"></a>Distilling</h3><p>In the end I gave up on distilling it.</p></section>
  <div class="footnotes"><p id="fn:1">Measured on an RTX 4090.</p></div>
</article>
<footer>Subscribe to the newsletter</footer></body></html>`;

describe("web snapshots", () => {
  const snap = htmlToSnapshot(PAGE);

  it("keeps the article and drops scripts, styles, navigation and footers", () => {
    expect(snap.title).toBe("WorldTUI: a model that pretends to be a terminal");
    expect(snap.text).toContain("I fine-tuned a 360M-parameter model");
    expect(snap.text).not.toMatch(/ignore me|Home|Subscribe|p\{\}/);
  });

  it("marks headings with their anchors and lists every anchor on the page", () => {
    expect(snap.text).toContain("## Rows in parallel {#rows-in-parallel}");
    expect(snap.text).toContain("### Distilling {#distilling}");
    expect(snap.anchors).toEqual(expect.arrayContaining(["rows-in-parallel", "distilling", "fnref:1", "fn:1"]));
  });

  it("marks other anchored blocks, like footnotes, at the start of their line", () => {
    expect(snap.text).toContain("{#fn:1} Measured on an RTX 4090.");
    expect(quoteFound(plainSnapshot(snap.text), "on an RTX 4090. Large")).toBe(false);
    expect(quoteFound(plainSnapshot(snap.text), "Measured on an RTX 4090.")).toBe(true);
  });

  it("keeps lists, block quotes and preformatted text recognisable", () => {
    expect(snap.text).toContain("- vim opened on row 3");
    expect(snap.text).toContain("> That's chance.");
    expect(snap.text).toContain("```\nROW_0 COPY 1\nROW_1 COPY 2\n```");
  });

  it("derives a stable, filesystem-safe slug", () => {
    expect(snapshotSlug("https://simedw.com/2026/10/21/world-model-terminal/")).toBe("simedw-com-2026-10-21-world-model-terminal");
  });
});

describe("quote matching", () => {
  const plain = plainSnapshot(htmlToSnapshot(PAGE).text);

  it("forgives typographic quotes, dashes, case and whitespace — not changed words", () => {
    expect(quoteFound(plain, "There's no shell behind it.")).toBe(true);
    expect(quoteFound(plain, "large-frame P95 latency dropped from 6.7 s to 0.87 s")).toBe(true);
    expect(quoteFound(plain, "latency dropped from 6.7 s to 0.8 s")).toBe(false);
    expect(quoteFound(plain, "There is no shell behind it.")).toBe(false);
  });

  it("joins passages with an ellipsis, in order only", () => {
    expect(quoteFound(plain, "I fine-tuned a 360M-parameter model … I gave up on distilling it")).toBe(true);
    expect(quoteFound(plain, "I gave up on distilling it … I fine-tuned a 360M-parameter model")).toBe(false);
  });

  it("tells an out-of-order ellipsis quote apart from a misquote", () => {
    expect(quoteOutOfOrder(plain, "I gave up on distilling it … I fine-tuned a 360M-parameter model")).toBe(true);
    expect(quoteOutOfOrder(plain, "I gave up … on a made-up passage")).toBe(false);
  });

  it("matches across the snapshot's own markup (headings, bullets, quote marks)", () => {
    expect(quoteFound(plain, "Rows in parallel Large-frame p95")).toBe(true);
    expect(quoteFound(plain, "vim opened on row 3 snake got extra food")).toBe(true);
  });

  it("points at the passage a misquote probably came from", () => {
    expect(closestPassage(plain, "In the end the author gave up on distillation")).toContain("I gave up on distilling it");
  });
});

describe("checkDocuments", () => {
  let dir: string;
  const URL_ = "https://example.com/post/";
  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function reel(edit: (raw: any) => void, opts: { tamper?: boolean } = {}) {
    dir = await mkdtemp(join(tmpdir(), "mutoscope-article-"));
    const snap = htmlToSnapshot(PAGE);
    const md = `<!-- snapshot -->\n\n${snap.text}\n`;
    await mkdir(join(dir, "source", "web"), { recursive: true });
    await writeFile(join(dir, "source/web/post.md"), opts.tamper ? `${md}edited` : md);
    const meta = { url: URL_, finalUrl: URL_, retrievedAt: "2026-10-25T00:00:00.000Z", sha256: sha256(md), anchors: snap.anchors };
    await writeFile(join(dir, "source/web/post.json"), JSON.stringify(meta));
    const raw = structuredClone(exampleRaw()) as any;
    raw.manifest.documents = [{ url: URL_, retrievedAt: meta.retrievedAt, sha256: meta.sha256 }];
    edit(raw);
    const bundle = ReelBundle.parse(raw);
    return checkDocuments(bundle, dir);
  }
  const cite = (url: string, quote?: string) => ({ text: "claim", basis: "evidence", refs: [{ kind: "url", url, ...(quote ? { quote } : {}) }] });

  it("accepts verbatim quotes and real anchors", async () => {
    const r = await reel((raw) => raw.scenes[0].claims.push(cite(`${URL_}#rows-in-parallel`, "dropped from 6.7 s to 0.87 s")));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("rejects a misquote and a missing anchor, suggesting the nearest of each", async () => {
    const r = await reel((raw) => raw.scenes[0].claims.push(cite(`${URL_}#distillation`, "In the end the author gave up on distillation")));
    expect(r.errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/#distillation is not an anchor on the pinned page; closest: distilling/),
      expect.stringMatching(/quote is not in the pinned page: .* closest passage: "In the end I gave up on distilling it\."/),
    ]);
  });

  it("asks evidence claims citing a pinned page to quote it, once per page", async () => {
    const r = await reel((raw) => raw.scenes[0].claims.push(cite(URL_), cite(`${URL_}#distilling`)));
    expect(r.warnings).toEqual([{ path: "2 claims", message: expect.stringContaining("evidence claims cite https://example.com/post without a quote") }]);
  });

  it("checks the words on stage in quote entities", async () => {
    const r = await reel((raw) =>
      raw.scenes[0].entities.push(
        { id: "q-ok", type: "quote", text: "That's chance.", sourceRefs: [{ kind: "url", url: URL_ }], layout: { col: 1, row: 7, colSpan: 4, rowSpan: 2 } },
        { id: "q-bad", type: "quote", text: "That's not chance.", sourceRefs: [{ kind: "url", url: URL_ }], layout: { col: 7, row: 7, colSpan: 4, rowSpan: 2 } },
      ),
    );
    expect(r.errors.map((e) => e.message)).toEqual([expect.stringContaining("quote 'q-bad' is not in the pinned page")]);
  });

  it("notices a snapshot edited after ingest", async () => {
    const r = await reel(() => undefined, { tamper: true });
    expect(r.errors.map((e) => e.message)).toEqual(expect.arrayContaining([expect.stringContaining("edited after ingest")]));
  });
});

describe("quote entity on stage", () => {
  const sceneWith = (text: string, layout: object) =>
    Scene.parse({ id: "s", title: "S", durationMs: 10_000, narration: "n", timeline: [], entities: [{ id: "q", type: "quote", text, layout }] });

  it("warns when a quote is too long for its box", () => {
    const long = "word ".repeat(70).trim();
    expect(findTextSizeIssues(sceneWith(long, { col: 1, row: 1, colSpan: 3, rowSpan: 1 }), "p")[0]?.message).toMatch(/quote 'q' shrinks to/);
    expect(findTextSizeIssues(sceneWith("That's chance.", { col: 1, row: 1, colSpan: 4, rowSpan: 2 }), "p")).toEqual([]);
  });

  it("is a valid, overlap-checked entity in a reel", () => {
    const raw = structuredClone(exampleRaw()) as any;
    raw.scenes[0].entities.push({ id: "q", type: "quote", text: "One lock guards everything.", layout: { col: 5, row: 1, colSpan: 4, rowSpan: 2 } });
    const r = validateBundle(raw);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.message)).toEqual(expect.arrayContaining([expect.stringMatching(/'mutex' and 'q' overlap|'q' and 'mutex' overlap/)]));
  });
});
