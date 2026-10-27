import { CHART, chartLayout, clamp01, partEmphasis } from "../../../core";
import type { ChartEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

const pathOf = (pts: readonly { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");

/** Bars, columns, lines or areas, drawn from the same geometry validate checks. */
export function ChartNode(props: NodeProps & { readonly entity: ChartEntity }) {
  const { entity, box, state } = props;
  const n = entity.categories.length;
  // Stepped, a line is drawn up to the newest category shown.
  const drawn = state.steps === null ? state.reveal : n > 1 ? clamp01((state.steps - 1) / (n - 1)) : clamp01(state.steps);
  const l = chartLayout(entity, box, drawn, state.steps);
  const anyHl = Object.values(state.items).some((v) => v.highlight > 0.5);
  const emph = (i: number) => {
    const em = partEmphasis(state.items, i);
    return { hl: em.highlight > 0.5, muted: anyHl ? em.highlight <= 0.5 : em.dim > 0.3 };
  };
  return (
    <NodeFrame {...props}>
      <svg className="chart" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
        {entity.title && l.titleY !== undefined && (
          <text className="chart-title" x={CHART.pad} y={l.titleY}>
            {entity.title}
          </text>
        )}
        {l.legendY !== undefined &&
          l.legend.map((it) => (
            <g key={it.name} className={`tone-${it.tone}`}>
              <rect className="chart-swatch" x={it.x} y={l.legendY! - CHART.swatch / 2} width={CHART.swatch} height={CHART.swatch} rx={3} />
              <text className="chart-legend" x={it.x + CHART.swatch + 6} y={l.legendY! + CHART.legend * 0.35}>
                {it.name}
              </text>
            </g>
          ))}
        {l.gridlines.map((g, i) => (
          <line key={i} className="chart-grid" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
        ))}
        {l.ticks.map((t, i) => (
          <text key={i} className="chart-tick" x={t.x} y={t.y} textAnchor={t.anchor}>
            {t.text}
          </text>
        ))}
        {l.bars.map((b) => (
          <g key={`${b.series}-${b.category}`} className={`tone-${emph(b.category).hl && l.bars.every((x) => x.series === 0) ? "accent" : b.tone}${(anyHl ? emph(b.category).muted : b.muted || emph(b.category).muted) ? " is-muted" : ""}`}>
            <rect className="chart-bar" x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(5, b.w / 3, b.h / 2)} />
            {b.label && (
              <text className="chart-value" x={b.label.x} y={b.label.y} textAnchor={b.label.anchor}>
                {b.label.text}
              </text>
            )}
          </g>
        ))}
        {l.lines.map((line) => (
          <g key={line.series} className={`tone-${line.tone}`}>
            {entity.kind === "area" && (
              <linearGradient id={`${entity.id}-fill-${line.series}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className="area-top" />
                <stop offset="100%" className="area-bottom" />
              </linearGradient>
            )}
            {entity.kind === "area" && (
              <path
                className="chart-area"
                fill={`url(#${entity.id}-fill-${line.series})`}
                d={`${pathOf(line.points)}L${line.points.at(-1)!.x},${line.baseY}L${line.points[0]!.x},${line.baseY}Z`}
                style={{ clipPath: `inset(0 ${((1 - drawn) * 100).toFixed(2)}% 0 0)` }}
              />
            )}
            <path className="chart-line" d={pathOf(line.points)} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - drawn} />
            {line.points.map((p, i) =>
              i / Math.max(1, line.points.length - 1) <= drawn + 1e-6 ? <circle key={i} className={`chart-dot${emph(i).hl ? " is-hl" : ""}`} cx={p.x} cy={p.y} r={emph(i).hl ? 8 : 5} /> : null,
            )}
            {line.endLabel && (
              <text className="chart-value" x={line.endLabel.x} y={line.endLabel.y} textAnchor="end">
                {line.endLabel.text}
              </text>
            )}
          </g>
        ))}
        {l.labels.map((t, i) => (
          <text key={i} className={`chart-label${(anyHl ? emph(i).muted : t.muted) ? " is-muted" : ""}${emph(i).hl || (!anyHl && entity.highlight.includes(t.full)) ? " is-hl" : ""}`} x={t.x} y={t.y} textAnchor={t.anchor}>
            {t.text}
            {t.truncated && <title>{t.full}</title>}
          </text>
        ))}
      </svg>
    </NodeFrame>
  );
}
