import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

// The whole local loop with the real CLI: watch → viewer asks in the browser →
// agent polls → agent replies → answer renders → reel edits reload in place.
const run = promisify(execFile);
const CLI = resolve("skills/mutoscope/runtime/cli.mjs");
const ROOT = resolve("test-results/live");
const REEL = `${ROOT}/reel`;
const PORT = "4872";
const env = { ...process.env, MUTOSCOPE_STATE_DIR: `${ROOT}/state` };
const cli = (...args: string[]) => run(process.execPath, [CLI, ...args], { env, timeout: 60_000 });

test.describe.configure({ mode: "serial" });
let url: string;

test.beforeAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(ROOT, { recursive: true });
  await cp("examples/spsc-evolution", REEL, { recursive: true });
  const { stdout } = await cli("watch", REEL, "--no-open", "--port", PORT);
  url = /http:\/\/127\.0\.0\.1:\d+\/s\/[0-9a-f]{16}\//.exec(stdout)![0];
});

test.afterAll(async () => {
  const info = JSON.parse(await readFile(`${ROOT}/state/server.json`, "utf8").catch(() => "{}"));
  if (info.pid) process.kill(info.pid, "SIGTERM");
});

test("ask from the browser, answer from the terminal, jump to the moment", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?scene=drop-the-lock&t=6000&entity=push-diff`);
  await page.waitForFunction(() => (window as any).mutoscope?.ready);
  await page.getByRole("tab", { name: /^Ask/ }).click();
  await expect(page.locator(".panel .presence")).toHaveText("No agent listening");

  const polling = cli("poll", REEL, "--no-frames", "--timeout-ms", "30000");
  await expect(page.locator(".panel .presence")).toHaveText("Agent listening");
  await page.locator("#ask-q").fill("Why is popCursor_ loaded with acquire?");
  await page.locator("#ask-q").press("ControlOrMeta+Enter");
  await expect(page.locator(".msg.is-viewer .msg-text")).toHaveText("Why is popCursor_ loaded with acquire?");
  await expect(page.locator("#ask-q")).toHaveValue("");

  const brief = JSON.parse((await polling).stdout);
  expect(brief.status).toBe("questions");
  expect(brief.questions[0]).toMatchObject({
    question: { text: "Why is popCursor_ loaded with acquire?" },
    anchor: { sceneId: "drop-the-lock", entityId: "push-diff", timestampMs: 6000 },
    pinnedSource: { headSha: "043e9cbd8d6f36d82b538a114ded838df1553313" },
  });
  await expect(page.locator(".panel .presence")).toHaveText("Agent is answering…");
  await expect(page.locator(".msg-wait")).toHaveText("Your agent is reading the source…");

  await writeFile(`${ROOT}/answer.md`, "It pairs with the consumer's **release** store.\n\n- See [the happens-before scene](?scene=happens-before&t=0).\n");
  const after = JSON.parse((await cli("poll", REEL, "--reply-file", `${ROOT}/answer.md`, "--timeout-ms", "300")).stdout);
  expect(after.status).toBe("timeout");

  const answer = page.locator(".msg.is-agent");
  await expect(answer.locator("strong")).toHaveText("release");
  await expect(page.locator(".msg-wait")).toHaveCount(0);
  await answer.getByRole("link", { name: "the happens-before scene" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).mutoscope.state().sceneId)).toBe("happens-before");
  expect(errors).toEqual([]);
});

test("editing the reel reloads it in place, keeping the moment, tab and conversation", async ({ page }) => {
  await page.goto(`${url}?scene=cache-lines&t=1000`);
  await page.waitForFunction(() => (window as any).mutoscope?.ready);
  await page.getByRole("tab", { name: /^Ask/ }).click();
  await expect(page.locator(".msg")).toHaveCount(2);

  const manifest = JSON.parse(await readFile(`${REEL}/manifest.json`, "utf8"));
  await writeFile(`${REEL}/manifest.json`, JSON.stringify({ ...manifest, title: "Edited live" }));
  await expect(page.locator("h1")).toHaveText("Edited live");
  expect(await page.evaluate(() => (window as any).mutoscope.state().sceneId)).toBe("cache-lines");
  await expect(page.getByRole("tab", { name: /^Ask/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".msg")).toHaveCount(2);

  await writeFile(`${REEL}/manifest.json`, "{ not json");
  await expect(page.locator(".banner")).toContainText("no longer validate");
  await writeFile(`${REEL}/manifest.json`, JSON.stringify(manifest));
  await expect(page.locator("h1")).toHaveText(manifest.title);
});

test("ending the session from the browser stops the agent's poll", async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).mutoscope?.ready);
  await page.getByRole("tab", { name: /^Ask/ }).click();
  const polling = cli("poll", REEL, "--no-frames", "--timeout-ms", "30000");
  await expect(page.locator(".panel .presence")).toHaveText("Agent listening");
  await page.getByRole("button", { name: "End session" }).click();
  expect(JSON.parse((await polling).stdout)).toMatchObject({ status: "ended", by: "viewer" });
  await expect(page.locator(".panel .presence")).toHaveText("Session ended");
  await expect(page.locator("#ask-q")).toBeDisabled();
});
