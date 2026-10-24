import { useRef, type PointerEvent } from "react";
import { formatClock, locate, sceneOffsets, totalDuration } from "../../core";
import type { Scene } from "../../schema";
import { RATES, type PlayerEvent, type PlayerState } from "../state";
import { Icon } from "./Icon";

interface ControlsProps {
  readonly scenes: readonly Scene[];
  readonly state: PlayerState;
  readonly dispatch: (e: PlayerEvent) => void;
}

export function Controls({ scenes, state, dispatch }: ControlsProps) {
  const track = useRef<HTMLDivElement>(null);
  const total = totalDuration(scenes);
  const offsets = sceneOffsets(scenes);
  const global = (offsets[state.index] ?? 0) + state.tMs;

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const pos = locate(scenes, ((e.clientX - r.left) / r.width) * total);
    dispatch({ type: "seek", index: pos.index, tMs: pos.tMs });
  };
  const nextRate = RATES[(RATES.indexOf(state.rate as (typeof RATES)[number]) + 1) % RATES.length]!;
  const atStart = state.index === 0;
  const atEnd = state.index === scenes.length - 1;

  return (
    <div className="controls">
      <div className="transport">
        <button className="icon-btn" aria-label="Previous scene" disabled={atStart && state.tMs < 1} onClick={() =>
          dispatch({ type: "seek", index: state.tMs > 1500 ? state.index : state.index - 1, tMs: 0 })
        }>
          <Icon name="prev" />
        </button>
        <button className="icon-btn is-primary" aria-label={state.playing ? "Pause" : "Play"} onClick={() => dispatch({ type: "toggle" })}>
          <Icon name={state.playing ? "pause" : "play"} size={20} />
        </button>
        <button className="icon-btn" aria-label="Next scene" disabled={atEnd} onClick={() => dispatch({ type: "seek", index: state.index + 1, tMs: 0 })}>
          <Icon name="next" />
        </button>
      </div>
      <div
        className="scrubber"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.round(global)}
        aria-valuetext={`${formatClock(global)} of ${formatClock(total)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e)}
      >
        {scenes.map((s, i) => {
          const fill = i < state.index ? 1 : i > state.index ? 0 : state.tMs / s.durationMs;
          return (
            <div key={s.id} className={`chapter${i === state.index ? " is-current" : ""}`} style={{ flexGrow: s.durationMs }} title={s.title}>
              <div className="chapter-fill" style={{ transform: `scaleX(${fill})` }} />
            </div>
          );
        })}
      </div>
      <div className="clock" aria-live="off">
        <span className="clock-now">{formatClock(global)}</span>
        <span className="clock-sep">/</span>
        <span>{formatClock(total)}</span>
      </div>
      <button className="rate-btn" aria-label={`Playback speed ${state.rate}x`} onClick={() => dispatch({ type: "rate", rate: nextRate })}>
        {state.rate}×
      </button>
    </div>
  );
}
