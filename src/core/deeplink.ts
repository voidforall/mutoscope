import type { Scene } from "../schema";

export interface DeepLink {
  readonly sceneId?: string;
  readonly tMs?: number;
  readonly entityId?: string;
}

export function parseDeepLink(search: string): DeepLink {
  const q = new URLSearchParams(search);
  const t = Number(q.get("t"));
  return {
    sceneId: q.get("scene") ?? undefined,
    tMs: Number.isFinite(t) && t >= 0 && q.has("t") ? Math.floor(t) : undefined,
    entityId: q.get("entity") ?? undefined,
  };
}

export interface ResolvedLink {
  readonly index: number;
  readonly tMs: number;
  readonly entityId?: string;
}

/** Unknown scenes fall back to the entry scene; unknown entities are dropped. */
export function resolveDeepLink(scenes: readonly Scene[], entrySceneId: string | undefined, link: DeepLink): ResolvedLink {
  const byId = (id: string | undefined) => (id ? scenes.findIndex((s) => s.id === id) : -1);
  const requested = byId(link.sceneId);
  const index = requested >= 0 ? requested : Math.max(0, byId(entrySceneId));
  const scene = scenes[index]!;
  const tMs = requested >= 0 ? Math.min(link.tMs ?? 0, scene.durationMs) : 0;
  const entityId = requested >= 0 && scene.entities.some((e) => e.id === link.entityId) ? link.entityId : undefined;
  return { index, tMs, entityId };
}

export function buildDeepLink(base: string, link: DeepLink): string {
  const url = new URL(base);
  url.search = "";
  if (link.sceneId) url.searchParams.set("scene", link.sceneId);
  if (link.tMs !== undefined) url.searchParams.set("t", String(Math.floor(link.tMs)));
  if (link.entityId) url.searchParams.set("entity", link.entityId);
  return url.toString();
}
