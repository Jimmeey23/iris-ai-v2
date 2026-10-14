"use client";
import { Field } from "@/components/ui";
import { DEPARTMENT_RECORDS } from "@/lib/constants";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsRoutingPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { cfg, set, booleanSetting, staff } = model;
  if (!cfg) return null;
  return (
    <>
      <section className="card card-pad">
        <h2>Rules that put care in the right hands</h2>
        {booleanSetting(
          "autoAssign",
          "Automatically assign an owner",
          "Match active staff to the category’s department and studio. Switch off to use an unassigned departmental queue.",
        )}
        {booleanSetting(
          "autoTag",
          "Intelligent ticket tags",
          "Automatically tag category, issue, studio, type, priority and Momence links.",
        )}
        {booleanSetting(
          "positiveNoSla",
          "No SLA for positive feedback",
          "Compliments and positive feedback are record-only, without resolution tasks. Assessments are always record-only.",
        )}
        <h3 style={{ marginTop: 23, marginBottom: 14 }}>
          Follow-up targets · hours
        </h3>
        <div className="form-grid">
          {(["critical", "high", "medium", "low"] as const).map((p) => (
            <Field key={p} label={p[0].toUpperCase() + p.slice(1)}>
              <input
                type="number"
                min={1}
                max={720}
                value={cfg.responseHours[p]}
                onChange={(e) =>
                  set("responseHours", {
                    ...cfg.responseHours,
                    [p]: Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
        </div>
      </section>
      <section className="card card-pad">
        <h2>Category routing</h2>
        <p
          className="secondary"
          style={{ fontSize: 12, marginTop: 6, marginBottom: 20 }}
        >
          Set a department and optional fixed owner. Otherwise Iris chooses an
          active studio specialist.
        </p>
        {Object.keys(cfg.taxonomy).map((cat) => (
          <div className="setting-row" key={cat}>
            <div className="grow">
              <h4>{cat}</h4>
            </div>
            <div className="flex-row wrap">
              <select
                aria-label={cat + " department"}
                value={cfg.categoryDepartments[cat] || ""}
                onChange={(e) =>
                  set("categoryDepartments", {
                    ...cfg.categoryDepartments,
                    [cat]: e.target.value,
                  })
                }
              >
                {DEPARTMENT_RECORDS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={cat + " owner"}
                value={cfg.routingOwners[cat] || ""}
                onChange={(e) => {
                  const owners = { ...cfg.routingOwners };
                  if (e.target.value) owners[cat] = Number(e.target.value);
                  else delete owners[cat];
                  set("routingOwners", owners);
                }}
              >
                <option value="">Studio-aware owner</option>
                {staff
                  .filter(
                    (p) =>
                      p.isActive &&
                      p.department ===
                        DEPARTMENT_RECORDS.find(
                          (d) => d.id === cfg.categoryDepartments[cat],
                        )?.name,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
