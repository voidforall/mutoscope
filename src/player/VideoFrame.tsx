import { captionAt } from "../core";
import type { ReelBundle } from "../schema";
import { Stage } from "./components/Stage";
import type { PlayerState } from "./state";

const NO_THREADS: ReadonlyMap<string, number> = new Map();

/** Chrome-free 1920×1080 layout used for frame-accurate video export. */
export function VideoFrame({ bundle, state }: { readonly bundle: ReelBundle; readonly state: PlayerState }) {
  const scene = bundle.scenes[state.index]!;
  return (
    <div className="video-frame">
      <div className="video-stage">
        <Stage scene={scene} tMs={state.tMs} threadCounts={NO_THREADS} onSelect={() => undefined} />
      </div>
      <div className="video-band">
        <div className="scene-tag">
          <span className="scene-tag-num">{String(state.index + 1).padStart(2, "0")}</span>
          {scene.kicker && <span className="scene-tag-kicker">{scene.kicker}</span>}
          <span className="scene-tag-title">{scene.title}</span>
          <span className="video-reel-title">{bundle.manifest.title}</span>
        </div>
        <p className="video-caption">{captionAt(scene, state.tMs)}</p>
      </div>
    </div>
  );
}
