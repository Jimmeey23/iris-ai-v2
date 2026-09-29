"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Users,
  LockKeyhole,
  Eye,
  EyeOff,
  CalendarRange,
  CalendarDays,
  Ticket,
  Building2,
  ReceiptText,
  RefreshCw,
  Plus,
  Code2,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Clock3,
  Link2,
} from "lucide-react";
import { Shell } from "@/components/shell";
import {
  api,
  useApp,
  SearchField,
  Avatar,
  Badge,
  Loading,
  Empty,
  Tabs,
} from "@/components/ui";
import { EntityDialog, OperationDialog } from "@/components/momence-tools";
import type { MomenceRecord, ModuleName } from "@/lib/momence";
import { display, indiaDate, object } from "@/lib/display";
import catalogue from "@/lib/momence-catalogue.json";
import { PasscodeDialog } from "@/components/passcode-dialog";
const modules = [
  { id: "members", name: "Members", icon: Users },
  { id: "sessions", name: "Sessions", icon: CalendarDays },
  { id: "memberships", name: "Memberships", icon: Ticket },
  { id: "studios", name: "Studios", icon: Building2 },
  { id: "sales", name: "Sales", icon: ReceiptText },
] as const;
/**
 * A month of sessions, laid out as a calendar.
 *
 * Built from whatever the list has already loaded rather than fetching its own range: the
 * page's date filter and paging still decide what is in view, so the calendar can never
 * disagree with the table beside it. Days outside the loaded set are shown, but empty —
 * an honest blank rather than an implied "no classes".
 */
