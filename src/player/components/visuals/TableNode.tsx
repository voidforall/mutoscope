import { partProgress, tableLayout } from "../../../core";
import type { TableEntity } from "../../../schema";
import { NodeFrame, type NodeProps } from "../NodeFrame";

/** A small table whose rows slide in one after another. */
export function TableNode(props: NodeProps & { readonly entity: TableEntity }) {
  const { entity, box, state } = props;
  const l = tableLayout(entity, box);
  const total = l.colWidths.reduce((a, b) => a + b, 0);
  const align = (i: number) => entity.align?.[i] ?? "start";
  const highlighted = new Set(entity.highlightRows);
  return (
    <NodeFrame {...props}>
      {entity.title && <span className="table-title">{entity.title}</span>}
      <table className="data-table">
        <colgroup>
          {l.colWidths.map((w, i) => (
            <col key={i} style={{ width: `${((w / total) * 100).toFixed(3)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {entity.columns.map((c, i) => (
              <th key={i} className={`align-${align(i)}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entity.rows.map((row, r) => {
            const p = partProgress(state.reveal, r, entity.rows.length);
            return (
              <tr key={r} className={highlighted.has(r) ? "is-hl" : undefined} style={{ opacity: p, transform: `translateY(${((1 - p) * 10).toFixed(2)}px)` }}>
                {row.map((cell, i) => (
                  <td key={i} className={`align-${align(i)}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </NodeFrame>
  );
}
