// Link skills/mutoscope into agent skill directories. The skill follows the
// open Agent Skills layout (SKILL.md + resources), so any agent that loads
// skills from a directory can use it.
//
//   node scripts/install-skill.mjs                    # ~/.agents/skills (+ ~/.claude/skills if present)
//   node scripts/install-skill.mjs --target <dir> …   # any other skills directory
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve("skills/mutoscope");
if (!existsSync(join(source, "runtime", "cli.mjs"))) {
  console.error("runtime missing — run `npm run build` first");
  process.exit(1);
}

const args = process.argv.slice(2);
const explicit = args.flatMap((a, i) => (a === "--target" && args[i + 1] ? [resolve(args[i + 1])] : []));
const defaults = [join(homedir(), ".agents", "skills"), ...(existsSync(join(homedir(), ".claude")) ? [join(homedir(), ".claude", "skills")] : [])];

for (const dir of explicit.length ? explicit : defaults) {
  mkdirSync(dir, { recursive: true });
  const link = join(dir, "mutoscope");
  if (existsSync(link) || isLink(link)) {
    const current = isLink(link) ? resolve(dir, readlinkSync(link)) : null;
    if (current === source) {
      console.log(`✓ ${link} already points here`);
      continue;
    }
    console.error(`! ${link} exists and is not this checkout — leaving it alone`);
    continue;
  }
  symlinkSync(source, link, "dir");
  console.log(`✓ linked ${link} → ${source}`);
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
