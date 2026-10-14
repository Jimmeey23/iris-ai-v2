"use client";
import { Badge,Loading } from "@/components/ui";
import { display } from "@/lib/display";
import { ArrowUpRight,RefreshCw } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsDatabasePanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const {
    setTableBusy,
    rows,
    table,
    loadTable,
    setTable,
    tableBusy,
    setEdit,
    setEditJson,
  } = model;

  return (
    <section className="card card-pad">
      <div className="between">
        <div>
          <h2>Database explorer</h2>
          <p className="secondary" style={{ fontSize: 12, marginTop: 5 }}>
            Inspect data and safely edit staff, department and template records.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => void loadTable()}>
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      <div className="flex-row" style={{ margin: "20px 0" }}>
        <select
          value={table}
          onChange={(e) => {
            setTableBusy(true);
            setTable(e.target.value);
          }}
        >
          {[
            "staff",
            "departments",
            "templates",
            "tickets",
            "audit",
            "deliveries",
            "imports",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Badge
          tone={
            ["staff", "departments", "templates"].includes(table) ? "blue" : ""
          }
        >
          {["staff", "departments", "templates"].includes(table)
            ? "Editable · validated"
            : "Read-only · use dedicated controls"}
        </Badge>
        <span className="muted" style={{ fontSize: 10 }}>
          {rows.length} records loaded
        </span>
      </div>
      {tableBusy ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>RECORD</th>
                <th>DETAILS</th>
                <th>IDENTIFIER</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={String(r.id || i)}
                  onClick={() => {
                    setEdit(r);
                    setEditJson(JSON.stringify(r, null, 2));
                  }}
                >
                  <td>
                    {display(
                      r.name ||
                        r.title ||
                        r.action ||
                        r.source ||
                        r.actorName ||
                        r.id,
                    )}
                  </td>
                  <td>
                    {display(
                      r.department ||
                        r.description ||
                        r.status ||
                        r.entity ||
                        r.email,
                    ).slice(0, 70)}
                  </td>
                  <td>{display(r.id)}</td>
                  <td>
                    <ArrowUpRight size={13} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 10, marginTop: 18 }}>
        Authentication hashes and private resolutions are excluded. Ticket
        writes use the ticket workflow, including owner checks and audit
        history.
      </p>
    </section>
  );
}
