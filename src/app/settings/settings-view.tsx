"use client";
import { DataTree } from "@/components/momence-tools";
import { Shell } from "@/components/shell";
import { Field,Loading,Modal } from "@/components/ui";
import {
Code2,
Database,
FileClock,
GitBranch,
LayoutList,
ListChecks,
Loader2,
Palette,
Save,
Settings,
ShieldCheck,
Sparkles,
Users,
Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { useSettingsPageController } from "./settings-controller";
const TABS = [
  { id: "general", name: "Workspace", icon: Settings },
  { id: "appearance", name: "Appearance", icon: Palette },
  { id: "ai", name: "Iris assistant", icon: Sparkles },
  { id: "board", name: "Board & labels", icon: LayoutList },
  { id: "forms", name: "Forms & routing", icon: ListChecks },
  { id: "routing", name: "Routing & SLAs", icon: GitBranch },
  { id: "automation", name: "Automation", icon: Zap },
  { id: "access", name: "People & access", icon: Users },
  { id: "database", name: "Database explorer", icon: Database },
  { id: "history", name: "History & knowledge", icon: FileClock },
  { id: "advanced", name: "Advanced", icon: Code2 },
];
const SettingsPersonalAppearancePanel = dynamic(
  () => import("./settings-appearance-personal"),
  { loading: () => <p role="status">Loading panel…</p> },
);
const SettingsGeneralPanel = dynamic(() => import("./settings-general"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsWorkspaceAppearancePanel = dynamic(
  () => import("./settings-appearance-workspace"),
  { loading: () => <p role="status">Loading panel…</p> },
);
const SettingsAiPanel = dynamic(() => import("./settings-ai"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsBoardPanel = dynamic(() => import("./settings-board"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsFormsPanel = dynamic(() => import("./settings-forms"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsRoutingPanel = dynamic(() => import("./settings-routing"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsAutomationPanel = dynamic(
  () => import("./settings-automation"),
  { loading: () => <p role="status">Loading panel…</p> },
);
const SettingsAccessPanel = dynamic(() => import("./settings-access"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsDatabasePanel = dynamic(() => import("./settings-database"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsHistoryPanel = dynamic(() => import("./settings-history"), {
  loading: () => <p role="status">Loading panel…</p>,
});
const SettingsAdvancedPanel = dynamic(() => import("./settings-advanced"), {
  loading: () => <p role="status">Loading panel…</p>,
});
export function SettingsPageView({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const {
    busy,
    cfg,
    user,
    dirty,
    save,
    tab,
    setTableBusy,
    setTab,
    error,
    theme,
    toggleTheme,
    setupRequired,
    openAuth,
    set,
    data,
    booleanSetting,
    rows,
    toggleColumn,
    relabelForce,
    setRelabelForce,
    relabelBusy,
    runRelabel,
    relabel,
    table,
    setCfg,
    staff,
    eventSetting,
    setInvite,
    updateAccount,
    loadTable,
    setTable,
    tableBusy,
    setEdit,
    setEditJson,
    file,
    notify,
    setFile,
    closeImported,
    setCloseImported,
    importing,
    importData,
    importResult,
    runs,
    raw,
    setRaw,
    invite,
    createAccount,
    account,
    setAccount,
    edit,
    saveRecord,
    editJson,
  } = model;
  return (
    <Shell
      title="Make Iris your own."
      eyebrow="Workspace settings"
      action={
        <button
          className="btn btn-primary"
          disabled={busy || !cfg || user?.role !== "admin" || !dirty}
          onClick={() => void save()}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {dirty ? "Publish changes" : "Settings saved"}
        </button>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                onClick={() => {
                  if (t.id === "database") setTableBusy(true);
                  setTab(t.id);
                }}
              >
                <Icon size={15} />
                {t.name}
              </button>
            );
          })}
        </nav>
        <div className="stack">
          {error && <div className="error-box">{error}</div>}
          {tab === "appearance" && <SettingsPersonalAppearancePanel model={model} />}
          {user?.role !== "admin" ? (
            <section className="card card-pad">
              <div className="private-lock">
                <ShieldCheck size={30} />
                <h3>
                  {setupRequired
                    ? "Let’s set up your workspace"
                    : "Administration is protected"}
                </h3>
                <p>
                  {setupRequired
                    ? "Create the first administrator to manage routing, integrations, accounts and the database. Existing tickets stay intact."
                    : "Sign in as an administrator to edit organization-wide settings. Personal themes remain available to everyone."}
                </p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 20 }}
                  onClick={openAuth}
                >
                  {setupRequired
                    ? "Create administrator"
                    : "Administrator sign-in"}
                </button>
              </div>
            </section>
          ) : !cfg ? (
            <Loading />
          ) : (
            <>
              {tab === "general" && <SettingsGeneralPanel model={model} />}
              {tab === "appearance" && (
                <SettingsWorkspaceAppearancePanel model={model} />
              )}
              {tab === "ai" && <SettingsAiPanel model={model} />}
              {tab === "board" && <SettingsBoardPanel model={model} />}

              {tab === "forms" && <SettingsFormsPanel model={model} />}

              {tab === "routing" && <SettingsRoutingPanel model={model} />}
              {tab === "automation" && (
                <SettingsAutomationPanel model={model} />
              )}
              {tab === "access" && <SettingsAccessPanel model={model} />}
              {tab === "database" && <SettingsDatabasePanel model={model} />}
              {tab === "history" && <SettingsHistoryPanel model={model} />}
              {tab === "advanced" && <SettingsAdvancedPanel model={model} />}
            </>
          )}
        </div>
      </div>
      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="Add a workspace account"
        description="Passwords must be at least 12 characters. Share credentials through a secure channel."
        size="narrow"
        footer={
          <>
            <button className="btn" onClick={() => setInvite(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void createAccount()}
            >
              Create account
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Full name">
            <input
              value={account.name}
              onChange={(e) =>
                setAccount((a) => ({ ...a, name: e.target.value }))
              }
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={account.email}
              onChange={(e) =>
                setAccount((a) => ({ ...a, email: e.target.value }))
              }
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={account.password}
              onChange={(e) =>
                setAccount((a) => ({ ...a, password: e.target.value }))
              }
            />
          </Field>
          <Field label="Access level">
            <select
              value={account.role}
              onChange={(e) =>
                setAccount((a) => ({ ...a, role: e.target.value }))
              }
            >
              {["admin", "manager", "agent"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Staff profile">
            <select
              value={account.staffId}
              onChange={(e) =>
                setAccount((a) => ({ ...a, staffId: e.target.value }))
              }
            >
              <option value="">No staff profile</option>
              {staff.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(undefined)}
        title={
          ["staff", "departments", "templates"].includes(table)
            ? "Edit database record"
            : "Inspect record"
        }
        description={`${table} · changes are validated and permanently audited`}
        footer={
          <>
            <button className="btn" onClick={() => setEdit(undefined)}>
              Close
            </button>
            {["staff", "departments", "templates"].includes(table) && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void saveRecord()}
              >
                Save record
              </button>
            )}
          </>
        }
      >
        {["staff", "departments", "templates"].includes(table) ? (
          <textarea
            className="code-editor"
            rows={22}
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
          />
        ) : (
          <DataTree data={edit} />
        )}
      </Modal>
    </Shell>
  );
}
