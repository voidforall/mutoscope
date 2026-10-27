import { calloutPoint, calloutTag, CALLOUT, easeInOutCubic, imageRect, partEmphasis, partShown } from "../../../core";
import type { ImageEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

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
  const geo = imageRect(entity, asset, box);
  const { frame, view, full } = geo;
  // The visible part: the picture's view, clipped to the frame (cover can overflow it).
  const clipX = Math.max(frame.x, view.x);
  const clipY = Math.max(frame.y, view.y);
  const clip = { x: clipX, y: clipY, w: Math.min(frame.x + frame.w, view.x + view.w) - clipX, h: Math.min(frame.y + frame.h, view.y + view.h) - clipY };
  const n = entity.callouts.length;
  const footer = [entity.caption, entity.credit].filter(Boolean).join(" · ");
  return (
    <NodeFrame {...props}>
      <div className="image-frame" style={{ left: clip.x, top: clip.y, width: clip.w, height: clip.h }}>
        <img src={asset.dataUri} alt={entity.alt} draggable={false} style={{ left: full.x - clip.x, top: full.y - clip.y, width: full.w, height: full.h }} />
      </div>
      {n > 0 && (
        <svg className="image-callouts" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
          {entity.callouts.map((c, i) => {
            const em = partEmphasis(state.items, i);
            const p = easeInOutCubic(partShown(state, i, n)) * (1 - 0.65 * em.dim);
            const pt = calloutPoint(c, geo);
            if (p <= 0 || !pt.visible) return null;
            const tag = calloutTag(pt, c.label, frame, c.side);
            const r = pt.region ?? { x: pt.x, y: pt.y, w: 0, h: 0 };
            // The stem runs from the point (or the region's nearest edge) to the tag's nearest edge.
            const tx = Math.min(Math.max(pt.x, tag.x + 8), tag.x + tag.w - 8);
            const horizontal = tag.x >= r.x + r.w || tag.x + tag.w <= r.x;
            const from = horizontal ? { x: tag.x >= r.x + r.w ? r.x + r.w : r.x, y: Math.min(Math.max(tag.y + tag.h / 2, r.y), r.y + r.h) } : { x: pt.x, y: tag.y + tag.h <= r.y ? r.y : r.y + r.h };
            const to = horizontal ? { x: tag.x >= r.x + r.w ? tag.x : tag.x + tag.w, y: tag.y + tag.h / 2 } : { x: tx, y: tag.y + tag.h <= r.y ? tag.y + tag.h : tag.y };
            return (
              <g key={i} className={`callout${em.highlight > 0.5 ? " is-hl" : ""}`} style={{ opacity: p }}>
                {pt.region ? (
                  <rect className="callout-region" x={pt.region.x} y={pt.region.y} width={pt.region.w} height={pt.region.h} rx={6} />
                ) : (
                  <circle className="callout-dot" cx={pt.x} cy={pt.y} r={7 + 5 * (1 - p)} />
                )}
                <line className="callout-stem" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
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
