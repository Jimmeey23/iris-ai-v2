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
        <h2>Assignment rules</h2>
        {booleanSetting(
          "autoAssign",
          "Automatically assign an owner",
          "Match active staff to the category’s department and studio. Switch off to use an unassigned departmental queue.",
        )}
        {booleanSetting(
          "autoTag",
          "Automatic ticket tags",
          "Automatically tag category, issue, studio, type, priority and Momence links.",
        )}
        <p className="secondary">Entry type and action required are separate. Feedback and compliments default to record-only; staff can request action. Safety reports always require action.</p>
        <h3 style={{ marginTop: 23, marginBottom: 14 }}>
          Resolution targets · hours
        </h3>
        <div className="form-grid">
          {(["critical", "high", "medium", "low"] as const).map((p) => (
            <Field key={p} label={p[0].toUpperCase() + p.slice(1)}>
              <input
                type="number"
                min={12}
                max={72}
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
      <section className="card card-pad">
        <h2>Escalation matrix — where a breached ticket goes</h2>
        <p className="secondary">
          One rule: when a ticket needing resolution sits <strong>{cfg.escalateAfterBreachHours || 0}h</strong> past its target with no extension, IRIS raises it to critical and reassigns it. First to the owner&apos;s reporting manager; when no manager is on file, to the department&apos;s fallback below. Set the fallback per department — leave empty only if that department should never escalate via fallback.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {DEPARTMENT_RECORDS.filter((d) => d.active).map((dept) => {
            const current = (cfg.escalationOwnerIds as Record<string, number | undefined>)[dept.id];
            return (
              <div key={dept.id} className="setting-row" style={{ alignItems: "center" }}>
                <div className="grow">
                  <h4>{dept.name}</h4>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {current
                      ? `When a ${dept.name} ticket has no reporting manager, it goes to ${staff.find((p) => p.id === current)?.name ?? `#${current}`}.`
                      : `No fallback — tickets with no manager stay put and only raise priority.`}
                  </p>
                </div>
                <div style={{ minWidth: 190 }}>
                  <select
                    aria-label={`${dept.name} escalation owner`}
                    value={current ? String(current) : ""}
                    onChange={(e) => {
                      const next = { ...(cfg.escalationOwnerIds as Record<string, number>) };
                      if (e.target.value) next[dept.id] = Number(e.target.value);
                      else delete next[dept.id];
                      set("escalationOwnerIds", next as unknown as typeof cfg.escalationOwnerIds);
                    }}
                  >
                    <option value="">No fallback</option>
                    {staff
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.department === dept.name ? "· " + dept.name : `· ${p.department}`}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
        <p className="secondary" style={{ fontSize: 11, marginTop: 12 }}>
          Tip: the reporting manager is read from <code>staff.manager</code> in the directory. Use a full name that matches someone in IRIS — first-name-only can be ambiguous and will be treated as no match.
        </p>
      </section>
      <section className="card card-pad">
        <h2>Assignment precedence and coverage</h2>
        <p className="secondary">Form owner override → studio/category override → category override → eligible city pool → studio coverage and workload. If no eligible owner is available, the ticket stays in the responsible department queue. Manual exceptions require an administrator’s reason.</p>
        <details><summary>City owner pools</summary>
          {DEPARTMENT_RECORDS.filter(d=>d.active).map(dept=><div key={dept.id}><h3>{dept.name}</h3>{(['mumbai','bengaluru'] as const).map(city=><Field key={city} label={city==='mumbai'?'Mumbai owners':'Bengaluru owners'}><select multiple value={(cfg.cityOwnerIds[dept.id]?.[city]||[]).map(String)} onChange={e=>set('cityOwnerIds',{...cfg.cityOwnerIds,[dept.id]:{mumbai:cfg.cityOwnerIds[dept.id]?.mumbai||[],bengaluru:cfg.cityOwnerIds[dept.id]?.bengaluru||[],[city]:Array.from(e.target.selectedOptions,o=>Number(o.value))}})}>{staff.filter(p=>p.isActive&&p.department===dept.name).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>)}</div>)}
        </details>
        <details><summary>Explicit staff studio coverage</summary><p>Leave a person unset to use their directory location. An explicitly empty selection means no studio coverage.</p>
          {staff.filter(p=>p.isActive).map(person=><Field key={person.id} label={person.name}><select multiple value={cfg.staffStudioCoverage[String(person.id)]||[]} onChange={e=>set('staffStudioCoverage',{...cfg.staffStudioCoverage,[String(person.id)]:Array.from(e.target.selectedOptions,o=>o.value)})}>{cfg.studios.map(studio=><option key={studio}>{studio}</option>)}</select><button type="button" className="text-btn" onClick={()=>{const next={...cfg.staffStudioCoverage};delete next[String(person.id)];set('staffStudioCoverage',next);}}>Use directory coverage</button></Field>)}
        </details>
      </section>
    </>
  );
}
