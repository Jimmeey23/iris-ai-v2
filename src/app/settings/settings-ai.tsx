"use client";
import { Field } from "@/components/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsAiPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { cfg, set, booleanSetting, rows } = model;
  if (!cfg) return null;
  return (
    <section className="card card-pad">
      <h2>Intelligence with a human touch</h2>
      {booleanSetting(
        "aiEnabled",
        "Enable OpenAI assistance",
        "Use your connected OpenAI model for extraction, personalisation and next-question phrasing. Guided assistance remains available without a key.",
      )}
      <div className="setting-row">
        <div>
          <h4>Model</h4>
          <p>A model available to your OpenAI API project.</p>
        </div>
        <input
          value={cfg.aiModel}
          onChange={(e) => set("aiModel", e.target.value)}
          placeholder="gpt-4o-mini"
        />
      </div>
      <Field
        label="Iris personality & communication guidance"
        hint="Core privacy, one-question-at-a-time and approval rules still apply."
      >
        <textarea
          rows={5}
          value={cfg.aiVoice}
          onChange={(e) => set("aiVoice", e.target.value)}
        />
      </Field>
      {booleanSetting(
        "historyRetrieval",
        "Learn from historical examples",
        "Retrieve relevant imported examples while chatting. This does not fine-tune or retrain an OpenAI model.",
      )}
      <Link className="text-btn" href="/integrations" style={{ marginTop: 18 }}>
        Manage the OpenAI connection <ArrowUpRight size={12} />
      </Link>
    </section>
  );
}
