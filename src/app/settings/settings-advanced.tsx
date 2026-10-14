"use client";
import { Badge } from "@/components/ui";
import { configSchema } from "@/lib/settings-contract";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsAdvancedPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { data, rows, setCfg, notify, raw, setRaw } = model;

  return (
    <section className="card card-pad">
      <div className="between">
        <div>
          <h2>Configuration, without the guesswork</h2>
          <p className="secondary" style={{ fontSize: 12, marginTop: 5 }}>
            Edit taxonomy, studio lists, trainers, class formats, packages and
            workspace policies.
          </p>
        </div>
        <Badge tone="blue">Revision {data?.version}</Badge>
      </div>
      <div className="info-box warning" style={{ margin: "20px 0" }}>
        Apply JSON to the editor, then Save changes to persist it. Unknown
        fields are not accepted as executable configuration. Existing ticket
        history is preserved.
      </div>
      <textarea
        className="code-editor"
        rows={22}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button
        className="btn"
        style={{ marginTop: 14 }}
        onClick={() => {
          try {
            setCfg(configSchema.parse(JSON.parse(raw)));
            notify(
              "JSON applied locally. Save changes to validate and persist.",
            );
          } catch {
            notify("The JSON is invalid. Please correct it.", "error");
          }
        }}
      >
        Apply JSON to editor
      </button>
      <Link
        className="text-btn"
        href="/integrations"
        style={{ marginLeft: 20 }}
      >
        Secrets live in Integrations, not here <LockKeyhole size={12} />
      </Link>
    </section>
  );
}
