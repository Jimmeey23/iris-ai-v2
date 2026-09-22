"use client";

/**
 * IRIS design system — a living reference for the token layer and the primitive
 * set.
 *
 * This page exists so the visual language can be reviewed in one place instead
 * of being inferred from fourteen product screens. Everything on it is rendered
 * by the same components the app uses; nothing here is a mock-up. If a token
 * changes, this page changes with it.
 *
 * It deliberately does not use the database, so it renders in any environment.
 */

import { useState } from "react";
import {
  Sparkles, Ticket, Check, X, Plus, Search, Bell, Settings, Radio, Layers,
  ArrowUpRight, ChevronRight, Loader2, ShieldCheck, TriangleAlert, Trash2,
  Download, RefreshCw, Mic,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  Avatar, Badge, Button, Empty, Field, Loading, Modal, Priority, Status, Switch,
  Tabs, TabPanel, ThemeToggle, Tip, useApp, type TabItem,
} from "@/components/ui";
import { EmptyArt } from "@/components/graphics";

/* ── Small local helpers for laying the reference out ─────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ds-row">
      <div className="ds-row-label">{label}</div>
      <div className="ds-row-body">{children}</div>
    </div>
  );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="ds-swatch">
      <span className="ds-swatch-chip" style={{ background: `var(${varName})` }} />
      <code className="ds-swatch-name">{name}</code>
      <small className="ds-swatch-var">{varName}</small>
    </div>
  );
}

function ScaleStep({ token, value, kind }: { token: string; value: string; kind: "radius" | "space" | "text" | "shadow" | "motion" }) {
  return (
    <div className="ds-scale-step">
      {kind === "radius" && <span className="ds-radius-demo" style={{ borderRadius: `var(${token})` }} />}
      {kind === "space" && <span className="ds-space-demo" style={{ width: `var(${token})` }} />}
      {kind === "shadow" && <span className="ds-shadow-demo" style={{ boxShadow: `var(${token})` }} />}
      {kind === "text" && <span className="ds-text-demo" style={{ fontSize: `var(${token})` }}>Aa</span>}
      {kind === "motion" && <span className="ds-motion-demo" style={{ animationTimingFunction: `var(${token})` }} />}
      <div className="ds-scale-meta">
        <code>{token}</code>
        <small>{value}</small>
      </div>
    </div>
  );
}

/* ── Panels ───────────────────────────────────────────────────────────── */

const SECTIONS: TabItem<string>[] = [
  { id: "foundations", label: "Foundations" },
  { id: "buttons", label: "Buttons" },
  { id: "data", label: "Badges & data" },
  { id: "forms", label: "Forms" },
  { id: "tabs", label: "Tabs" },
  { id: "overlays", label: "Overlays" },
  { id: "feedback", label: "Feedback" },
  { id: "motion", label: "Motion" },
];

