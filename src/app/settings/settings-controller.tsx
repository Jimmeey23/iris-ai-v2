"use client";
import { api, Switch, useApp } from "@/components/ui";
import { type StaffRecord } from "@/lib/constants";
import {
  COLUMN_META,
  TICKET_COLUMNS,
  type TicketColumn,
} from "@/lib/dashboard-contract";
import { type WorkspaceConfig } from "@/lib/settings-contract";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsPageView } from "./settings-view";
type Account = {
  id: number;
  name: string;
  email: string;
  role: string;
  staffId: number | null;
  active: boolean;
};
type SettingsData = {
  config: WorkspaceConfig;
  version: number;
  users: Account[];
};
export function useSettingsPageController() {
  const { user, setupRequired, openAuth, notify, theme, toggleTheme } =
    useApp();
  const [tab, setTab] = useState("general"),
    [data, setData] = useState<SettingsData>(),
    [cfg, setCfg] = useState<WorkspaceConfig>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [raw, setRaw] = useState(""),
    [staff, setStaff] = useState<StaffRecord[]>([]);
  const [invite, setInvite] = useState(false),
    [account, setAccount] = useState({
      name: "",
      email: "",
      password: "",
      role: "agent",
      staffId: "",
    });
  const [table, setTable] = useState("staff"),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [tableBusy, setTableBusy] = useState(false),
    [edit, setEdit] = useState<Record<string, unknown>>(),
    [editJson, setEditJson] = useState(""),
    [file, setFile] = useState<{
      name: string;
      records: unknown;
      count: number;
    }>(),
    [importResult, setImportResult] = useState<unknown>(),
    [importing, setImporting] = useState(false),
    [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [closeImported, setCloseImported] = useState(true);
  const [relabel, setRelabel] = useState<{
    scanned: number;
    changed: number;
    skipped: number;
    applied: boolean;
    samples: { ticketNumber: string; from: string; to: string }[];
  }>();
  const [relabelBusy, setRelabelBusy] = useState(false);
  const [relabelForce, setRelabelForce] = useState(false);
  const load = useCallback(() => {
    if (user?.role !== "admin") return Promise.resolve();
    return api<SettingsData>("/api/settings")
      .then(async (d) => {
        setData(d);
        setCfg(d.config);
        setRaw(JSON.stringify(d.config, null, 2));
        setError("");
        const people = await api<{ staff: StaffRecord[] }>("/api/staff");
        setStaff(people.staff);
      })
      .catch((e) => setError((e as Error).message));
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  const loadTable = useCallback(() => {
    if (user?.role !== "admin") return Promise.resolve();
    return api<{ rows: Record<string, unknown>[] }>(
      "/api/settings?table=" + table,
    )
      .then((d) => setRows(d.rows))
      .catch((e) => notify((e as Error).message, "error"))
      .finally(() => setTableBusy(false));
  }, [table, user, notify]);
  useEffect(() => {
    if (tab === "database") void loadTable();
    if (tab === "history" && user?.role === "admin")
      void api<{ runs: Record<string, unknown>[] }>("/api/history")
        .then((d) => setRuns(d.runs))
        .catch(() => {});
  }, [tab, loadTable, user]);
  function set<K extends keyof WorkspaceConfig>(
    key: K,
    value: WorkspaceConfig[K],
  ) {
    setCfg((c) => (c ? { ...c, [key]: value } : c));
  }
  async function save() {
    if (!cfg || !data) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ version: number }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ config: cfg, version: data.version }),
      });
      setData((s) => (s ? { ...s, version: d.version, config: cfg } : s));
      setRaw(JSON.stringify(cfg, null, 2));
      notify("Workspace settings saved permanently.");
      window.dispatchEvent(new Event("iris:settings-updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createAccount() {
    setBusy(true);
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "invite",
          ...account,
          staffId: account.staffId ? Number(account.staffId) : null,
        }),
      });
      setInvite(false);
      setAccount({
        name: "",
        email: "",
        password: "",
        role: "agent",
        staffId: "",
      });
      await load();
      notify(
        "User account created. Share credentials securely with the staff member.",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function updateAccount(id: number, patch: Record<string, unknown>) {
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "update", id, ...patch }),
      });
      await load();
      notify("Access level updated.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function saveRecord() {
    setBusy(true);
    try {
      const record = JSON.parse(editJson);
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ table, record }),
      });
      setEdit(undefined);
      await loadTable();
      notify("Database record saved and audited.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function importData(serverFile = false) {
    setImporting(true);
    setImportResult(undefined);
    try {
      const r = await api("/api/history", {
        method: "POST",
        body: JSON.stringify({
          ...(serverFile
            ? {}
            : { records: file?.records, filename: file?.name }),
          close: closeImported,
        }),
      });
      setImportResult(r);
      notify("Import completed. Review the row-level results.");
      const h = await api<{ runs: Record<string, unknown>[] }>("/api/history");
      setRuns(h.runs);
      window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      notify((e as Error).message, "error");
      setImportResult({ error: (e as Error).message });
    } finally {
      setImporting(false);
    }
  }
  async function runRelabel(apply: boolean) {
    setRelabelBusy(true);
    try {
      const r = await api<typeof relabel & object>("/api/settings", {
        method: "POST",
        body: JSON.stringify({ action: "relabel", apply, force: relabelForce }),
      });
      setRelabel(r as never);
      notify(
        apply
          ? `${(r as { changed: number }).changed} ticket labels rewritten.`
          : "Preview ready — nothing has been written yet.",
      );
      if (apply) window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setRelabelBusy(false);
    }
  }
  const toggleColumn = (c: TicketColumn) => {
    if (!cfg) return;
    if (COLUMN_META[c].always) return;
    const on = cfg.defaultColumns.includes(c);
    set(
      "defaultColumns",
      (on
        ? cfg.defaultColumns.filter((x) => x !== c)
        : [...TICKET_COLUMNS].filter(
            (x) => cfg.defaultColumns.includes(x) || x === c,
          )) as WorkspaceConfig["defaultColumns"],
    );
  };
  /** One n8n lifecycle event toggle. Nested under `n8nEvents`, so it cannot use the
   *  flat `set` helper above. */
  const eventSetting = (
    key: keyof WorkspaceConfig["n8nEvents"],
    title: string,
    description: string,
  ) => (
    <div className="setting-row" key={key}>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <Switch
        checked={Boolean(cfg?.n8nEvents?.[key])}
        onChange={(v) =>
          setCfg((c) =>
            c ? { ...c, n8nEvents: { ...c.n8nEvents, [key]: v } } : c,
          )
        }
        label={title}
      />
    </div>
  );
  const booleanSetting = (
    key:
      | "aiEnabled"
      | "aiFallback"
      | "historyRetrieval"
      | "autoTag"
      | "autoAssign"
      | "positiveNoSla"
      | "webhookOnCreate"
      | "assignmentEmail"
      | "weeklyReportEmail"
      | "allowReopen"
      | "maskMemberContact",
    title: string,
    description: string,
  ) => (
    <div className="setting-row" key={key}>
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <Switch
        checked={Boolean(cfg?.[key])}
        onChange={(v) => set(key, v)}
        label={title}
      />
    </div>
  );
  const dirty = useMemo(
    () =>
      Boolean(
        cfg && data && JSON.stringify(cfg) !== JSON.stringify(data.config),
      ),
    [cfg, data],
  );
  return {
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
  };
}
export default function SettingsPage() {
  const model = useSettingsPageController();
  return <SettingsPageView model={model} />;
}