function SessionCalendar({items, onPick}: {items: MomenceRecord[]; onPick: (i: MomenceRecord) => void}) {
  const dated = items
    .map(i => ({item: i, at: new Date(String(i.raw.startsAt || i.raw.startDate || ''))}))
    .filter(d => Number.isFinite(d.at.getTime()));
  if (!dated.length) return <Empty art="chart" title="Nothing to place on a calendar" detail="These sessions carry no start time." />;

  const anchor = dated[0].at;
  const year = anchor.getFullYear(), month = anchor.getMonth();
  const first = new Date(year, month, 1);
  // Monday-first, as the studio grid is read.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({length: days}, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<number, typeof dated>();
  for (const d of dated) {
    if (d.at.getFullYear() !== year || d.at.getMonth() !== month) continue;
    const day = d.at.getDate();
    byDay.set(day, [...(byDay.get(day) || []), d]);
  }
  const today = new Date();
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <div className="card session-calendar">
      <header>
        <h3>{first.toLocaleDateString('en-IN', {month: 'long', year: 'numeric'})}</h3>
        <span className="secondary">{dated.length} sessions loaded</span>
      </header>
      <div className="sc-grid" role="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="sc-head" role="columnheader">{d}</div>
        ))}
        {cells.map((day, idx) => {
          const list = day ? byDay.get(day) || [] : [];
          return (
            <div key={idx} className={'sc-cell' + (day ? '' : ' is-blank') + (day && isToday(day) ? ' is-today' : '')} role="gridcell">
              {day && <span className="sc-date">{day}</span>}
              {list.slice(0, 3).map(({item, at}) => (
                <button
                  key={item.id}
                  type="button"
                  className={'sc-chip' + (item.raw.isCancelled ? ' is-cancelled' : '')}
                  onClick={() => onPick(item)}
                  title={`${item.name} · ${at.toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}`}
                >
                  <time>{at.toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}</time>
                  <span>{item.name}</span>
                </button>
              ))}
              {list.length > 3 && <span className="sc-more">+{list.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Table is the default for every module; a view the user has explicitly chosen still wins. */
const DEFAULT_VIEW = "table";
const isModule = (m: string | null): m is ModuleName =>
  modules.some((x) => x.id === m);
/** The `?module=` deep link. Read through useSyncExternalStore so the server render and
 *  hydration agree (null), then the client picks up the URL without a setState in an effect. */
const noSubscribe = () => () => {};
const urlModule = (): ModuleName | null => {
  const m = new URLSearchParams(window.location.search).get("module");
  return isModule(m) ? m : null;
};
type ListResponse = {
  items: MomenceRecord[];
  source: string;
  total: number | null;
  hasMore: boolean;
};
/** Mirrors `canBrowseMemberData` in the API. The server is the authority — this only
 *  decides whether to show the tab as locked rather than let someone walk into a 403. */
const RESTRICTED_MODULES = new Set(["sales", "memberships"]);
const CITY_SCOPED_DEPARTMENTS = /sales|client servicing|customer service/i;

export default function MomencePage() {
  const { user, notify } = useApp();
  const isAdmin = user?.role === "admin";
  /** The member directory, for the team who work it — their own city only, which the API
   *  enforces. Sales and membership ledgers stay with administrators. */
  const canBrowseMembers =
    isAdmin || user?.role === "manager" || CITY_SCOPED_DEPARTMENTS.test(user?.department || "");
  const linked = useSyncExternalStore(noSubscribe, urlModule, () => null);
  const [picked, setPicked] = useState<ModuleName | null>(null),
    [view, setView] = useState(DEFAULT_VIEW),
    [unlocked, setUnlocked] = useState(false),
    [askCode, setAskCode] = useState(false),
    [views, setViews] = useState<Record<string, string>>({}),
    [q, setQ] = useState(""),
    [page, setPage] = useState(0),
    [date, setDate] = useState(""),
    [items, setItems] = useState<MomenceRecord[]>([]),
    [source, setSource] = useState(""),
    [total, setTotal] = useState<number | null>(null),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<MomenceRecord>(),
    [consoleOpen, setConsoleOpen] = useState(false),
    [create, setCreate] = useState(false),
    [reloads, setReloads] = useState(0),
    [doneKey, setDoneKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const requested: ModuleName = picked ?? linked ?? "members";
  // Somebody without access arriving on a member link lands on Sessions rather than a 403.
  const activeModule: ModuleName =
    (RESTRICTED_MODULES.has(requested) && !isAdmin) || (requested === "members" && !canBrowseMembers)
      ? "sessions"
      : requested;
  useEffect(() => {
    const m = urlModule();
    void api<{ moduleViews?: Record<string, string> }>("/api/preferences")
      .then((p) => {
        setViews(p.moduleViews || {});
        setView(p.moduleViews?.[m || "members"] || DEFAULT_VIEW);
      })
      .catch(() => {});
  }, []);
  // One request per (module, search, page, date, reload). `busy` is derived: the list is
  // loading until the response for exactly this key has landed, so a slow reply for an
  // older key can never overwrite a newer one.
  useEffect(() => {
    void api<{unlocked: boolean}>("/api/momence/unlock").then(d => setUnlocked(d.unlocked)).catch(() => {});
  }, []);

  async function unlock(code: string) {
    try {
      await api("/api/momence/unlock", {method: "POST", body: JSON.stringify({code})});
      setUnlocked(true);
      setAskCode(false);
      reload();
      notify("Contact details are visible for the next 30 minutes.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "That passcode is not right.", "error");
    }
  }
  async function relock() {
    try {
      await api("/api/momence/unlock", {method: "DELETE"});
      setUnlocked(false);
      reload();
      notify("Contact details hidden again.");
    } catch {
      /* Nothing useful to say: the next load masks them anyway. */
    }
  }

  const key = `${activeModule}|${q}|${page}|${date}|${reloads}`;
  const busy = doneKey !== key;
  useEffect(() => {
    let ignore = false;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // `surface=browse` tells the API this is the directory, not a ticket's member lookup:
      // it applies the team restriction and masks contact details until they are unlocked.
      const p = new URLSearchParams({ module: activeModule, q, page: String(page), surface: "browse" });
      if (activeModule === "sessions" && date)
        p.set("startAfter", new Date(date + "T00:00:00+05:30").toISOString());
      api<ListResponse>("/api/momence?" + p, { signal: ctrl.signal }).then(
        (d) => {
          if (ignore) return;
          setItems(d.items);
          setSource(d.source);
          setTotal(d.total);
          setMore(d.hasMore);
          setError("");
          setDoneKey(key);
          api<{ configured: boolean }>("/api/momence?action=status", {
            signal: ctrl.signal,
          })
            .then((s) => {
              if (!ignore) setConfigured(s.configured);
            })
            .catch(() => {});
        },
        (e: unknown) => {
          if (ignore || ctrl.signal.aborted) return;
          setError((e as Error).message);
          setItems([]);
          setDoneKey(key);
        },
      );
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, activeModule, q, page, date]);
  const reload = () => setReloads((n) => n + 1);
  function changeModule(m: ModuleName) {
    setPicked(m);
    setQ("");
    setPage(0);
    setDate("");
    setView(views[m] || DEFAULT_VIEW);
  }
  function changeView(v: string) {
    setView(v);
    const updated = { ...views, [activeModule]: v };
    setViews(updated);
    void api("/api/preferences", {
      method: "PATCH",
      body: JSON.stringify({ moduleViews: updated }),
    }).catch(() => {});
  }
  const createOp = catalogue.find(
    (o) => o.method === "POST" && o.path === "/api/v2/host/members",
  );
  const Icon = modules.find((m) => m.id === activeModule)!.icon;
  return (
    <Shell
      title="Your studio, connected."
      eyebrow="MOMENCE WORKSPACE"
      action={
        <div className="flex-row">
          <button className="btn" onClick={() => setConsoleOpen(true)}>
            <Code2 size={14} />
            API catalogue
          </button>
          {activeModule === "members" && (
            <button className="btn btn-primary" onClick={() => setCreate(true)}>
              <Plus size={14} />
              Create member
            </button>
          )}
        </div>
      }
    >
      <div className="between wrap" style={{ marginBottom: 21 }}>
        <p className="secondary" style={{ fontSize: 12 }}>
          One place for your members, classes, memberships and studio data.
        </p>
        <Badge
          tone={
            source === "live"
              ? "green"
              : source === "workspace"
                ? "blue"
                : "amber"
          }
        >
          <Link2 size={11} />
          {source === "live"
            ? "Live Momence connection"
            : source === "workspace"
              ? "Workspace directory"
              : configured
                ? "Connection configured"
                : "Demo mode · credentials not connected"}
        </Badge>
      </div>
      <Tabs
        label="Momence modules"
        variant="underline"
        className="module-tabs"
        value={activeModule}
        onChange={changeModule}
        items={modules.map((m) => {
          const I = m.icon;
          const locked = (RESTRICTED_MODULES.has(m.id) && !isAdmin) || (m.id === "members" && !canBrowseMembers);
          return {
            id: m.id,
            disabled: locked,
            label: (
              <>
                {locked ? <LockKeyhole size={14} /> : <I size={15} />}
                {m.name}
              </>
            ),
          };
        })}
      />
      <PasscodeDialog
        open={askCode}
        onClose={() => setAskCode(false)}
        onUnlock={() => {}}
        onCode={(code) => void unlock(code)}
        title="Show contact details"
        description="Member emails and phone numbers are hidden while you browse. The passcode reveals them on this device for 30 minutes."
      />
      <div className="card" style={{ padding: "15px 18px", marginBottom: 20 }}>
        <div className="between wrap">
          <div className="flex-row grow">
            <SearchField
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(0);
              }}
              placeholder={`Search ${activeModule}…`}
            />
            {activeModule === "sessions" && (
              <input
                type="date"
                aria-label="Sessions from date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(0);
                }}
                style={{ fontSize: 11, padding: 8 }}
              />
            )}
          </div>
          <div className="flex-row">
            <span className="muted" style={{ fontSize: 10 }}>
              {total !== null ? total + " records" : "Page " + (page + 1)}
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={reload}
              aria-label="Refresh module"
            >
              <RefreshCw size={14} />
            </button>
            {canBrowseMembers && (
              <button
                type="button"
                className={"btn btn-sm" + (unlocked ? " btn-ghost" : "")}
                onClick={() => (unlocked ? void relock() : setAskCode(true))}
                title={unlocked ? "Hide contact details again" : "Enter the passcode to reveal contact details"}
              >
                {unlocked ? <><EyeOff size={13} /> Hide contacts</> : <><Eye size={13} /> Reveal contacts</>}
              </button>
            )}
            <div className="view-switch" role="group" aria-label="Layout">
              <button
                aria-label="Card view"
                title="Cards"
                type="button"
                aria-pressed={view === "cards"}
                className={view === "cards" ? "active" : ""}
                onClick={() => changeView("cards")}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                aria-label="Table view"
                title="Table"
                type="button"
                aria-pressed={view === "table"}
                className={view === "table" ? "active" : ""}
                onClick={() => changeView("table")}
              >
                <List size={14} />
              </button>
              {activeModule === "sessions" && (
                <>
                  <button
                    aria-label="Agenda view"
                    title="Agenda"
                    type="button"
                    aria-pressed={view === "agenda"}
                    className={view === "agenda" ? "active" : ""}
                    onClick={() => changeView("agenda")}
                  >
                    <CalendarDays size={14} />
                  </button>
                  <button
                    aria-label="Calendar view"
                    title="Calendar"
                    type="button"
                    aria-pressed={view === "calendar"}
                    className={view === "calendar" ? "active" : ""}
                    onClick={() => changeView("calendar")}
                  >
                    <CalendarRange size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {error && (
        <div className="error-box" style={{ marginBottom: 20 }}>
          {error}{" "}
          <button type="button" className="text-btn" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      <div
        className="module-scroll"
        key={activeModule}
        aria-label={`${activeModule} scrollable results`}
      >
        {busy ? (
          <Loading />
        ) : !items.length ? (
          <Empty
            art="chart"
            title={
              source === "demo" && activeModule === "sales"
                ? "Sales need a live connection"
                : "No " + activeModule + " found"
            }
            detail={
              source === "demo" && activeModule === "sales"
                ? "We do not invent payment or sales transactions. Connect Momence to load your actual sales."
                : "Try another search, date or page."
            }
          />
        ) : view === "table" ? (
          <div className="card table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{activeModule === "sales" ? "Transaction" : "Name"}</th>
                  <th>
                    {activeModule === "sessions" ? "Instructor / studio" : "Details"}
                  </th>
                  <th>{activeModule === "sessions" ? "Class time" : "Identifier"}</th>
                  <th>{activeModule === "sessions" ? "Capacity" : "View"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} onClick={() => setSelected(i)}>
                    <td>
                      {/* The row stays clickable; the name is the keyboard target. */}
                      <button
                        type="button"
                        className="text-btn ticket-name"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(i);
                        }}
                      >
                        {i.name}
                      </button>
                    </td>
                    <td style={{ whiteSpace: "normal" }}>
                      {i.subtitle || display(i.raw.description)}
                    </td>
                    <td>
                      {activeModule === "sessions"
                        ? indiaDate(i.raw.startsAt)
                        : "#" + i.id}
                    </td>
                    <td>
                      {activeModule === "sessions" ? (
                        `${display(i.raw.bookingCount)} / ${display(i.raw.capacity)}`
                      ) : (
                        <ArrowUpRight size={13} aria-hidden />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "calendar" ? (
          <SessionCalendar items={items} onPick={setSelected} />
        ) : view === "agenda" ? (
          <div className="stack">
            {items.map((i) => (
              <button
                className="card entity-card between"
                key={i.id}
                onClick={() => setSelected(i)}
                style={{ minHeight: 95 }}
              >
                <div className="flex-row">
                  <div className="template-icon">
                    <Clock3 size={21} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0 }}>{i.name}</h3>
                    <p>{i.subtitle}</p>
                  </div>
                </div>
                <div>
                  <Badge tone={i.raw.isCancelled ? "red" : "blue"}>
                    {i.raw.isCancelled
                      ? "Cancelled"
                      : indiaDate(i.raw.startsAt)}
                  </Badge>
                  <p>
                    {display(i.raw.bookingCount)} / {display(i.raw.capacity)}{" "}
                    booked
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="entity-grid">
            {items.map((i, n) => (
              <button
                className="card entity-card"
                key={i.id}
                onClick={() => setSelected(i)}
              >
                <div className="between">
                  {activeModule === "members" ? (
                    <Avatar
                      name={i.name}
                      large
                      tone={n % 3 === 0 ? "purple" : n % 3 === 1 ? "green" : ""}
                    />
                  ) : (
                    <div className="template-icon">
                      <Icon size={20} />
                    </div>
                  )}
                  <Badge
                    tone={
                      activeModule === "sessions" && i.raw.isCancelled
                        ? "red"
                        : "blue"
                    }
                  >
                    {activeModule === "sessions"
                      ? i.raw.isCancelled
                        ? "Cancelled"
                        : display(i.raw.bookingCount) +
                          " / " +
                          display(i.raw.capacity) +
                          " booked"
                      : activeModule === "members"
                        ? display(object(i.raw.visits).totalVisits) + " visits"
                        : "#" + i.id}
                  </Badge>
                </div>
                <h3>{i.name}</h3>
                <p>{i.subtitle}</p>
                <div className="entity-foot">
                  <span>
                    {activeModule === "sessions"
                      ? indiaDate(i.raw.startsAt)
                      : activeModule === "members"
                        ? "Member profile"
                        : activeModule === "studios"
                          ? "Studio overview"
                          : activeModule === "sales"
                            ? indiaDate(i.raw.saleDate)
                            : display(i.raw.type)}
                  </span>
                  <ArrowUpRight size={14} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="between" style={{ marginTop: 13 }}>
        <p className="muted" style={{ fontSize: 10 }}>
          {source === "demo"
            ? "Illustrative records only · connect in Integrations"
            : source === "workspace"
              ? "Studio constants · not Momence location IDs"
              : "Live data fetched securely from Momence"}
          {q && activeModule !== "members"
            ? " · Search applies to the loaded page"
            : ""}
        </p>
        <div className="flex-row">
          <button
            className="btn btn-sm"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={13} />
          </button>
          <span className="secondary" style={{ fontSize: 10 }}>
            Page {page + 1}
          </span>
          <button
            className="btn btn-sm"
            disabled={!more || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      {selected && (
        <EntityDialog
          open
          onClose={() => setSelected(undefined)}
          module={activeModule}
          id={selected.id}
          record={selected}
          source={source}
        />
      )}
      <OperationDialog
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        onSuccess={reload}
      />
      {createOp && (
        <OperationDialog
          open={create}
          onClose={() => setCreate(false)}
          operationId={createOp.id}
          initialBody={{ firstName: "", lastName: "", email: "" }}
          onSuccess={reload}
        />
      )}
    </Shell>
  );
}