function Foundations() {
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">COLOUR</div>
        <h3 style={{ margin: "6px 0 16px" }}>Palette</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          Every colour is a variable resolved against <code>data-theme</code>. Components never name a
          hex value, so the whole product re-tints from one place. The light palette was re-balanced
          during this pass: <code>--green</code>, <code>--red</code>, <code>--amber</code> and{" "}
          <code>--muted</code> all previously fell below 4.5:1 against the surfaces they sit on, at
          9–11px — the sizes they are actually used at.
        </p>
        <div className="ds-swatch-grid">
          <Swatch name="bg" varName="--bg" />
          <Swatch name="surface" varName="--surface" />
          <Swatch name="surface-2" varName="--surface-2" />
          <Swatch name="surface-3" varName="--surface-3" />
          <Swatch name="surface-4" varName="--surface-4" />
          <Swatch name="text" varName="--text" />
          <Swatch name="secondary" varName="--secondary" />
          <Swatch name="muted" varName="--muted" />
          <Swatch name="border" varName="--border" />
          <Swatch name="border-strong" varName="--border-strong" />
          <Swatch name="accent" varName="--accent" />
          <Swatch name="accent-bright" varName="--accent-bright" />
          <Swatch name="accent-deep" varName="--accent-deep" />
          <Swatch name="green" varName="--green" />
          <Swatch name="amber" varName="--amber" />
          <Swatch name="red" varName="--red" />
          <Swatch name="purple" varName="--purple" />
          <Swatch name="blue" varName="--blue" />
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">SHAPE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Radius scale</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          Seven steps replace the 38 distinct radii that were previously in circulation. Components
          pick a step; they no longer invent a number.
        </p>
        <div className="ds-scale-grid">
          <ScaleStep kind="radius" token="--radius-2xs" value="4px" />
          <ScaleStep kind="radius" token="--radius-xs" value="6px" />
          <ScaleStep kind="radius" token="--radius-sm" value="8px" />
          <ScaleStep kind="radius" token="--radius-md" value="11px" />
          <ScaleStep kind="radius" token="--radius-lg" value="14px" />
          <ScaleStep kind="radius" token="--radius-xl" value="18px" />
          <ScaleStep kind="radius" token="--radius-2xl" value="24px" />
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">DEPTH</div>
        <h3 style={{ margin: "6px 0 16px" }}>Elevation scale</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          Five steps, each adding spread and softening. Combined with{" "}
          <code>--highlight-inset</code> — a hairline of light along the top edge — this is what stops
          a dark surface reading as a flat grey rectangle.
        </p>
        <div className="ds-scale-grid">
          <ScaleStep kind="shadow" token="--shadow-1" value="resting" />
          <ScaleStep kind="shadow" token="--shadow-2" value="raised" />
          <ScaleStep kind="shadow" token="--shadow-3" value="hover" />
          <ScaleStep kind="shadow" token="--shadow-4" value="popover" />
          <ScaleStep kind="shadow" token="--shadow-5" value="modal" />
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">TYPE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Type scale</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          A 1.167 ratio with a hard floor at 9px. Twenty-eight declarations previously rendered at
          7–8.5px; those have been collapsed onto the floor. Numerals are tabular wherever a value
          can change, so timers and counts never jitter as they tick.
        </p>
        <div className="ds-type-scale">
          {[["--text-4xl", "52px"], ["--text-3xl", "38px"], ["--text-2xl", "30px"], ["--text-xl", "24px"],
            ["--text-lg", "19px"], ["--text-md", "16px"], ["--text-base", "14px"], ["--text-sm", "12.5px"],
            ["--text-xs", "11.5px"], ["--text-2xs", "10.5px"], ["--text-3xs", "10px"]].map(([t, v]) => (
            <div className="ds-type-row" key={t}>
              <span style={{ fontSize: `var(${t})`, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "var(--tracking-tight)" }}>
                Every snag tracked
              </span>
              <code>{t}</code><small>{v}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">MOTION</div>
        <h3 style={{ margin: "6px 0 16px" }}>Easing &amp; duration</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          Four easings and six durations replace the 20+ timings that were competing on the same
          screen. <code>--ease-out-expo</code> is the house curve for entrances,{" "}
          <code>--ease-spring</code> for anything the user physically presses.
        </p>
        <div className="ds-scale-grid">
          <ScaleStep kind="motion" token="--ease-out-expo" value="entrances" />
          <ScaleStep kind="motion" token="--ease-spring" value="presses" />
          <ScaleStep kind="motion" token="--ease-standard" value="colour" />
          <ScaleStep kind="motion" token="--ease-in-out-quart" value="curtains" />
        </div>
        <div className="ds-durations">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div className="ds-duration" key={n}>
              <span className="ds-duration-bar" style={{ animationDuration: `var(--dur-${n})` }} />
              <code>--dur-{n}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Buttons() {
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); setTimeout(() => setBusy(false), 1800); };
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">INTENT</div>
        <h3 style={{ margin: "6px 0 16px" }}>Variants</h3>
        <Row label="Primary">
          <Button variant="primary" icon={Sparkles}>Log with Iris</Button>
          <Button variant="primary" icon={Plus}>New ticket</Button>
          <Button variant="primary" icon={Download}>Export</Button>
        </Row>
        <Row label="Secondary">
          <Button icon={Layers}>Templates</Button>
          <Button icon={RefreshCw}>Refresh</Button>
          <Button iconRight={ArrowUpRight}>Open Momence</Button>
        </Row>
        <Row label="Soft">
          <Button variant="soft" icon={Sparkles}>Guided assist</Button>
          <Button variant="soft" icon={Radio}>Live radar</Button>
        </Row>
        <Row label="Outline">
          <Button variant="outline" icon={Settings}>Configure</Button>
          <Button variant="outline" icon={Search}>Find</Button>
        </Row>
        <Row label="Ghost">
          <Button variant="ghost">Cancel</Button>
          <Button variant="ghost" icon={ChevronRight}>See more</Button>
        </Row>
        <Row label="Success">
          <Button variant="success" icon={Check}>Resolve ticket</Button>
        </Row>
        <Row label="Danger">
          <Button variant="danger" icon={Trash2}>Discard draft</Button>
          <Button variant="danger" icon={TriangleAlert}>Escalate</Button>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">GEOMETRY</div>
        <h3 style={{ margin: "6px 0 16px" }}>Sizes</h3>
        <Row label="Large">
          <Button size="lg" variant="primary" icon={Sparkles}>Start logging</Button>
          <Button size="lg" icon={Ticket}>Browse tickets</Button>
        </Row>
        <Row label="Medium">
          <Button variant="primary" icon={Sparkles}>Start logging</Button>
          <Button icon={Ticket}>Browse tickets</Button>
        </Row>
        <Row label="Small">
          <Button size="sm" variant="primary" icon={Plus}>Add</Button>
          <Button size="sm" icon={Ticket}>Tickets</Button>
        </Row>
        <Row label="Extra small">
          <Button size="xs" variant="primary">Filter</Button>
          <Button size="xs">Reset</Button>
          <Button size="xs" active>Active</Button>
        </Row>
        <Row label="Block">
          <div style={{ maxWidth: 320, width: "100%" }}>
            <Button block variant="primary" icon={Mic}>Speak it out loud</Button>
          </div>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">STATE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Interaction states</h3>
        <Row label="Loading">
          <Button variant="primary" loading>Saving</Button>
          <Button loading>Refreshing</Button>
        </Row>
        <Row label="Disabled">
          <Button variant="primary" disabled>Sign in required</Button>
          <Button disabled>Owner only</Button>
        </Row>
        <Row label="Try it">
          <Button variant="primary" icon={busy ? undefined : Check} loading={busy} onClick={run}>
            {busy ? "Resolving" : "Resolve ticket"}
          </Button>
          <span className="muted" style={{ fontSize: "var(--text-2xs)" }}>
            The label box is reserved, so the button never changes width mid-action.
          </span>
        </Row>
        <Row label="Icon buttons">
          <button className="icon-btn" aria-label="Notifications" data-tip="Notifications"><Bell size={17} /></button>
          <button className="icon-btn" aria-label="Settings" data-tip="Settings"><Settings size={17} /></button>
          <button className="icon-btn active" aria-label="Live" data-tip="Live"><Radio size={17} /></button>
          <button className="icon-btn sm" aria-label="Small" data-tip="Small variant"><Search size={14} /></button>
          <button className="icon-btn lg" aria-label="Large" data-tip="Large variant"><Sparkles size={19} /></button>
          <ThemeToggle />
        </Row>
        <Row label="Text buttons">
          <button className="text-btn">Start logging <ArrowUpRight size={13} /></button>
          <button className="text-btn">View all <ChevronRight size={13} /></button>
        </Row>
        <Row label="Tooltips">
          <Tip text="Pure CSS, no portal"><Button icon={ShieldCheck}>Hover me</Button></Tip>
          <Tip text="Bottom placement" pos="bottom"><Button variant="outline">Below</Button></Tip>
          <Tip text="Left placement" pos="left"><Button variant="ghost">Left</Button></Tip>
          <Tip text="Right placement" pos="right"><Button variant="ghost">Right</Button></Tip>
        </Row>
      </section>
    </div>
  );
}

function DataDisplay() {
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">STATUS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Badges</h3>
        <Row label="Neutral">
          <Badge>Unassigned</Badge><Badge tone="blue">New</Badge><Badge tone="purple">Triaged</Badge>
          <Badge tone="amber">In progress</Badge><Badge tone="green">Resolved</Badge><Badge tone="red">Critical</Badge>
        </Row>
        <Row label="Outline">
          <Badge className="badge-outline">Facilities</Badge>
          <Badge tone="blue" className="badge-outline">Cardio</Badge>
          <Badge tone="green" className="badge-outline">Compliment</Badge>
          <Badge tone="red" className="badge-outline">Escalated</Badge>
        </Row>
        <Row label="Large">
          <Badge className="badge-lg" tone="green"><i className="status-dot" />All studios live</Badge>
          <Badge className="badge-lg" tone="amber"><i className="status-dot" />2 awaiting vendor</Badge>
        </Row>
        <Row label="Live dot">
          <Badge tone="green"><i className="status-dot live" />Streaming</Badge>
          <Badge tone="red"><i className="status-dot live" />SLA breached</Badge>
          <Badge tone="amber"><i className="status-dot" />Static category</Badge>
        </Row>
        <Row label="Ticket status">
          {["new", "triaged", "in_progress", "waiting_on_member", "waiting_on_vendor", "resolved", "closed"].map((s) => (
            <Status key={s} status={s} />
          ))}
        </Row>
        <Row label="Priority">
          {["critical", "high", "medium", "low"].map((p) => <Priority key={p} priority={p} />)}
        </Row>
        <Row label="Chips">
          <span className="chip">PowerCycle</span>
          <span className="chip chip-quiet">P57-00421</span>
          <span className="chip chip-solid">Kemps</span>
          <span className="chip chip-kind" data-tone="blue">Equipment</span>
          <span className="chip chip-kind" data-tone="green">Compliment</span>
          <span className="chip chip-warn">Stale · 4d</span>
        </Row>
        <Row label="Tags">
          <span className="tag">ops · facilities</span>
          <span className="tag">sla 48h</span>
          <span className="tag">relapse check</span>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">PEOPLE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Avatars</h3>
        <Row label="Sizes">
          <Avatar name="Anisha Rao" /><Avatar name="Anisha Rao" large />
          <span className="avatar sm">AR</span><span className="avatar xl">AR</span>
        </Row>
        <Row label="Tones">
          <Avatar name="Atul An" /><Avatar name="Bret Kk" tone="purple" />
          <Avatar name="Raunak Sa" tone="amber" /><Avatar name="Veena Nn" tone="green" />
          <Avatar name="Simran Jj" tone="blue" />
        </Row>
        <Row label="Presence">
          <span className="avatar online">AR</span>
          <span className="avatar online purple">BK</span>
          <span className="muted" style={{ fontSize: "var(--text-2xs)" }}>Online ring</span>
        </Row>
        <Row label="Stacked">
          <div className="ds-avatar-stack">
            <Avatar name="Anisha Rao" /><Avatar name="Bret Kk" tone="purple" />
            <Avatar name="Raunak Sa" tone="amber" /><Avatar name="Veena Nn" tone="green" />
            <span className="avatar" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>+6</span>
          </div>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">SURFACES</div>
        <h3 style={{ margin: "6px 0 16px" }}>Cards</h3>
        <div className="ds-card-row">
          <div className="card card-pad"><div className="eyebrow">DEFAULT</div><strong style={{ display: "block", margin: "8px 0 4px" }}>Resting</strong><p className="muted" style={{ fontSize: "var(--text-2xs)" }}>--shadow-2 + top highlight</p></div>
          <div className="card card-pad card-raised"><div className="eyebrow">RAISED</div><strong style={{ display: "block", margin: "8px 0 4px" }}>Popover</strong><p className="muted" style={{ fontSize: "var(--text-2xs)" }}>--shadow-4</p></div>
          <div className="card card-pad card-interactive"><div className="eyebrow">INTERACTIVE</div><strong style={{ display: "block", margin: "8px 0 4px" }}>Hover me</strong><p className="muted" style={{ fontSize: "var(--text-2xs)" }}>Lifts and takes an accent rim</p></div>
        </div>
      </section>
    </div>
  );
}

