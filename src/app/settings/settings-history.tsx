"use client";
import { DataTree } from "@/components/momence-tools";
import { Badge,Switch } from "@/components/ui";
import { display,indiaDate } from "@/lib/display";
import { FileJson,Sparkles,Upload } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsHistoryPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const {
    data,
    file,
    notify,
    setFile,
    closeImported,
    setCloseImported,
    importing,
    importData,
    importResult,
    runs,
  } = model;

  return (
    <>
      <section className="card card-pad">
        <h2>Bring your history into focus</h2>
        <p className="secondary" style={{ fontSize: 12, marginTop: 7 }}>
          Import past tickets with source tracking, original metadata and
          duplicate protection.
        </p>
        <label
          className="private-lock"
          style={{
            display: "block",
            marginTop: 22,
            cursor: "pointer",
          }}
        >
          <Upload size={28} />
          <h3>{file?.name || "Choose a historic tickets JSON file"}</h3>
          <p>
            {file
              ? `${file.count} records detected`
              : "A JSON array, or an object containing a tickets array. Maximum 20 MB."}
          </p>
          <input
            type="file"
            accept="application/json,.json"
            style={{ marginTop: 16, fontSize: 11 }}
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              if (selected.size > 20000000) {
                notify("File exceeds 20 MB.", "error");
                return;
              }
              try {
                const records = JSON.parse(await selected.text());
                const r = Array.isArray(records)
                  ? records
                  : records.tickets || records.data || records.records;
                if (!Array.isArray(r))
                  throw new Error("No ticket array found.");
                setFile({
                  name: selected.name,
                  records,
                  count: r.length,
                });
              } catch (err) {
                notify((err as Error).message, "error");
              }
            }}
          />
        </label>
        <div className="setting-row">
          <div>
            <h4>File as closed history</h4>
            <p>
              Imported records are post-dated to when they were opened and
              closed, with no SLA clock. They stay searchable and Iris still
              learns from them, but they do not land on the working board, the
              radar, or the SLA figures. The original status is kept on each
              record.
            </p>
          </div>
          <Switch
            checked={closeImported}
            onChange={setCloseImported}
            label="File as closed history"
          />
        </div>
        <div className="flex-row wrap" style={{ marginTop: 18 }}>
          <button
            className="btn btn-primary"
            disabled={!file || importing}
            onClick={() => void importData()}
          >
            <Upload size={13} />
            Import selected file
          </button>
          <button
            className="btn"
            disabled={importing}
            onClick={() => void importData(true)}
          >
            <FileJson size={13} />
            Import data/historic-tickets.json
          </button>
        </div>
        <div className="info-box" style={{ marginTop: 20 }}>
          <Sparkles size={16} />
          <span>
            {closeImported
              ? "Records land closed and back-dated, so they read as history rather than live work, and Iris can still draw on them while drafting."
              : "Records land with the status found in the file — including anything open — and will appear on the board and in SLA reporting."}{" "}
            Iris retrieves relevant imported examples during conversations. This
            is contextual learning, not OpenAI model fine-tuning. The importer
            never fabricates records.
          </span>
        </div>
        {importResult !== undefined && (
          <div style={{ marginTop: 20 }}>
            <DataTree data={importResult} />
          </div>
        )}
      </section>
      <section className="card card-pad">
        <h3>Import history</h3>
        {runs.map((r, i) => (
          <div key={String(r.id || i)} className="related-ticket">
            <div>
              <p>{display(r.source)}</p>
              <small>{indiaDate(r.createdAt)}</small>
            </div>
            <Badge tone="green">{display(r.imported)} imported</Badge>
            <Badge>{display(r.skipped)} skipped</Badge>
          </div>
        ))}
        {!runs.length && (
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            No imports have run yet.
          </p>
        )}
      </section>
    </>
  );
}
