"use client";
import { Field } from "@/components/ui";
import { type WorkspaceConfig } from "@/lib/settings-contract";
import { CheckCircle2 } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsWorkspaceAppearancePanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { cfg, set } = model;
  if (!cfg) return null;
  return (
    <>
      <section className="card card-pad">
        <h2>Workspace defaults</h2>
        <div className="setting-row">
          <div>
            <h4>Default theme for new visitors</h4>
            <p>Individual preferences override this default.</p>
          </div>
          <select
            value={cfg.defaultTheme}
            onChange={(e) =>
              set("defaultTheme", e.target.value as "light" | "dark")
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Default ticket layout</h4>
            <p>Saved views take precedence.</p>
          </div>
          <select
            value={cfg.defaultView}
            onChange={(e) =>
              set(
                "defaultView",
                e.target.value as WorkspaceConfig["defaultView"],
              )
            }
          >
            <option value="list">List</option>
            <option value="board">Board</option>
            <option value="cards">Cards</option>
          </select>
        </div>
      </section>
      <section className="card card-pad">
        <h2>Extended design controls</h2>
        <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
          Tune style, layout rhythm, shadows, shapes and spacing across the app.
          Saved changes are permanent and applied workspace-wide.
        </p>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <Field label="Accent palette">
            <select
              value={cfg.appearancePreset}
              onChange={(e) =>
                set(
                  "appearancePreset",
                  e.target.value as WorkspaceConfig["appearancePreset"],
                )
              }
            >
              <option value="gold">Gold</option>
              <option value="blue">Blue</option>
              <option value="violet">Violet</option>
              <option value="mint">Mint</option>
              <option value="rose">Rose</option>
            </select>
          </Field>
          <Field label="Card style">
            <select
              value={cfg.appearanceCardStyle}
              onChange={(e) =>
                set(
                  "appearanceCardStyle",
                  e.target.value as WorkspaceConfig["appearanceCardStyle"],
                )
              }
            >
              <option value="elevated">Elevated</option>
              <option value="flat">Flat</option>
              <option value="glass">Glass</option>
            </select>
          </Field>
          <Field label="Layout density">
            <select
              value={cfg.appearanceDensity}
              onChange={(e) =>
                set(
                  "appearanceDensity",
                  e.target.value as WorkspaceConfig["appearanceDensity"],
                )
              }
            >
              <option value="compact">Compact</option>
              <option value="cozy">Cozy</option>
              <option value="airy">Airy</option>
            </select>
          </Field>
          <Field label="Typography scale">
            <input
              type="range"
              min={90}
              max={115}
              value={cfg.appearanceScale}
              onChange={(e) => set("appearanceScale", Number(e.target.value))}
            />
            <small>{cfg.appearanceScale}%</small>
          </Field>
          <Field label="Spacing scale">
            <input
              type="range"
              min={85}
              max={130}
              value={cfg.appearanceSpacing}
              onChange={(e) => set("appearanceSpacing", Number(e.target.value))}
            />
            <small>{cfg.appearanceSpacing}%</small>
          </Field>
          <Field label="Corner roundness">
            <input
              type="range"
              min={80}
              max={140}
              value={cfg.appearanceRadius}
              onChange={(e) => set("appearanceRadius", Number(e.target.value))}
            />
            <small>{cfg.appearanceRadius}%</small>
          </Field>
          <Field label="Shadow intensity">
            <input
              type="range"
              min={40}
              max={140}
              value={cfg.appearanceShadow}
              onChange={(e) => set("appearanceShadow", Number(e.target.value))}
            />
            <small>{cfg.appearanceShadow}%</small>
          </Field>
        </div>
        <div className="info-box" style={{ marginTop: 16 }}>
          <CheckCircle2 size={14} />
          <span>
            These settings persist in workspace configuration. Save changes to
            apply permanently for everyone.
          </span>
        </div>
      </section>
    </>
  );
}
