import { calloutPoint, imageRect, partProgress, proportionalEm, type Rect } from "../../../core";
import type { ImageEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

const CALLOUT = { font: 17, padX: 10, h: 32, offset: 22 } as const;

/** Place a callout's tag beside its point, flipping to stay inside the picture frame. */
function tagRect(point: { x: number; y: number; region?: Rect }, label: string, frame: Rect): Rect {
  const w = proportionalEm(label) * CALLOUT.font + 2 * CALLOUT.padX;
  const anchorY = point.region ? point.region.y : point.y;
  const above = anchorY - CALLOUT.offset - CALLOUT.h >= frame.y;
  const y = above ? anchorY - CALLOUT.offset - CALLOUT.h : (point.region ? point.region.y + point.region.h : point.y) + CALLOUT.offset;
  const x = Math.min(Math.max(point.x - w / 2, frame.x + 4), frame.x + frame.w - w - 4);
  return { x, y: Math.min(y, frame.y + frame.h - CALLOUT.h - 4), w, h: CALLOUT.h };
}

/** A picture from the reel's assets, with callouts that build in one by one. */
export function ImageNode(props: NodeProps & { readonly entity: ImageEntity }) {
  const { entity, box, state, assets } = props;
  const asset = assets[entity.src];
  if (!asset) {
    return (
      <NodeFrame {...props}>
        <span className="image-missing">{entity.alt}</span>
      </NodeFrame>
    );
  }
  const { frame, image } = imageRect(entity, asset, box);
  const n = entity.callouts.length;
  const footer = [entity.caption, entity.credit].filter(Boolean).join(" · ");
  return (
    <NodeFrame {...props}>
      <div className="image-frame" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
        <img src={asset.dataUri} alt={entity.alt} draggable={false} style={{ left: image.x - frame.x, top: image.y - frame.y, width: image.w, height: image.h }} />
      </div>
      {n > 0 && (
        <svg className="image-callouts" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
          {entity.callouts.map((c, i) => {
            const p = partProgress(state.reveal, i, n);
            const pt = calloutPoint(c, frame, image);
            if (p <= 0 || !pt.visible) return null;
            const tag = tagRect(pt, c.label, frame);
            const tagEdge = tag.y + tag.h <= (pt.region?.y ?? pt.y) ? tag.y + tag.h : tag.y;
            return (
              <g key={i} className="callout" style={{ opacity: p }}>
                {pt.region ? (
                  <rect className="callout-region" x={pt.region.x} y={pt.region.y} width={pt.region.w} height={pt.region.h} rx={6} />
                ) : (
                  <circle className="callout-dot" cx={pt.x} cy={pt.y} r={7 + 5 * (1 - p)} />
                )}
                <line className="callout-stem" x1={pt.x} y1={pt.region ? (tagEdge < pt.region.y ? pt.region.y : pt.region.y + pt.region.h) : pt.y} x2={Math.min(Math.max(pt.x, tag.x + 8), tag.x + tag.w - 8)} y2={tagEdge} />
                <rect className="callout-tag" x={tag.x} y={tag.y} width={tag.w} height={tag.h} rx={8} />
                <text className="callout-text" x={tag.x + tag.w / 2} y={tag.y + tag.h / 2 + CALLOUT.font * 0.36} textAnchor="middle">
                  {c.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {footer && <span className="image-caption">{footer}</span>}
    </NodeFrame>
  );
}
