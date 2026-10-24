import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toThread, type RawDiscussion } from "../../src/adapters/github/discussions";
import { buildContext, discussionBody, withAnswerFooter } from "../../src/core";
import { renderReelHtml, scriptSafeJson } from "../../src/cli/lib/html";
import { listRecipes, parseFrontmatter } from "../../src/cli/lib/recipes";
import { scanBundle } from "../../src/cli/lib/safety";
import { scanPaths, sizeVerdict } from "../../src/cli/lib/change-size";
import { ReelBundle } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const bundle = ReelBundle.parse(exampleRaw());

describe("renderReelHtml", () => {
  it("embeds data that cannot break out of its script tag", () => {
    const evil = { ...bundle, manifest: { ...bundle.manifest, title: "</script><script>alert(1)</script>" } };
    const html = renderReelHtml(evil, "console.log('</script>')", "body{}");
    const dataTag = html.slice(html.indexOf('id="mutoscope-reel">'), html.indexOf("</script>", html.indexOf('id="mutoscope-reel">')));
    expect(dataTag).not.toContain("<script>alert");
    expect(html).toContain("<title>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>");
    expect(html).toContain("console.log('<\\/script>')");
  });

  it("locks the page down with a hash-based CSP and no network access", () => {
    const html = renderReelHtml(bundle, "1+1", "body{}");
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("connect-src");
  });

  it("round-trips the bundle through script-safe JSON", () => {
    const tricky = { s: "a</script>b c" };
    expect(JSON.parse(scriptSafeJson(tricky))).toEqual(tricky);
    expect(scriptSafeJson(tricky)).not.toContain("</");
  });
});

describe("scanBundle", () => {
  it("passes the example", () => {
    expect(scanBundle(bundle)).toEqual([]);
  });

  it("blocks secrets anywhere and sensitive file refs", () => {
    const leaked = structuredClone(bundle);
    leaked.scenes[0]!.narration = "token ghp_" + "a".repeat(36);
    leaked.scenes[0]!.entities[0]!.sourceRefs = [{ kind: "code", path: "config/.env", revision: "head" }];
    const findings = scanBundle(leaked);
    expect(findings.map((f) => f.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("GitHub token"), expect.stringContaining("sensitive file")]),
    );
    expect(findings.every((f) => f.severity === "block")).toBe(true);
  });
});

describe("change size", () => {
  it("flags large changes and sensitive paths", () => {
    const files = Array.from({ length: 41 }, (_, i) => ({ path: `f${i}.ts`, additions: 1, deletions: 0 }));
    expect(sizeVerdict(files).warning).toContain("large change");
    expect(scanPaths([{ path: "deploy/.env.production", additions: 1, deletions: 0 }, { path: "src/env.ts", additions: 1, deletions: 0 }])).toEqual([
      "deploy/.env.production",
    ]);
  });
});

describe("recipes", () => {
  it("parses frontmatter", () => {
    expect(parseFrontmatter("---\nname: x\ndescription: y: z\n---\nbody")).toEqual({ name: "x", description: "y: z" });
  });

  it("lists built-ins and lets project recipes shadow them", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mutoscope-recipes-"));
    await mkdir(join(cwd, ".mutoscope", "recipes"), { recursive: true });
    await writeFile(join(cwd, ".mutoscope", "recipes", "pr.md"), "---\nname: pr\ndescription: custom\ninputs: x\n---\n");
    const recipes = await listRecipes(cwd);
    expect(recipes.map((r) => r.name)).toEqual(expect.arrayContaining(["pr", "codebase-tour", "concept", "incident"]));
    expect(recipes.find((r) => r.name === "pr")).toMatchObject({ description: "custom", origin: "project" });
    expect(recipes.some((r) => r.name.startsWith("_"))).toBe(false);
  });
});

describe("GitHub discussion mapping", () => {
  const scene = bundle.scenes[0]!;
  const context = buildContext(bundle.manifest, scene, 4200, "mutex");
  const raw = (body: string, comments: string[] = [], extra: Partial<RawDiscussion> = {}): RawDiscussion => ({
    id: "D_1",
    number: 7,
    title: "[Reel] Why?",
    url: "https://github.com/o/r/discussions/7",
    body,
    createdAt: "2026-10-24T00:00:00Z",
    closed: false,
    isAnswered: false,
    author: { login: "bob" },
    comments: { nodes: comments.map((b, i) => ({ id: `C${i}`, body: b, url: `u${i}`, createdAt: "2026-10-25T00:00:00Z", author: { login: "alice" } })) },
    ...extra,
  });

  it("maps a question with its anchor and marks agent answers", () => {
    const t = toThread(raw(discussionBody({ question: "Why one mutex?", context }, scene), [withAnswerFooter("Because.", "alice")]), bundle.manifest.id);
    expect(t).toMatchObject({ number: 7, status: "answered", question: "Why one mutex?", author: "bob" });
    expect(t?.context.entityId).toBe("mutex");
    expect(t?.replies[0]).toMatchObject({ aiAssisted: true });
    expect(t?.replies[0]?.body).not.toContain("mutoscope:answer");
  });

  it("ignores other reels and unrelated discussions", () => {
    expect(toThread(raw(discussionBody({ question: "q", context: { ...context, reelId: "other" } }, scene)), bundle.manifest.id)).toBeNull();
    expect(toThread(raw("just chatting"), bundle.manifest.id)).toBeNull();
  });

  it("reports closed and open status", () => {
    const body = discussionBody({ question: "q", context }, scene);
    expect(toThread(raw(body, ["thanks"]), bundle.manifest.id)?.status).toBe("open");
    expect(toThread(raw(body, [], { closed: true }), bundle.manifest.id)?.status).toBe("closed");
  });
});
