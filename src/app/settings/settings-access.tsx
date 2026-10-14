"use client";
import { Avatar,Switch } from "@/components/ui";
import { LockKeyhole,Plus } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsAccessPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { user, data, table, staff, setInvite, updateAccount } = model;

  if (!user) return null;
  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>People & access</h2>
          <p>Real identities. Explicit permissions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setInvite(true)}>
          <Plus size={13} />
          Add account
        </button>
      </div>
      <div style={{ padding: "0 22px 20px" }} className="info-box">
        <LockKeyhole size={14} />
        Admins manage settings and live integrations. Agents manage tickets.
        Viewers can read tickets. Resolution access additionally requires the
        matching assigned staff profile.
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>USER</th>
              <th>ACCESS LEVEL</th>
              <th>STAFF PROFILE</th>
              <th>ACTIVE</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="flex-row">
                    <Avatar name={a.name} />
                    <div>
                      {a.name}
                      <p className="muted" style={{ fontSize: 10 }}>
                        {a.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <select
                    value={a.role}
                    disabled={a.id === user.id}
                    onChange={(e) =>
                      void updateAccount(a.id, {
                        role: e.target.value,
                      })
                    }
                    style={{ fontSize: 11, padding: 6 }}
                  >
                    {["admin", "manager", "agent"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={a.staffId || ""}
                    onChange={(e) =>
                      void updateAccount(a.id, {
                        staffId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    style={{
                      fontSize: 11,
                      padding: 6,
                      maxWidth: 170,
                    }}
                  >
                    <option value="">Not linked</option>
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Switch
                    checked={a.active}
                    onChange={(v) => void updateAccount(a.id, { active: v })}
                    label={"Account active for " + a.name}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
