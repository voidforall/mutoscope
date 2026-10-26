import type { ReelBundle } from "../../schema";
import { SENSITIVE_PATH } from "./change-size";

export interface Finding {
  readonly severity: "block" | "warn";
  readonly where: string;
  readonly message: string;
}

const SECRET_PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "credential assignment", re: /\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];


const SVG_DATA = "data:image/svg+xml;base64,";

function* strings(value: unknown, path: string): Generator<[string, string]> {
  // Raster images are pixels; an SVG is text and is scanned like any other text.
  if (typeof value === "string" && path.endsWith(".dataUri")) {
    if (value.startsWith(SVG_DATA)) yield [path, Buffer.from(value.slice(SVG_DATA.length), "base64").toString("utf8")];
  } else if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
}

/** Scan everything that would be published for secrets and sensitive files. */
export function scanBundle(bundle: ReelBundle): Finding[] {
  const findings: Finding[] = [];
  for (const [where, text] of strings(bundle, "")) {
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(text)) findings.push({ severity: "block", where, message: `looks like a ${name}` });
    }
    if (where.endsWith(".path") && SENSITIVE_PATH.test(text)) {
      findings.push({ severity: "block", where, message: `references a sensitive file (${text})` });
    }
  }
  return findings;
}
