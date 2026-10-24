import { parseArgs, type ParseArgsConfig } from "node:util";
import { CliError } from "./reel-files";

export function parse<T extends NonNullable<ParseArgsConfig["options"]>>(argv: readonly string[], options: T) {
  try {
    return parseArgs({ args: [...argv], options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new CliError((e as Error).message);
  }
}

export function positional(list: readonly string[], i: number, name: string): string {
  const v = list[i];
  if (!v) throw new CliError(`Missing <${name}>`);
  return v;
}
