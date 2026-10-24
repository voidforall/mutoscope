import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { diffLines, type EntityState, type Rect } from "../../core";
import type { BoxedEntity, Entity } from "../../schema";
import { emphasisStyle } from "./emphasis";
import { fitMono } from "./fit";

interface NodeProps {
  readonly entity: BoxedEntity;
  readonly state: EntityState;
  readonly box: Rect;
  readonly selected: boolean;
  readonly threadCount: number;
  readonly onSelect: (id: string) => void;
}

/** Bleed around each node so selection rings and thread badges are not clipped by the foreignObject. */
const BLEED = 16;

function NodeFrame({ entity, state, box, selected, threadCount, onSelect, children }: NodeProps & { children: ReactNode }) {
  const select = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    onSelect(entity.id);
  };
  return (
    <foreignObject
      x={box.x - BLEED}
      y={box.y - BLEED}
      width={box.w + 2 * BLEED}
      height={box.h + 2 * BLEED}
      style={{ ...emphasisStyle(state, selected), ["--bleed" as string]: `${BLEED}px` }}
    >
      <div
        className={`node node-${entity.type} tone-${entity.tone}${selected ? " is-selected" : ""}`}
        data-entity={entity.id}
        role="button"
        tabIndex={state.opacity < 0.2 ? -1 : 0}
        aria-label={`Inspect ${accessibleName(entity)}`}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(e)}
      >
        {children}
        {threadCount > 0 && (
          <span className="thread-dot" title={`${threadCount} discussion${threadCount > 1 ? "s" : ""}`}>
            {threadCount}
          </span>
        )}
      </div>
    </foreignObject>
  );
}

export function accessibleName(e: Entity): string {
  if (e.type === "label") return e.text.slice(0, 60);
  return ("label" in e && e.label) || e.id;
}

const CODE_CHROME = { header: 38, pad: 28, gutter: 3.2 };

function CodeLines({ lines, start, highlight, fontSize, kinds }: {
  lines: readonly string[];
  start: number;
  highlight: ReadonlySet<number>;
  fontSize: number;
  kinds?: readonly string[];
}) {
  return (
    <pre className="code-lines" style={{ fontSize }}>
      {lines.map((line, i) => {
        const n = start + i;
        const kind = kinds?.[i];
        const cls = `code-line${highlight.has(n) ? " is-hl" : ""}${kind && kind !== "same" ? ` is-${kind}` : ""}`;
        return (
          <span className={cls} key={i}>
            <span className="ln">{kinds ? (kind === "removed" ? "−" : kind === "added" ? "+" : " ") : n}</span>
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
          <span className={`label-text size-${entity.size} align-${entity.align}`}>{entity.text}</span>
        </NodeFrame>
      );
    case "code-block": {
      const lines = entity.code.split("\n");
      const fs = fitMono(
        lines.map((l) => `${l}    `),
        box.w - CODE_CHROME.pad - CODE_CHROME.gutter * 17,
        box.h - CODE_CHROME.header - CODE_CHROME.pad,
      );
      return (
        <NodeFrame {...props}>
          {entity.label && <span className="code-head">{entity.label}</span>}
          <CodeLines lines={lines} start={entity.startLine} highlight={new Set(entity.highlightLines)} fontSize={fs} />
        </NodeFrame>
      );
    }
    case "diff-panel": {
      const d = diffLines(entity.before, entity.after);
      const rows = Math.max(d.before.length, d.after.length);
      const colWidth = (box.w - CODE_CHROME.pad - 24) / 2 - CODE_CHROME.gutter * 17;
      const bodyHeight = box.h - CODE_CHROME.header - CODE_CHROME.pad - 30;
      const widest = [...d.before, ...d.after].map((l) => `${l.text}  `);
      const fsRows = Math.min(fitMono(widest, colWidth, Number.POSITIVE_INFINITY), bodyHeight / (rows * 1.5));
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
  }
}
