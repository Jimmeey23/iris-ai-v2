"use client";
import { Badge,Switch } from "@/components/ui";
import {
COLUMN_META,
GROUP_BY,
GROUP_LABELS,
TICKET_COLUMNS,
} from "@/lib/dashboard-contract";
import { type WorkspaceConfig } from "@/lib/settings-contract";
import { Loader2,RefreshCw,Tags,Wand2 } from "lucide-react";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsBoardPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const {
    cfg,
    set,
    booleanSetting,
    toggleColumn,
    relabelForce,
    setRelabelForce,
    relabelBusy,
    runRelabel,
    relabel,
    table,
  } = model;
  if (!cfg) return null;
  return (
    <>
      <section className="card card-pad">
        <h2>How the board opens</h2>
        <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
          The starting point for anyone who has not set their own. Personal
          choices are saved to each person&rsquo;s profile and always win.
        </p>
        <div className="setting-row">
          <div>
            <h4>Group rows by</h4>
            <p>Fold the table into groups with totals on each header.</p>
          </div>
          <select
            value={cfg.defaultGroupBy}
            onChange={(e) =>
              set(
                "defaultGroupBy",
                e.target.value as WorkspaceConfig["defaultGroupBy"],
              )
            }
          >
            {GROUP_BY.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Row density</h4>
            <p>Compact fits roughly twice as many rows on a laptop screen.</p>
          </div>
          <select
            value={cfg.defaultDensity}
            onChange={(e) =>
              set(
                "defaultDensity",
                e.target.value as WorkspaceConfig["defaultDensity"],
              )
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Rows per page</h4>
            <p>
              Applies to ungrouped tables. Grouped tables show every row under
              its header.
            </p>
          </div>
          <input
            type="number"
            min={5}
            max={200}
            value={cfg.defaultPageSize}
            onChange={(e) => set("defaultPageSize", Number(e.target.value))}
          />
        </div>
        <h3 style={{ marginTop: 23, marginBottom: 12 }}>Default columns</h3>
        <div className="tf-columns">
          {TICKET_COLUMNS.map((c) => {
            const meta = COLUMN_META[c];
            const on = cfg.defaultColumns.includes(c);
            return (
              <label
                key={c}
                className={
                  "tf-column" +
                  (on ? " tf-column-on" : "") +
                  (meta.always ? " tf-column-locked" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={meta.always}
                  onChange={() => toggleColumn(c)}
                />
                <span>{meta.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="card card-pad">
        <h2>
          <Tags
            size={16}
            className="accent"
            style={{ verticalAlign: -2, marginRight: 7 }}
          />
          Ticket labels
        </h2>
        <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
          A label answers &ldquo;what is this about?&rdquo;. Descriptive labels
          are taken from what the reporter wrote; the classification is still
          shown as chips beside them.
        </p>
        <div className="setting-row">
          <div>
            <h4>Label style</h4>
            <p>
              Descriptive writes what happened. Classification keeps the older
              category-based titles for tickets logged from here on.
            </p>
          </div>
          <select
            value={cfg.labelStyle}
            onChange={(e) =>
              set("labelStyle", e.target.value as WorkspaceConfig["labelStyle"])
            }
          >
            <option value="descriptive">Descriptive</option>
            <option value="classification">Classification</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Maximum label length</h4>
            <p>
              Longer labels are trimmed at a word boundary. 76 characters fits
              the table without wrapping.
            </p>
          </div>
          <input
            type="number"
            min={40}
            max={140}
            value={cfg.labelMaxLength}
            onChange={(e) => set("labelMaxLength", Number(e.target.value))}
          />
        </div>
        <div className="info-box" style={{ marginTop: 18 }}>
          <Wand2 size={15} />
          <span>
            Re-label tickets that were logged before descriptive labels existed.
            The original title is kept on each record, so this can be reviewed
            and reversed.
          </span>
        </div>
        <div className="setting-row">
          <div>
            <h4>Also rewrite hand-written titles</h4>
            <p>
              Off by default: a title somebody wrote themselves is usually
              better than a generated one.
            </p>
          </div>
          <Switch
            checked={relabelForce}
            onChange={setRelabelForce}
            label="Rewrite hand-written titles too"
          />
        </div>
        <div className="flex-row wrap" style={{ marginTop: 16 }}>
          <button
            className="btn"
            disabled={relabelBusy}
            onClick={() => void runRelabel(false)}
          >
            {relabelBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Preview changes
          </button>
          <button
            className="btn btn-primary"
            disabled={relabelBusy || !relabel || !relabel.changed}
            onClick={() => void runRelabel(true)}
          >
            <Wand2 size={13} />
            Apply {relabel?.changed || 0} labels
          </button>
        </div>
        {relabel && (
          <div style={{ marginTop: 18 }}>
            <div className="flex-row wrap" style={{ gap: 8, marginBottom: 12 }}>
              <Badge tone="blue">{relabel.scanned} scanned</Badge>
              <Badge tone={relabel.changed ? "amber" : "green"}>
                {relabel.changed}{" "}
                {relabel.applied ? "rewritten" : "would change"}
              </Badge>
              <Badge>{relabel.skipped} left alone</Badge>
            </div>
            {relabel.samples.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TICKET</th>
                      <th>BEFORE</th>
                      <th>AFTER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relabel.samples.map((x) => (
                      <tr key={x.ticketNumber}>
                        <td className="mono" style={{ fontSize: 10 }}>
                          {x.ticketNumber}
                        </td>
                        <td className="muted">{x.from}</td>
                        <td>
                          <strong>{x.to}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card card-pad">
        <h2>Working rhythm</h2>
        <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
          What the board calls ageing, due soon and overdue.
        </p>
        <div className="setting-row">
          <div>
            <h4>Flag a ticket as ageing after</h4>
            <p>
              Days an open ticket can sit before the board marks its age in
              amber.
            </p>
          </div>
          <input
            type="number"
            min={1}
            max={90}
            value={cfg.staleTicketDays}
            onChange={(e) => set("staleTicketDays", Number(e.target.value))}
          />
        </div>
        <div className="setting-row">
          <div>
            <h4>Warn this far before the target</h4>
            <p>
              Percentage of the follow-up window left when a ticket starts
              reading as due soon.
            </p>
          </div>
          <input
            type="number"
            min={5}
            max={90}
            value={cfg.slaWarningPercent}
            onChange={(e) => set("slaWarningPercent", Number(e.target.value))}
          />
        </div>
        <div className="setting-row">
          <div>
            <h4>Escalate after a missed target</h4>
            <p>
              Hours past the follow-up target before a ticket is raised to
              critical. Zero switches escalation off.
            </p>
          </div>
          <input
            type="number"
            min={0}
            max={336}
            value={cfg.escalateAfterBreachHours}
            onChange={(e) =>
              set("escalateAfterBreachHours", Number(e.target.value))
            }
          />
        </div>
        {booleanSetting(
          "allowReopen",
          "Allow resolved tickets to be reopened",
          "Switch off to make resolution final; a new ticket must be raised instead.",
        )}
      </section>

      <section className="card card-pad">
        <h2>Presentation</h2>
        <div className="setting-row">
          <div>
            <h4>Week starts on</h4>
            <p>Used by weekly groupings and reporting.</p>
          </div>
          <select
            value={cfg.weekStartsOn}
            onChange={(e) =>
              set(
                "weekStartsOn",
                e.target.value as WorkspaceConfig["weekStartsOn"],
              )
            }
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Date format</h4>
            <p>How dates are written throughout the workspace.</p>
          </div>
          <select
            value={cfg.dateFormat}
            onChange={(e) =>
              set("dateFormat", e.target.value as WorkspaceConfig["dateFormat"])
            }
          >
            <option value="dd-mmm-yyyy">19 Sep 2026</option>
            <option value="yyyy-mm-dd">2026-09-19</option>
            <option value="dd/mm/yyyy">19/09/2026</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <h4>Currency</h4>
            <p>Used for equipment costs and any financial reporting.</p>
          </div>
          <input
            value={cfg.currency}
            maxLength={8}
            onChange={(e) => set("currency", e.target.value)}
          />
        </div>
        {booleanSetting(
          "maskMemberContact",
          "Mask member contact details in lists",
          "Email and phone are hidden from anyone below administrator until a ticket is opened.",
        )}
      </section>
    </>
  );
}
