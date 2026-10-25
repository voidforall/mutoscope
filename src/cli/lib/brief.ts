import type { ReelBundle, ReelContext } from "../../schema";

export interface BriefQuestion {
  readonly text: string;
  readonly context: ReelContext;
  readonly [key: string]: unknown;
}

/**
 * Everything an agent needs to answer one question about one moment: the
 * resolved scene and entity, the analysis that depicts them, the approved
 * rationale and the pinned source. Shared by GitHub threads and live sessions.
 */
export function answerBrief(bundle: ReelBundle, question: BriefQuestion, note: string) {
  const { text, context, ...meta } = question;
  const scene = bundle.scenes.find((s) => s.id === context.sceneId);
  const entity = scene?.entities.find((e) => e.id === context.entityId);
  const units = (bundle.analysis?.units ?? []).filter((u) => entity && u.entities.includes(entity.id));
  const source = bundle.manifest.source;
  return {
    note,
    question: { ...meta, text },
    pinnedSource: source.provider === "none" ? null : { repository: source.repository ?? null, headSha: source.headSha, baseSha: source.baseSha ?? null },
    pinnedPages: bundle.manifest.documents.map((d) => ({ url: d.url, title: d.title ?? null, retrievedAt: d.retrievedAt, snapshot: "source/web/ in the reel directory" })),
    versionDrift: context.reelVersion !== bundle.manifest.version ? `asked on v${context.reelVersion}, local reel is v${bundle.manifest.version}` : null,
    anchor: context,
    scene: scene ? { id: scene.id, title: scene.title, narration: scene.narration, claims: scene.claims } : null,
    entity: entity ?? null,
    analysis: units,
    rationale: bundle.rationale ?? null,
  };
}
