import type { Manifest, SourceRef } from "../schema";

/** Resolve a ref's symbolic revision to the pinned SHA from the manifest. */
export function resolveRevision(manifest: Manifest, ref: SourceRef): string | undefined {
  if (ref.kind !== "code" || manifest.source.provider === "none") return undefined;
  if (ref.revision === "head") return manifest.source.headSha;
  if (ref.revision === "base") return manifest.source.baseSha;
  return ref.revision;
}

function repository(manifest: Manifest): string | undefined {
  return manifest.source.provider === "none" ? undefined : manifest.source.repository;
}

export function refLabel(ref: SourceRef): string {
  if (ref.kind === "url") return ref.title ?? ref.url;
  if (ref.startLine === undefined) return ref.path;
  return ref.endLine && ref.endLine !== ref.startLine
    ? `${ref.path}:${ref.startLine}-${ref.endLine}`
    : `${ref.path}:${ref.startLine}`;
}

/** A commit-pinned link to the source, or undefined when it cannot be linked. */
export function refHref(manifest: Manifest, ref: SourceRef): string | undefined {
  if (ref.kind === "url") return ref.url;
  const repo = repository(manifest);
  const sha = resolveRevision(manifest, ref);
  if (!repo || !sha) return undefined;
  const path = ref.path.split("/").map(encodeURIComponent).join("/");
  const lines =
    ref.startLine === undefined
      ? ""
      : ref.endLine && ref.endLine !== ref.startLine
        ? `#L${ref.startLine}-L${ref.endLine}`
        : `#L${ref.startLine}`;
  return `https://github.com/${repo}/blob/${sha}/${path}${lines}`;
}
