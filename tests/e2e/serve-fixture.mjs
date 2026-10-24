// Compose the e2e fixture reel (the example + collaboration + one synced
// thread) and serve it with the real `mutoscope preview` command.
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const port = process.argv[2] ?? "4871";
const dir = "test-results/e2e-reel";
await mkdir(dir, { recursive: true });
await cp("examples/spsc-evolution", dir, { recursive: true });
const manifest = JSON.parse(await readFile(`${dir}/manifest.json`, "utf8"));
await writeFile(
  `${dir}/manifest.json`,
  JSON.stringify({
    ...manifest,
    collaboration: { adapter: "github-discussions", repository: "acme/reels", category: "Walkthrough Q&A", categorySlug: "walkthrough-q-a" },
    publicUrl: "https://acme.github.io/reels/reels/spsc-evolution/",
  }),
);
await writeFile(`${dir}/threads.json`, await readFile("tests/e2e/threads.fixture.json", "utf8"));
const child = spawn(process.execPath, ["skills/mutoscope/runtime/cli.mjs", "preview", dir, "--port", port], { stdio: "inherit" });
process.on("SIGTERM", () => child.kill("SIGTERM"));
