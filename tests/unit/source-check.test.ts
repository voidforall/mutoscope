import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkSourceRefs, isElision, matchExcerpt } from "../../src/cli/lib/source-check";
import { ReelBundle } from "../../src/schema";
import { exampleRaw } from "./fixtures";

const FILE = ["fn steal_into(&self) {", "    // Steal the tasks", "    let n = self.steal_into2();", "", "    if n == 0 {", "        return None;", "    }", "    n", "}"];

describe("excerpt matching", () => {
  it("recognises elision lines in common comment styles", () => {
    for (const l of ["…", "...", "  // …", "# ...", "/* … */", "-- ..."]) expect(isElision(l)).toBe(true);
    expect(isElision("let x = ...rest;")).toBe(false);
  });

  it("accepts verbatim excerpts, ignoring indentation", () => {
    expect(matchExcerpt(["let n = self.steal_into2();", "", "if n == 0 {"], FILE, 1, FILE.length)).toEqual({ ok: true });
  });

  it("accepts elided passages in order, and rejects them out of order", () => {
    expect(matchExcerpt(["fn steal_into(&self) {", "    // …", "    if n == 0 {", "        return None;"], FILE, 1, FILE.length)).toEqual({ ok: true });
    expect(matchExcerpt(["if n == 0 {", "…", "fn steal_into(&self) {"], FILE, 1, FILE.length).ok).toBe(false);
  });

  it("rejects silently dropped lines and points at the first one that differs", () => {
    const r = matchExcerpt(["fn steal_into(&self) {", "    let n = self.steal_into2();"], FILE, 1, FILE.length);
    expect(r).toEqual({ ok: false, line: 2, text: "    let n = self.steal_into2();" });
  });

  it("stays within the cited line range", () => {
    expect(matchExcerpt(["fn steal_into(&self) {"], FILE, 3, 9).ok).toBe(false);
  });
});

describe("checkSourceRefs on diff panels", () => {
  let repo: string;
  let base: string;
  let head: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "mutoscope-src-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    await writeFile(join(repo, "queue.rs"), `${FILE.join("\n")}\n`);
    git("add", ".");
    git("commit", "-qm", "base");
    base = git("rev-parse", "HEAD");
    const after = FILE.map((l) => (l === "        return None;" ? "        return self.lifo.take();" : l));
    await writeFile(join(repo, "queue.rs"), `${after.join("\n")}\n`);
    git("commit", "-qam", "head");
    head = git("rev-parse", "HEAD");
  });
  afterAll(() => rm(repo, { recursive: true, force: true }));

  function bundleWith(panel: object) {
    const raw = structuredClone(exampleRaw()) as any;
    raw.manifest.source = { provider: "git", headRef: "head", headSha: head, baseSha: base };
    raw.scenes = [{ ...raw.scenes[0], claims: [], entities: [{ id: "d", type: "diff-panel", layout: { col: 1, row: 1, colSpan: 12, rowSpan: 4 }, ...panel }], timeline: [] }];
    delete raw.analysis;
    return ReelBundle.parse(raw);
  }
  const refs = [
    { kind: "code", path: "queue.rs", startLine: 1, endLine: 9, revision: "base" },
    { kind: "code", path: "queue.rs", startLine: 1, endLine: 9, revision: "head" },
  ];

  it("accepts before/after quoted from base and head, with elisions", async () => {
    const b = bundleWith({ before: "if n == 0 {\n    return None;\n}", after: "fn steal_into(&self) {\n// …\nif n == 0 {\n    return self.lifo.take();\n}", sourceRefs: refs });
    expect(await checkSourceRefs(b, repo)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects an after side that was edited instead of quoted", async () => {
    const b = bundleWith({ before: "if n == 0 {\n    return None;\n}", after: "if n == 0 {\n    return self.lifo.pop();\n}", sourceRefs: refs });
    const { errors } = await checkSourceRefs(b, repo);
    expect(errors.map((i) => i.message)).toEqual([expect.stringMatching(/'d' after side line 2 .*not in any of its code refs/)]);
  });

  it("warns when a diff panel cites no code, so it cannot be checked", async () => {
    const b = bundleWith({ before: "a", after: "b" });
    const r = await checkSourceRefs(b, repo);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((i) => i.message)).toEqual([expect.stringContaining("cites no code ref")]);
  });
});
