import type { Issue } from "../../core";

const tty = process.stdout.isTTY;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { red: paint(31), green: paint(32), yellow: paint(33), dim: paint(2), bold: paint(1), cyan: paint(36) };

export const out = (...lines: string[]) => process.stdout.write(`${lines.join("\n")}\n`);
export const err = (...lines: string[]) => process.stderr.write(`${lines.join("\n")}\n`);

export function printIssues(errors: readonly Issue[], warnings: readonly Issue[]): void {
  for (const e of errors) out(`${c.red("error")}   ${c.dim(e.path)}  ${e.message}`);
  for (const w of warnings) out(`${c.yellow("warn")}    ${c.dim(w.path)}  ${w.message}`);
}
