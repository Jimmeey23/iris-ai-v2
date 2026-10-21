"use client";
import { ThemeToggle } from "@/components/ui";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsPersonalAppearancePanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { theme, toggleTheme } = model;

  return (
    <section className="card card-pad">
      <div className="between">
        <div>
          <h2>Your personal theme</h2>
          <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
            A workspace that feels right, in any light.
          </p>
        </div>
        <ThemeToggle />
      </div>
      <div className="form-grid" style={{ marginTop: 23 }}>
        <button
          className="card card-pad"
          data-theme="dark"
          style={{
            background: "var(--surface)",
            color: "var(--text)",
            textAlign: "left",
            borderColor: theme === "dark" ? "var(--accent)" : "var(--border)",
          }}
          onClick={() => theme !== "dark" && toggleTheme()}
        >
          <div
            style={{
              height: 65,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg)",
              display: "flex",
              gap: 7,
              padding: 10,
              marginBottom: 15,
            }}
          >
            <div
              style={{
                width: 20,
                background: "var(--surface-3)",
                borderRadius: "var(--radius-2xs)",
              }}
            />
            <div style={{ flex: 1, display: "grid", gap: 5 }}>
              <div
                style={{
                  height: 10,
                  background:
                    "linear-gradient(100deg,var(--accent-deep),var(--accent-bright))",
                  borderRadius: "var(--radius-2xs)",
                  width: "60%",
                }}
              />
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-2xs)",
                }}
              />
            </div>
          </div>
          <strong style={{ fontSize: 13 }}>Dark · default</strong>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
            Dark gray with a blue accent.
          </p>
        </button>
        <button
          className="card card-pad"
          data-theme="light"
          style={{
            background: "var(--surface)",
            color: "var(--text)",
            textAlign: "left",
            borderColor: theme === "light" ? "var(--accent)" : "var(--border)",
          }}
          onClick={() => theme !== "light" && toggleTheme()}
        >
          <div
            style={{
              height: 65,
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              display: "flex",
              gap: 7,
              padding: 10,
              marginBottom: 15,
            }}
          >
            <div
              style={{
                width: 20,
                background: "var(--surface-3)",
                borderRadius: "var(--radius-2xs)",
              }}
            />
            <div style={{ flex: 1, display: "grid", gap: 5 }}>
              <div
                style={{
                  height: 10,
                  background: "var(--accent)",
                  borderRadius: "var(--radius-2xs)",
                  width: "60%",
                }}
              />
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-2xs)",
                }}
              />
            </div>
          </div>
          <strong style={{ fontSize: 13 }}>
            Light · crisp & high-contrast
          </strong>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
            Bright white with confident blue accents.
          </p>
        </button>
      </div>
      <p className="muted" style={{ fontSize: 10, marginTop: 18 }}>
        Your preference saves immediately to this browser and your workspace
        identity.
      </p>
    </section>
  );
}
