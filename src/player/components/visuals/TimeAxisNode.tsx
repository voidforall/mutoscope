import { eventProgress, TIME_AXIS, timeAxisLayout } from "../../../core";
import type { TimeAxisEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

/** Events on an axis that draws left to right; each event arrives as the line reaches it. */
export function TimeAxisNode(props: NodeProps & { readonly entity: TimeAxisEntity }) {
  const { entity, box, state } = props;
  const l = timeAxisLayout(entity, box);
  const { x1, x2, y } = l.axis;
  const head = x1 + (x2 - x1) * Math.min(1, state.reveal * 1.12);
  return (
    <NodeFrame {...props}>
      <svg className="time-axis" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        {entity.title && l.titleY !== undefined && (
          <text className="chart-title" x={TIME_AXIS.pad} y={l.titleY}>
            {entity.title}
          </text>
        )}
        <line className="time-line" x1={x1 - TIME_AXIS.inset / 2} y1={y} x2={head} y2={y} />
        {l.spans.map((s, i) => {
          const w = Math.max(0, Math.min(s.w, head - s.x));
          return (
            w > 0 && (
              <g key={i} className={`tone-${s.tone ?? "muted"}`}>
                <rect className="time-span" x={s.x} y={y - TIME_AXIS.spanBar / 2} width={w} height={TIME_AXIS.spanBar} rx={TIME_AXIS.spanBar / 2} />
                {w >= s.w - 0.5 && (
                  <text className="time-span-label" x={s.x + s.w / 2} y={y + TIME_AXIS.spanLabelGap} textAnchor="middle">
                    {s.text}
                  </text>
                )}
              </g>
            )
          );
        })}
        {state.reveal >= 1 && <path className="time-arrow" d={`M${x2 + TIME_AXIS.inset / 2 - 10},${y - 6} L${x2 + TIME_AXIS.inset / 2},${y} L${x2 + TIME_AXIS.inset / 2 - 10},${y + 6}`} />}
        {l.events.map((e) => {
          const p = eventProgress(e.frac, state.reveal);
          if (p <= 0) return null;
          const stemEnd = e.above ? e.block.y + e.block.h + 4 : e.block.y - 4;
          const anchorX = Math.min(Math.max(e.x, e.block.x + 6), e.block.x + e.block.w - 6);
          const textX = e.block.x + e.block.w / 2;
          const top = e.block.y + TIME_AXIS.when;
          const labelY = top + TIME_AXIS.lineGap + TIME_AXIS.label * 1.05;
          return (
            <g key={e.index} className={`time-event tone-${e.tone ?? "accent"}`} style={{ opacity: p }}>
              <path className="time-stem" d={`M${e.x},${y} L${e.x},${(y + stemEnd) / 2} L${anchorX},${(y + stemEnd) / 2} L${anchorX},${stemEnd}`} />
              <circle className="time-dot" cx={e.x} cy={y} r={TIME_AXIS.dot} />
              <text className="time-when" x={textX} y={top} textAnchor="middle">
                {e.when}
              </text>
              <text className="time-label" x={textX} y={labelY} textAnchor="middle">
                {e.label}
              </text>
              {e.detail && (
                <text className="time-detail" x={textX} y={labelY + TIME_AXIS.lineGap + TIME_AXIS.detail * 1.25} textAnchor="middle">
                  {e.detail}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </NodeFrame>
  );
}
