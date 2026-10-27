import * as build from "./commands/build";
import * as collab from "./commands/collab";
import * as exportVideo from "./commands/export";
import * as ingest from "./commands/ingest";
import * as init from "./commands/init";
import * as installBrowser from "./commands/install-browser";
import * as live from "./commands/live";
import * as preview from "./commands/preview";
import * as publish from "./commands/publish";
import * as recipes from "./commands/recipes";
import * as snapshot from "./commands/snapshot";
import * as threads from "./commands/threads";
import * as unpin from "./commands/unpin";
import * as validate from "./commands/validate";
import { CliError } from "./lib/reel-files";
import { c, err, out } from "./lib/output";

type Command = (argv: readonly string[]) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  recipes: recipes.run,
  init: init.run,
  ingest: ingest.run,
  unpin: unpin.run,
  validate: validate.run,
  build: build.run,
  preview: preview.run,
  snapshot: snapshot.run,
  export: exportVideo.run,
  collab: collab.run,
  publish: publish.run,
  inbox: threads.inbox,
  question: threads.question,
  reply: threads.reply,
  sync: threads.sync,
  watch: live.watch,
  poll: live.poll,
  end: live.end,
  sessions: live.sessions,
  "live-server": live.liveServerMain,
  "install-browser": installBrowser.run,
};

const USAGE = [
  `${c.bold("mutoscope")} — interactive, discussable reels from recipes`,
  "",
  "Author",
  `  ${recipes.help}`,
  `  ${init.help}`,
  `  ${ingest.help}`,
  `  ${unpin.help}`,
  `  ${validate.help}`,
  `  ${build.help}`,
  `  ${preview.help}`,
  `  ${snapshot.help}`,
  `  ${exportVideo.help}`,
  `  ${installBrowser.help}`,
  "Watch with your agent",
  `  ${live.help}`,
  "Share",
  `  ${collab.help}`,
  `  ${publish.help}`,
  "Collaborate on GitHub",
  `  ${threads.help}`,
].join("\n");

const MIN_NODE = 22;

async function main(argv: readonly string[]): Promise<number> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE) err(`${c.yellow("warn")} mutoscope is built for Node.js ${MIN_NODE} or newer; this is ${process.version}, so some commands may fail`);
  const [name, ...rest] = argv;
  if (!name || name === "help" || name === "--help" || name === "-h") {
    out(USAGE);
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    err(`${c.red("error")} unknown command '${name}'`, "", USAGE);
    return 2;
  }
  return command(rest);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    if (e instanceof CliError) {
      err(`${c.red("error")} ${e.message}`, ...(e.hint ? [c.dim(e.hint)] : []));
      process.exit(1);
    }
    err(`${c.red("unexpected error")} ${(e as Error).stack ?? String(e)}`);
    process.exit(70);
  },
);
