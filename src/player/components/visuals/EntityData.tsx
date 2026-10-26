import { formatValue } from "../../../core";
import type { ChartEntity, Entity, StatEntity } from "../../../schema";

/** "users.csv · sum of users by year, where region = EU" */
function provenance(e: ChartEntity | StatEntity): string | undefined {
  if (!e.data) return undefined;
  const d = e.data;
  const what = e.type === "chart" ? e.series.map((s) => s.column).filter(Boolean).join(", ") : (e.data?.column ?? "rows");
  const how = d.aggregate === "none" ? what : d.aggregate === "count" ? "count of rows" : `${d.aggregate} of ${what}`;
  const by = e.type === "chart" ? ` by ${e.data.category}` : "";
  const where = Object.entries(d.where).map(([k, v]) => `${k} = ${v}`).join(", ");
  return `${d.file} · ${how}${by}${where ? `, where ${where}` : ""}${d.scale !== 1 ? ` (× ${d.scale})` : ""}`;
}

/** The numbers and events behind a visual, as text: exact values and something a screen reader can read. */
export function EntityData({ entity }: { readonly entity: Entity }) {
  if (entity.type === "stat" && entity.data) {
    return (
      <section className="panel-section">
        <h3 className="section-label">Data</h3>
        <p className="mono-sub">{provenance(entity)}</p>
      </section>
    );
  }
  if (entity.type === "chart") {
    const from = provenance(entity);
    return (
      <section className="panel-section">
        <h3 className="section-label">Data</h3>
        {from && <p className="mono-sub">{from}</p>}
        <table className="inspect-data">
          <thead>
            <tr>
              <th />
              {entity.series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entity.categories.map((c, i) => (
              <tr key={c}>
                <th>{c}</th>
                {entity.series.map((s) => (
                  <td key={s.name}>{formatValue(s.values[i]!, entity.unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  if (entity.type === "time-axis") {
    const events = [...entity.events].sort((a, b) => a.at - b.at);
    return (
      <section className="panel-section">
        <h3 className="section-label">Events</h3>
        <ul className="inspect-events">
          {events.map((e, i) => (
            <li key={i}>
              <span className="inspect-when">{e.when ?? e.at}</span> {e.label}
              {e.detail && <span className="inspect-detail"> — {e.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (entity.type === "image" && (entity.credit || entity.caption)) {
    return (
      <section className="panel-section">
        <p className="mono-sub">{[entity.caption, entity.credit].filter(Boolean).join(" · ")}</p>
      </section>
    );
  }
  return null;
}
