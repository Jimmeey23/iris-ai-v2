"use client";
import { ShieldCheck } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsGeneralPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { cfg, set, data } = model;
  if (!cfg) return null;
  return (
    <section className="card card-pad">
      <h2>Workspace essentials</h2>
      <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
        The foundation for your connected care team.
      </p>
      <div className="setting-row">
        <div>
          <h4>Workspace name</h4>
          <p>The organization identity used throughout Iris.</p>
        </div>
        <input
          value={cfg.workspaceName}
          onChange={(e) => set("workspaceName", e.target.value)}
        />
      </div>
      <div className="setting-row">
        <div>
          <h4>Timezone</h4>
          <p>Display and reporting timezone.</p>
        </div>
        <select
          value={cfg.timezone}
          onChange={(e) => set("timezone", e.target.value)}
        >
          {["Asia/Kolkata", "UTC", "Asia/Dubai", "Europe/London"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <h4>Refresh interval</h4>
          <p>
            How often the command center fetches updated tickets (5–120
            seconds).
          </p>
        </div>
        <input
          type="number"
          min={5}
          max={120}
          value={cfg.pollSeconds}
          onChange={(e) => set("pollSeconds", Number(e.target.value))}
        />
      </div>
      <div className="info-box" style={{ marginTop: 18 }}>
        <ShieldCheck size={14} />
        Changes are validated, versioned and audited. Revision{" "}
        {data?.version || 0}.
      </div>
    </section>
  );
}
