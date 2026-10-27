import { iconSize } from "../../../core";
import type { IconEntity } from "../../../schema";
import { LucideIcon } from "../../icons/LucideIcon";
import { NodeFrame, type NodeProps } from "../NodeFrame";

/** A pictogram with an optional caption. */
export function IconNode(props: NodeProps & { readonly entity: IconEntity }) {
  const { entity, box } = props;
  return (
    <NodeFrame {...props}>
      <LucideIcon className="icon-glyph" name={entity.name} size={iconSize(entity, box)} strokeWidth={1.75} />
      {entity.label && <span className="icon-label">{entity.label}</span>}
      {entity.sublabel && <span className="icon-sub">{entity.sublabel}</span>}
    </NodeFrame>
  );
}
