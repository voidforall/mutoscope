import { codeBlockFont, diffLines, diffPanelFont, isElision, quoteFont } from "../../core";
import { NodeFrame, type NodeProps } from "./NodeFrame";
import { ChartNode } from "./visuals/ChartNode";
import { HeadlineNode, RevealText, StatNode } from "./visuals/TextNodes";
import { ImageNode } from "./visuals/ImageNode";
import { TableNode } from "./visuals/TableNode";
import { TimeAxisNode } from "./visuals/TimeAxisNode";

export { accessibleName, type NodeProps } from "./NodeFrame";

function CodeLines({ lines, start, highlight, fontSize, kinds, lineNumbers = true }: {
  lines: readonly string[];
  start: number;
  highlight: ReadonlySet<number>;
  fontSize: number;
  kinds?: readonly string[];
  lineNumbers?: boolean;
}) {
  return (
    <pre className={`code-lines${lineNumbers ? "" : " no-ln"}`} style={{ fontSize }}>
      {lines.map((line, i) => {
        const n = start + i;
        // An omission marker is neither added nor removed code: show it neutral, without a +/− gutter.
        const kind = kinds && isElision(line) ? "elided" : kinds?.[i];
        const cls = `code-line${highlight.has(n) ? " is-hl" : ""}${kind && kind !== "same" ? ` is-${kind}` : ""}`;
        return (
          <span className={cls} key={i}>
            {lineNumbers && <span className="ln">{kinds ? (kind === "removed" ? "−" : kind === "added" ? "+" : " ") : n}</span>}
            <span className="lt">{line || " "}</span>
          </span>
        );
      })}
    </pre>
  );
}

export function EntityNode(props: NodeProps) {
  const { entity, box } = props;
  switch (entity.type) {
    case "component":
      return (
        <NodeFrame {...props}>
          <span className="node-title">{entity.label}</span>
          {entity.sublabel && <span className="node-sub">{entity.sublabel}</span>}
        </NodeFrame>
      );
    case "label":
      return (
        <NodeFrame {...props}>
          <span className={`label-text size-${entity.size} align-${entity.align}`}>
            <RevealText text={entity.text} mode={entity.reveal} reveal={props.state.reveal} />
          </span>
        </NodeFrame>
      );
    case "code-block": {
      const lines = entity.code.split("\n");
      const fs = codeBlockFont(entity, box);
      return (
        <NodeFrame {...props}>
          {entity.label && <span className="code-head">{entity.label}</span>}
          <CodeLines lines={lines} start={entity.startLine} highlight={new Set(entity.highlightLines)} fontSize={fs} lineNumbers={entity.lineNumbers} />
        </NodeFrame>
      );
    }
    case "quote":
      return (
        <NodeFrame {...props}>
          <blockquote className="quote-text" style={{ fontSize: quoteFont(entity.text, Boolean(entity.attribution), box) }}>
            “{entity.text}”
          </blockquote>
          {entity.attribution && <span className="quote-attrib">— {entity.attribution}</span>}
        </NodeFrame>
      );
    case "diff-panel": {
      const d = diffLines(entity.before, entity.after);
      const fsRows = diffPanelFont(entity, box);
      return (
        <NodeFrame {...props}>
          {entity.label && <span className="code-head">{entity.label}</span>}
          <div className="diff-cols">
            <div className="diff-col">
              <span className="diff-tag is-removed">Before</span>
              <CodeLines lines={d.before.map((l) => l.text)} start={1} highlight={new Set()} fontSize={fsRows} kinds={d.before.map((l) => l.kind)} />
            </div>
            <div className="diff-col">
              <span className="diff-tag is-added">After</span>
              <CodeLines lines={d.after.map((l) => l.text)} start={1} highlight={new Set()} fontSize={fsRows} kinds={d.after.map((l) => l.kind)} />
            </div>
          </div>
        </NodeFrame>
      );
    }
    case "headline":
      return <HeadlineNode {...props} entity={entity} />;
    case "stat":
      return <StatNode {...props} entity={entity} />;
    case "chart":
      return <ChartNode {...props} entity={entity} />;
    case "time-axis":
      return <TimeAxisNode {...props} entity={entity} />;
    case "image":
      return <ImageNode {...props} entity={entity} />;
    case "table":
      return <TableNode {...props} entity={entity} />;
  }
}
