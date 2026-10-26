import { expect, test, type Page } from "@playwright/test";

const HEAD = "043e9cbd8d6f36d82b538a114ded838df1553313";

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as any).mutoscope?.ready);
  return errors;
}

const state = (page: Page) => page.evaluate(() => (window as any).mutoscope.state());

test("loads the reel and autoplays without errors", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("h1")).toHaveText("From mutex to lock-free SPSC queue");
  await expect(page.locator(".chapter")).toHaveCount(5);
  await expect.poll(async () => (await state(page)).tMs).toBeGreaterThan(300);
  expect((await state(page)).playing).toBe(true);
  expect(errors).toEqual([]);
});

test("play, pause, scene navigation and scrubbing", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Pause" }).click();
  const paused = (await state(page)).tMs;
  await page.waitForTimeout(300);
  expect((await state(page)).tMs).toBe(paused);

  await page.getByRole("button", { name: "Next scene" }).click();
  await expect.poll(async () => (await state(page)).sceneId).toBe("drop-the-lock");
  await page.getByRole("button", { name: "Previous scene" }).click();
  await expect.poll(async () => (await state(page)).sceneId).toBe("mutex-baseline");

  const bar = await page.locator(".scrubber").boundingBox();
  await page.mouse.click(bar!.x + bar!.width * 0.99, bar!.y + bar!.height / 2);
  await expect.poll(async () => (await state(page)).sceneId).toBe("cached-cursors");
});

test("selecting an entity pauses and shows commit-pinned source", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).mutoscope.pause();
    (window as any).mutoscope.seek("mutex-baseline", 15000);
  });
  await page.locator('[data-entity="mutex"]').click();
  const s = await state(page);
  expect(s).toMatchObject({ playing: false, selectedId: "mutex" });
  await expect(page.getByRole("tab", { name: /Inspect/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".panel-title")).toHaveText("std::mutex");
  await expect(page.locator(".panel a.ref").first()).toHaveAttribute(
    "href",
    `https://github.com/CharlesFrasch/cppcon2023/blob/${HEAD}/Mutex.hpp#L77`,
  );
  await expect(page.locator(".basis-evidence").first()).toBeVisible();
});

test("deep links restore scene, time and entity; bad ids fall back", async ({ page }) => {
  await open(page, "?scene=happens-before&t=9000&entity=push-cursor");
  expect(await state(page)).toMatchObject({ sceneId: "happens-before", tMs: 9000, selectedId: "push-cursor", playing: false });
  await expect(page.locator(".panel-title")).toHaveText("pushCursor_");

  await open(page, "?scene=nope&entity=ghost&t=abc");
  expect(await state(page)).toMatchObject({ sceneId: "mutex-baseline", selectedId: undefined });
});

test("the address bar tracks the paused position", async ({ page }) => {
  await open(page, "?scene=cache-lines&t=12000");
  await page.locator('[data-entity="push-b"]').click();
  await expect(page).toHaveURL(/scene=cache-lines&t=12000&entity=push-b/);
});

test("asking opens a prefilled, context-anchored GitHub discussion", async ({ page }) => {
  await open(page, "?scene=cached-cursors&t=17000&entity=pop-cache");
  await page.evaluate(() => {
    (window as any).__opened = [];
    window.open = ((url: string) => ((window as any).__opened.push(url), null)) as typeof window.open;
  });
  await page.getByRole("button", { name: "Ask about this" }).click();
  await page.locator("#ask-q").fill("Why not reload popCursor_ on every push?");
  await page.getByRole("button", { name: "Open as GitHub discussion" }).click();
  const [url] = await page.evaluate(() => (window as any).__opened as string[]);
  const u = new URL(url!);
  expect(u.origin + u.pathname).toBe("https://github.com/acme/reels/discussions/new");
  expect(u.searchParams.get("category")).toBe("walkthrough-q-a");
  expect(u.searchParams.get("title")).toBe("[Reel] Why not reload popCursor_ on every push?");
  const body = u.searchParams.get("body")!;
  expect(body).toContain("https://acme.github.io/reels/reels/spsc-evolution/?scene=cached-cursors&t=17000&entity=pop-cache");
  const ctx = JSON.parse(/```json mutoscope-context\n([\s\S]*?)\n```/.exec(body)![1]!);
  expect(ctx).toMatchObject({ reelId: "spsc-evolution", sceneId: "cached-cursors", entityId: "pop-cache", timestampMs: 17000, commit: HEAD });
});

test("synced threads show on the entity and jump to their anchor", async ({ page }) => {
  await open(page, "?scene=mutex-baseline&t=16000");
  await expect(page.locator('[data-entity="mutex"] .thread-dot')).toHaveText("1");
  await page.getByRole("tab", { name: /Threads/ }).click();
  await expect(page.locator(".thread-q")).toHaveText("Why is the lock stricter than needed?");
  await expect(page.locator(".ai-pill")).toBeVisible();
  // Replies are Markdown: rendered, never shown as raw syntax.
  const reply = page.locator(".reply-body");
  await expect(reply.locator("strong")).toHaveText("single writer");
  await expect(reply.locator("code").first()).toHaveText("acquire");
  await expect(reply.locator("li")).toHaveCount(2);
  await expect(reply.getByRole("link", { name: "the C++ memory model" })).toHaveAttribute("target", "_blank");
  await expect(reply).not.toContainText("**");
  await reply.getByRole("link", { name: "the handoff" }).click();
  expect(await state(page)).toMatchObject({ sceneId: "happens-before", tMs: 3000 });
  await page.getByRole("tab", { name: /Threads/ }).click();
  await page.getByRole("tab", { name: /All/ }).click();
  await page.locator(".anchor-btn").click();
  expect(await state(page)).toMatchObject({ sceneId: "mutex-baseline", tMs: 4200, selectedId: "mutex" });
});

test("keyboard controls", async ({ page }) => {
  await open(page, "?scene=drop-the-lock&t=5000");
  await page.keyboard.press("ArrowRight");
  expect((await state(page)).tMs).toBe(7000);
  await page.keyboard.press("]");
  expect((await state(page)).sceneId).toBe("happens-before");
  await page.keyboard.press("Space");
  expect((await state(page)).playing).toBe(true);
});

test("video mode renders only the frame @mobile", async ({ page }) => {
  await open(page, "?mode=video");
  await expect(page.locator(".video-frame")).toBeVisible();
  await expect(page.locator(".panel")).toHaveCount(0);
  expect((await state(page)).playing).toBe(false);
});

test("no horizontal overflow and a usable panel on phones @mobile", async ({ page }) => {
  const errors = await open(page, "?scene=drop-the-lock&t=15000");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("tab", { name: "Scene" })).toBeVisible();
  await expect(page.locator(".chapter-btn")).toHaveCount(5);
  expect(errors).toEqual([]);
});