function Forms() {
  const [on, setOn] = useState(true);
  const [two, setTwo] = useState(false);
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">INPUTS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Fields</h3>
        <div className="form-grid">
          <Field label="Member name" hint="Matched against the Momence directory."><input placeholder="e.g. Ananya Sharma" /></Field>
          <Field label="Studio"><select defaultValue="Kemps"><option>Kemps</option><option>Bandra</option><option>Powai</option></select></Field>
          <Field label="Category" wide><input defaultValue="Equipment · Cardio" /></Field>
          <Field label="What happened?" wide hint="Iris reads this and drafts the ticket.">
            <textarea placeholder="Bike 14 in the PowerCycle room is making a grinding noise at high resistance…" />
          </Field>
          <Field label="Invalid state" wide>
            <div className="field-invalid"><input aria-invalid="true" defaultValue="not-an-email" /></div>
          </Field>
          <Field label="Disabled" wide><input disabled defaultValue="Set by the routing engine" /></Field>
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">CONTROLS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Switches, boxes, search</h3>
        <Row label="Switch">
          <div className="setting-row" style={{ border: 0, padding: 0, gap: 14 }}>
            <div><h4>Owner-only resolutions</h4><p>Only the owner and their manager can read resolution notes.</p></div>
            <Switch checked={on} onChange={setOn} label="Owner-only resolutions" />
          </div>
        </Row>
        <Row label="Switch off">
          <div className="setting-row" style={{ border: 0, padding: 0, gap: 14 }}>
            <div><h4>Email digest</h4><p>A single morning summary instead of per-ticket notifications.</p></div>
            <Switch checked={two} onChange={setTwo} label="Email digest" />
          </div>
        </Row>
        <Row label="Checkbox">
          <label className="flex-row" style={{ gap: 8, fontSize: "var(--text-xs)" }}>
            <input type="checkbox" defaultChecked /> I approve this external action.
          </label>
          <label className="flex-row" style={{ gap: 8, fontSize: "var(--text-xs)" }}>
            <input type="checkbox" /> Set a 48-hour relapse check
          </label>
        </Row>
        <Row label="Search">
          <div className="search-input" style={{ maxWidth: 320 }}><Search size={14} /><input placeholder="Search tickets, staff, modules…" /></div>
        </Row>
        <Row label="Keyboard">
          <kbd>⌘</kbd><kbd>K</kbd><span className="muted" style={{ fontSize: "var(--text-2xs)" }}>opens the command palette</span>
        </Row>
      </section>
    </div>
  );
}

