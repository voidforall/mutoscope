import { createHash } from "node:crypto";
import { LIVE_ELEMENT_ID, type LiveConfig, type ReelBundle } from "../../schema";

/** JSON that is safe inside a <script> element (no `</script>`, no line separators). */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("base64");

/**
 * One self-contained page. The CSP allows exactly the bundled player script
 * (by hash) and no network access at all, so reel content can never load or
 * exfiltrate anything even if a string slipped past validation. A page served
 * by a local live session (`live`) may additionally talk to its own origin —
 * and nothing else.
 */
export function renderReelHtml(bundle: ReelBundle, playerJs: string, playerCss: string, live?: LiveConfig): string {
  const js = playerJs.replace(/<\/script/gi, "<\\/script");
  const css = playerCss.replace(/<\/style/gi, "<\\/style");
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${sha256(js)}'`,
    `style-src 'sha256-${sha256(css)}'`,
    "img-src data:",
    "font-src data:",
    ...(live ? ["connect-src 'self'"] : []),
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const { manifest } = bundle;
  const description = manifest.subtitle ?? `${manifest.title} — an interactive mutoscope reel`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="mutoscope">
<meta name="description" content="${escapeHtml(description)}">
<title>${escapeHtml(manifest.title)}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="mutoscope-reel">${scriptSafeJson(bundle)}</script>
${live ? `<script type="application/json" id="${LIVE_ELEMENT_ID}">${scriptSafeJson(live)}</script>\n` : ""}<script>${js}</script>
</body>
</html>
`;
}