function TabsDemo() {
  const [seg, setSeg] = useState("overview");
  const [und, setUnd] = useState("activity");
  const [mod, setMod] = useState("members");
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">NEW PRIMITIVE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Tabs</h3>
        <p className="secondary" style={{ marginBottom: 20, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          The product had seven hand-rolled tab strips and none of them exposed{" "}
          <code>role=&quot;tablist&quot;</code>, <code>aria-selected</code> or arrow-key navigation. This
          primitive adds all three, plus a single indicator element that <em>glides</em> between tabs —
          its offset and width are measured off the DOM and written to CSS variables, so the motion is
          a transform rather than a repaint. Try the arrow keys, Home and End.
        </p>
        <Row label="Segment">
          <Tabs label="Ticket views" value={seg} onChange={setSeg} items={[
            { id: "overview", label: "Overview" },
            { id: "tickets", label: "Tickets", count: 42 },
            { id: "radar", label: "Radar", count: 3 },
            { id: "locked", label: "Archived", disabled: true },
          ]} />
        </Row>
        <TabPanel id={seg}>
          <div className="card card-pad" style={{ marginTop: 4 }}>
            <strong style={{ textTransform: "capitalize" }}>{seg}</strong>
            <p className="muted" style={{ fontSize: "var(--text-2xs)", marginTop: 6 }}>
              Panel <code>#{seg}</code>, labelled by its tab and reachable in tab order.
            </p>
          </div>
        </TabPanel>

        <div style={{ height: 26 }} />
        <Row label="Underline">
          <Tabs variant="underline" label="Ticket detail" value={und} onChange={setUnd} items={[
            { id: "activity", label: "Activity" },
            { id: "resolution", label: "Resolution", count: 4 },
            { id: "similar", label: "Similar tickets", count: 12 },
            { id: "audit", label: "Audit log" },
          ]} />
        </Row>
        <TabPanel id={und}>
          <div className="card card-pad" style={{ marginTop: 4 }}>
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Showing <strong className="accent">{und}</strong>.</p>
          </div>
        </TabPanel>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">LEGACY, RESTYLED</div>
        <h3 style={{ margin: "6px 0 16px" }}>Existing tab strips</h3>
        <p className="secondary" style={{ marginBottom: 20, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          These are the classes already in the product. They have not been replaced — they were
          restyled onto the same tokens so every screen improves without a migration. The underline
          variant now scales out from the centre; the segmented variant sits in an inset groove with a
          raised thumb.
        </p>
        <Row label="module-tabs">
          <div className="module-tabs" style={{ marginBottom: 0 }}>
            {["members", "classes", "memberships", "studios"].map((m) => (
              <button key={m} className={mod === m ? "active" : ""} onClick={() => setMod(m)}
                style={{ textTransform: "capitalize" }}>{m}</button>
            ))}
          </div>
        </Row>
        <Row label="view-switch">
          <div className="view-switch">
            <button className="active" aria-label="Card view"><Layers size={14} /></button>
            <button aria-label="Table view"><Ticket size={14} /></button>
            <button aria-label="Agenda view"><Radio size={14} /></button>
          </div>
        </Row>
        <Row label="workspace-tabs">
          <div className="workspace-tabs" style={{ padding: 0 }}>
            <button className="active">Open <span>42</span></button>
            <button>Waiting <span>7</span></button>
            <button>Resolved <span>318</span></button>
            <button>Stale <span>3</span></button>
          </div>
        </Row>
        <Row label="panel-tab-btn">
          <div className="panel-tab-header">
            <button className="panel-tab-btn active"><Layers size={14} />Builder</button>
            <button className="panel-tab-btn action-tab"><Radio size={14} />Action centre<span className="tab-count-pill">4</span></button>
          </div>
        </Row>
      </section>
    </div>
  );
}

function Overlays() {
  const [basic, setBasic] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [form, setForm] = useState(false);
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">MODALS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Dialogs</h3>
        <p className="secondary" style={{ marginBottom: 20, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          Radix was already handling focus trapping and escape. What was missing was an exit: dialogs
          vanished between frames. Both overlay and content now animate on{" "}
          <code>data-state=&quot;closed&quot;</code>, and the leave is deliberately faster than the
          enter. Head and foot float over the scrolling body, so rows pass <em>under</em> them. Below
          768px the dialog becomes a bottom sheet that slides up from the floor.
        </p>
        <Row label="Sizes">
          <Button variant="primary" onClick={() => setBasic(true)}>Default dialog</Button>
          <Button onClick={() => setNarrow(true)}>Narrow</Button>
          <Button variant="outline" onClick={() => setForm(true)}>Form dialog</Button>
        </Row>
        <Row label="Try on mobile">
          <span className="muted" style={{ fontSize: "var(--text-2xs)" }}>
            Resize under 768px and reopen — the same component becomes a sheet.
          </span>
        </Row>
      </section>

      <Modal open={basic} onClose={() => setBasic(false)} title="Discard this draft?"
        description="The draft has not been filed yet."
        footer={<><Button variant="ghost" onClick={() => setBasic(false)}>Keep editing</Button>
          <Button variant="danger" icon={Trash2} onClick={() => setBasic(false)}>Discard draft</Button></>}>
        <div className="stack">
          <p className="secondary" style={{ fontSize: "var(--text-xs)", lineHeight: 1.7 }}>
            Iris assembled eight fields from what you said. Discarding loses them — nothing has been
            written to the ticket log.
          </p>
          <div className="draft-quote">
            <small>WHAT YOU SAID</small>
            <p>“Bike 14 in the PowerCycle room is making a grinding noise at high resistance.”</p>
          </div>
        </div>
      </Modal>

      <Modal open={narrow} onClose={() => setNarrow(false)} size="narrow" title="Welcome back"
        description="Secure staff access · Physique 57 India"
        footer={<><span className="muted" style={{ fontSize: "var(--text-3xs)" }}>Owner-only resolutions require a linked account.</span>
          <Button variant="primary">Sign in</Button></>}>
        <div className="stack">
          <Field label="Work email"><input type="email" placeholder="you@physique57.in" /></Field>
          <Field label="Password" hint="At least 12 characters."><input type="password" placeholder="••••••••••••" /></Field>
        </div>
      </Modal>

      <Modal open={form} onClose={() => setForm(false)} title="Log an equipment snag"
        description="Routed to Ops · 48h SLA"
        footer={<><Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
          <div className="flex-row"><Button icon={Sparkles} variant="soft">Ask Iris</Button>
            <Button variant="primary" icon={Check} onClick={() => setForm(false)}>File ticket</Button></div></>}>
        <div className="stack">
          <div className="info-box"><ShieldCheck size={15} /><span>Resolutions stay private to the owner and their manager.</span></div>
          <div className="form-grid">
            <Field label="Asset"><select><option>Bike 14 · PowerCycle</option><option>Treadmill 3 · Kemps</option></select></Field>
            <Field label="Studio"><select><option>Kemps</option><option>Bandra</option></select></Field>
            <Field label="Priority"><select><option>High</option><option>Critical</option></select></Field>
            <Field label="Owner"><select><option>Ops desk</option><option>Facilities</option></select></Field>
            <Field label="Notes" wide><textarea placeholder="Grinding noise at high resistance, started this morning…" /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Feedback() {
  const { notify } = useApp();
  const [rows, setRows] = useState(3);
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">TOASTS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Notifications</h3>
        <p className="secondary" style={{ marginBottom: 20, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          The icon now sits in a tinted well, a countdown bar shows how long is left, hovering freezes
          both, and dismissal runs an exit animation instead of blinking the row out of the stack.
        </p>
        <Row label="Fire one">
          <Button variant="success" icon={Check} onClick={() => notify("Ticket P57-00421 resolved and the member has been notified.", "success")}>Success toast</Button>
          <Button variant="danger" icon={X} onClick={() => notify("Momence is unreachable — showing the last synced directory.", "error")}>Error toast</Button>
          <Button icon={Bell} onClick={() => { notify("Saved to the workspace.", "success"); setTimeout(() => notify("Relapse check scheduled for Thursday.", "success"), 260); }}>Stack two</Button>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">LOADING</div>
        <h3 style={{ margin: "6px 0 16px" }}>Skeletons &amp; spinners</h3>
        <p className="secondary" style={{ marginBottom: 20, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          The skeleton sweeps a highlight across the block rather than pulsing the whole element —
          it implies direction instead of a generic &ldquo;busy&rdquo;.
        </p>
        <Row label="Count">
          <Button size="sm" onClick={() => setRows((r) => Math.max(1, r - 1))}>Fewer</Button>
          <span className="mono muted">{rows} rows</span>
          <Button size="sm" onClick={() => setRows((r) => Math.min(8, r + 1))}>More</Button>
        </Row>
        <Row label="List"><div style={{ width: "100%" }}><Loading variant="list" rows={rows} /></div></Row>
        <Row label="Cards"><div style={{ width: "100%" }}><Loading variant="card" rows={rows} /></div></Row>
        <Row label="Blocks"><div style={{ width: "100%" }}><Loading rows={Math.min(3, rows)} /></div></Row>
        <Row label="Spinner">
          <Loader2 size={18} className="animate-spin accent" />
          <span className="muted" style={{ fontSize: "var(--text-2xs)" }}>Inline busy indicator</span>
        </Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">PROGRESS</div>
        <h3 style={{ margin: "6px 0 16px" }}>Bars &amp; rings</h3>
        <Row label="In progress"><div className="progress-bar" style={{ maxWidth: 380 }}><span style={{ width: "42%" }} /></div></Row>
        <Row label="Breached"><div className="progress-bar" data-state="breached" style={{ maxWidth: 380 }}><span style={{ width: "100%" }} /></div></Row>
        <Row label="Due soon"><div className="progress-bar" data-state="soon" style={{ maxWidth: 380 }}><span style={{ width: "78%" }} /></div></Row>
        <Row label="Complete"><div className="progress-bar" data-state="complete" style={{ maxWidth: 380 }}><span style={{ width: "100%" }} /></div></Row>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">MESSAGES</div>
        <h3 style={{ margin: "6px 0 16px" }}>Inline callouts</h3>
        <div className="stack" style={{ gap: 12 }}>
          <div className="info-box"><ShieldCheck size={15} /><span>Resolutions stay private to the ticket owner and their manager.</span></div>
          <div className="info-box warning"><TriangleAlert size={15} /><span>Momence is not connected. You are viewing the last synced directory.</span></div>
          <div className="error-box">Administrator access is required to operate live integrations.</div>
        </div>
      </section>

      <section className="card">
        <Empty title="Nothing needs you right now" detail="Every ticket is resolved and no studio has reported a snag in the last 48 hours."
          action={<Button variant="primary" icon={Sparkles}>Log something with Iris</Button>} />
      </section>

      <section className="card card-pad">
        <div className="eyebrow">ART</div>
        <h3 style={{ margin: "6px 0 16px" }}>Empty-state illustration set</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 640, lineHeight: 1.7 }}>
          Hand-built SVG line art on one grammar: thin strokes, rounded joins, a single accent hue via{" "}
          <code>currentColor</code>. Each piece draws itself in on mount and themes automatically.
        </p>
        <div className="ds-art-grid">
          {(["inbox", "search", "chart", "people", "link", "shield", "spark", "calendar", "clipboard"] as const).map((v) => (
            <div className="ds-art-cell" key={v}><EmptyArt variant={v} /><code>{v}</code></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Motion() {
  const [key, setKey] = useState(0);
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="eyebrow">ENTRANCE</div>
        <h3 style={{ margin: "6px 0 16px" }}>Stagger</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          <code>.stagger</code> delays each child by 55ms through a CSS counter, so no component has
          to write an inline <code>animationDelay</code> per row. Replay it:
        </p>
        <Button size="sm" icon={RefreshCw} onClick={() => setKey((k) => k + 1)}>Replay</Button>
        <div className="stagger" key={key} style={{ marginTop: 18, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div className="card card-pad" key={i} style={{ padding: 14 }}>
              <div className="eyebrow">TILE {i + 1}</div>
              <strong style={{ display: "block", marginTop: 6, fontFamily: "var(--font-display)", fontSize: 22 }}>{(i + 1) * 7}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">SCROLL</div>
        <h3 style={{ margin: "6px 0 16px" }}>Scroll-driven reveal</h3>
        <p className="secondary" style={{ marginBottom: 18, fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          <code>.reveal-scroll</code> uses <code>animation-timeline: view()</code> where the browser
          supports it. The animation runs on the compositor thread — no IntersectionObserver, no JS,
          no layout thrash. Scroll this panel to see it. Where unsupported the class is inert and the
          content simply renders.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {["Facilities", "Equipment", "Member feedback", "IT & systems", "Audio & visual"].map((c, i) => (
            <div className="card card-pad reveal-scroll" key={c} style={{ padding: 16 }}>
              <div className="between">
                <strong>{c}</strong>
                <Badge tone={i % 3 === 0 ? "green" : i % 3 === 1 ? "amber" : "blue"}>{12 - i * 2} open</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="eyebrow">RESTRAINT</div>
        <h3 style={{ margin: "6px 0 16px" }}>Reduced motion</h3>
        <p className="secondary" style={{ fontSize: "var(--text-xs)", maxWidth: 660, lineHeight: 1.7 }}>
          A single global rule now collapses every animation and transition to 1ms and forces anything
          whose entrance ends at <code>opacity:0</code> back to visible. Previously there were seven
          partial blocks covering the landing page, the metric cards and the chat caret — the rest of
          the product still moved. Enable &ldquo;reduce motion&rdquo; in your OS settings and reload to
          check nothing is stranded invisible.
        </p>
      </section>
    </div>
  );
}

export default function DesignSystemPage() {
  const [section, setSection] = useState("foundations");
  const { theme } = useApp();
  return (
    <Shell title="Design system" eyebrow="IRIS · VISUAL LANGUAGE" hideFooter
      action={<div className="flex-row">
        <Badge tone={theme === "dark" ? "amber" : "blue"}>{theme === "dark" ? "Matte black & gold" : "Light"}</Badge>
        <ThemeToggle />
      </div>}>
      <div className="ds-page">
        <p className="ds-lede">
          One token layer, one primitive set. Everything below is rendered by the components the
          product actually ships — change a token at the top of <code>globals.css</code> and every
          screen moves with it.
        </p>
        <Tabs variant="underline" label="Design system sections" value={section} onChange={setSection} items={SECTIONS} />
        <div className="ds-body">
          {section === "foundations" && <Foundations />}
          {section === "buttons" && <Buttons />}
          {section === "data" && <DataDisplay />}
          {section === "forms" && <Forms />}
          {section === "tabs" && <TabsDemo />}
          {section === "overlays" && <Overlays />}
          {section === "feedback" && <Feedback />}
          {section === "motion" && <Motion />}
        </div>
      </div>
    </Shell>
  );
}
