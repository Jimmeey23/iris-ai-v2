"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Gauge,
  Bot,
  Sparkles,
  Tickets,
  LibraryBig,
  ChartSpline,
  UsersRound,
  Cable,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  BellRing,
  Menu,
  PanelLeft,
  Landmark,
  ArrowUpRight,
  Command,
  LifeBuoy,
  Files,
  Dumbbell,
  ClipboardCheck,
  Radar,
  Drill,
  Palette,
  MessageSquareWarning,
  Lock,
  LogOut,
  UserRoundCheck,
} from "lucide-react";
import {
  useApp,
  ThemeToggle,
  Avatar,
  Modal,
  api,
  SearchField,
  Badge,
  useDirectory,
} from "./ui";
import { IrisLockup } from "./iris-mark";
import { LiveSignal } from "@/components/live-signal";
import { GuidedTour, signalTour } from "./guided-tour";
import { isOpen } from "@/lib/metrics";
import { onVisibleInterval } from "@/lib/visible-interval";
/** The rail carries labels only — no AI / LIVE / count badges. The open-ticket
 *  figure still appears in the top bar, which is where a changing number
 *  belongs; in the nav it competed with the labels for attention. */
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};
const nav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/iris", label: "IRIS assistant", icon: Bot },
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/tickets", label: "All tickets", icon: Tickets },
  { href: "/assigned", label: "Assigned to me", icon: UserRoundCheck },
  { href: "/equipment", label: "Equipment", icon: Drill },
  { href: "/templates", label: "Template library", icon: LibraryBig },
  { href: "/reports", label: "Reports library", icon: Files },
  { href: "/analytics", label: "Trend dashboard", icon: ChartSpline },
  { href: "/trainers", label: "Trainer reviews", icon: Dumbbell },
  { href: "/forms", label: "Evaluation forms", icon: ClipboardCheck },
];
const org: NavItem[] = [
  { href: "/momence", label: "Momence", icon: Landmark },
  { href: "/staff", label: "People & teams", icon: UsersRound },
  { href: "/integrations", label: "Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];
/** Internal reference pages: administrators only, and never part of the everyday nav. */
const developer: NavItem[] = [
  { href: "/feedback", label: "Feedback console", icon: MessageSquareWarning },
  { href: "/design-system", label: "Design system", icon: Palette },
];
/** Every tab is listed for everyone; these open for administrators only. (Each
 *  of these screens is readable by any workspace role through its API, so no
 *  item is hidden outright — the lock explains itself instead.) */
const ADMIN_ONLY = ["/settings", "/integrations", "/staff", "/trainers", "/feedback"];
const lockedFor = (href: string, role?: string) =>
  role !== "admin" &&
  ADMIN_ONLY.some((h) => href === h || href.startsWith(h + "/"));
/** The button reset a locked nav item needs to sit exactly like its link siblings. */
const LOCKED_ITEM_STYLE = {
  width: "100%",
  background: "transparent",
  border: 0,
  textAlign: "left",
} as const;
const LOCKED_HINT = "Available to administrators";
/** A locked item stays focusable so keyboard and screen-reader users learn why it
 *  will not open, rather than meeting a silent, unreachable span. The lock glyph
 *  states the same thing to everyone else: dimming alone reads as "disabled for
 *  now", where a lock reads as "not yours to open". */
function LockedNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className="nav-link locked"
      aria-disabled="true"
      style={LOCKED_ITEM_STYLE}
      onClick={(e) => e.preventDefault()}
    >
      <Icon size={16} />
      <span className="nav-label">{item.label}</span>
      <span className="sr-only"> — {LOCKED_HINT.toLowerCase()}</span>
      <Lock size={12} className="nav-lock" aria-hidden="true" />
    </button>
  );
}
export { Badge };

type ShellTicket = {id: number; title: string; ticketNumber: string; memberName: string; status: string; priority: string};
type ShellNotice = {id: number; title: string; body: string | null; fromName: string | null; readAt: string | null; ticketId: number | null; ticketNumber: string | null};
/**
 * Every page renders its own Shell, so each navigation remounts it — and used to re-download
 * the 500-row ticket list and the bell on every click. Both are kept here, per signed-in
 * user, for a short while. A ticket change only invalidates (the board refreshes itself), so
 * the next navigation fetches fresh rather than every open tab fetching on every write.
 */
const SHELL_TTL_MS = 30_000;
const shellCache: {
  tickets?: {userId: number; at: number; rows: ShellTicket[]};
  notices?: {userId: number; at: number; rows: ShellNotice[]};
} = {};
function freshCache<T>(entry: {userId: number; at: number; rows: T[]} | undefined, userId: number | undefined) {
  return entry && userId !== undefined && entry.userId === userId && Date.now() - entry.at < SHELL_TTL_MS ? entry.rows : undefined;
}
if (typeof window !== "undefined")
  window.addEventListener("iris:tickets-updated", () => {
    shellCache.tickets = undefined;
  });

/** True at phone widths, where the sidebar is an off-canvas drawer and the saved
 *  "collapsed rail" preference has no meaning. Mirrors the 767px breakpoint in globals.css. */
const PHONE_QUERY = "(max-width: 767px)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const usePhone = () =>
  useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);

/** One nav renderer for all three rail sections. The previous code repeated
 *  this markup per section, which is how the developer group ended up without
 *  the tour hook the workspace group had. */
function NavSection({
  heading,
  items,
  path,
  collapsed,
  role,
  onNavigate,
  tour = false,
}: {
  heading: string;
  items: NavItem[];
  path: string;
  collapsed: boolean;
  role?: string;
  onNavigate: () => void;
  tour?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="nav-heading">{heading}</div>
      {items.map((n) => {
        const Icon = n.icon;
        const active =
          path === n.href ||
          path.startsWith(n.href + "/") ||
          (path === "/" && n.href === "/dashboard");
        if (lockedFor(n.href, role)) return <LockedNavItem key={n.href} item={n} />;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={"nav-link" + (active ? " active" : "")}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? n.label : undefined}
            title={collapsed ? n.label : undefined}
            data-tip={collapsed ? n.label : undefined}
            data-tip-pos="right"
            data-tour={tour ? "nav" + n.href.replace(/\//g, "-") : undefined}
            onClick={onNavigate}
          >
            <Icon size={16} strokeWidth={1.8} />
            <span className="nav-label">{n.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function Shell({
  children,
  title = "Overview",
  eyebrow,
  action,
  hideHeading = false,
  hideFooter = false,
  fullHeight = false,
  fullWidth = false,
  banner,
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  hideHeading?: boolean;
  hideFooter?: boolean;
  fullHeight?: boolean;
  /** Lifts the page's `max-width` cap — for a table or board meant to use the
   *  whole viewport rather than the readable-measure layout most pages want. */
  fullWidth?: boolean;
  banner?: ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const { user, openAuth, refreshUser, notify, pollSeconds } = useApp();
  /** Live presence, shared with every avatar in the app — one poll, one truth. */
  const { online } = useDirectory();
  const phone = usePhone();
  const [notices, setNotices] = useState<ShellNotice[]>(() => freshCache(shellCache.notices, user?.id) ?? []);
  const [mobile, setMobile] = useState(false),
    [collapsedPref, setCollapsed] = useState(true),
    [searchOpen, setSearchOpen] = useState(false),
    [notifications, setNotifications] = useState(false),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<ShellTicket[]>(() => freshCache(shellCache.tickets, user?.id) ?? []);
  /** The rail preference only applies where there is a persistent sidebar. */
  const collapsed = collapsedPref && !phone;
  /**
   * The topbar only claims elevation once there is content underneath it to lift
   * off. Passive listener, and it writes straight to the DOM attribute rather
   * than to state — a scroll handler that re-renders the whole shell on every
   * frame is how an app starts to feel sticky.
   */
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      el.dataset.scrolled = String(window.scrollY > 8);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!user) return;
    const cached = freshCache(shellCache.tickets, user.id);
    if (cached) {
      // Deferred, as the board does: the user arrives after the first render, so the
      // initial state could not read the cache yet.
      void Promise.resolve().then(() => setItems(cached));
      return;
    }
    // The default page (500, newest first) — the open count below is the same
    // figure the top bar shows, so the two can never disagree.
    void api<{ tickets: ShellTicket[] }>("/api/tickets")
      .then((d) => {
        shellCache.tickets = {userId: user.id, at: Date.now(), rows: d.tickets};
        setItems(d.tickets);
      })
      .catch(() => {});
  }, [user]);
  /** The guided tour gates two of its steps on these panels actually opening,
   *  and it cannot tell from the outside: both are React state, not a URL or a
   *  DOM flag. The shell says so directly. */
  useEffect(() => {
    if (searchOpen) signalTour("search");
  }, [searchOpen]);
  useEffect(() => {
    if (notifications) signalTour("notifications");
  }, [notifications]);
  /** The bell's own contents. Pushed when realtime is configured (LiveSignal turns a
   *  broadcast into `iris:notifications-updated`); the interval stays as the floor, for a
   *  dropped socket or a deployment without realtime. */
  useEffect(() => {
    if (!user) return;
    // The first call after a navigation is skipped while the cache is fresh; every later
    // tick, a realtime push and a return to the tab always fetch.
    let first = true;
    const load = () => {
      const cached = first ? freshCache(shellCache.notices, user.id) : undefined;
      first = false;
      if (cached) {
        setNotices(cached);
        return;
      }
      void api<{notifications: ShellNotice[]}>("/api/notifications")
        .then(d => {
          shellCache.notices = {userId: user.id, at: Date.now(), rows: d.notifications};
          setNotices(d.notifications);
        })
        .catch(() => {});
    };
    // Realtime pushes new notifications, so the poll is only the floor — the same one-minute
    // floor the ticket board uses — and it sleeps while the tab is hidden.
    const stop = onVisibleInterval(load, Math.max(60, pollSeconds) * 1000);
    window.addEventListener("iris:notifications-updated", load);
    return () => {
      stop();
      window.removeEventListener("iris:notifications-updated", load);
    };
  }, [user, pollSeconds]);

  const unread = notices.filter(n => !n.readAt);
  const markRead = () => {
    if (!unread.length) return;
    shellCache.notices = undefined;
    setNotices(list => list.map(n => ({...n, readAt: n.readAt ?? new Date().toISOString()})));
    void api("/api/notifications", {method: "PATCH", body: JSON.stringify({all: true})}).catch(() => {});
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const visibleNav = nav;
  const visibleOrg = org;
  const visibleDeveloper = user?.role === "admin" ? developer : [];
  // A signed-in non-admin who lands on a locked page directly sees why, not the page.
  const pageLocked = Boolean(user) && lockedFor(path, user?.role);
  const routes = [...visibleNav, ...visibleOrg, ...visibleDeveloper];
  const activeName =
    routes.find((n) => path.startsWith(n.href))?.label ||
    (path === "/" ? "Overview" : title);
  /** Heartbeat: says who is here and what they are looking at. Sixty seconds is inside the
   *  150 the API counts as present, so one dropped beat does not make somebody vanish. A
   *  hidden tab stops beating, so somebody counts as here while they have the app in front
   *  of them. */
  useEffect(() => {
    if (!user) return;
    const beat = () => {
      void api("/api/presence", {
        method: "POST",
        body: JSON.stringify({ path, label: activeName }),
      }).catch(() => {});
    };
    return onVisibleInterval(beat, 60000);
  }, [user, path, activeName]);

  const openItems = items.filter(isOpen);
  async function signOut() {
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      });
      await refreshUser();
      router.replace("/login");
      router.refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not sign out", "error");
    }
  }
  return (
    <div className={"workspace" + (collapsed ? " rail-collapsed" : "")}>
      <LiveSignal />
      {mobile && (
        <div
          className="sidebar-scrim"
          aria-hidden="true"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar" + (mobile ? " open" : "") + (collapsed ? " collapsed" : "")}>
        <Link className="brand" href="/" aria-label="IRIS — overview">
          <IrisLockup size={26} compact={collapsed} subtitle="Ops workspace" />
        </Link>
        <div className="sidebar-scrollable">
          <NavSection
            heading="Workspace"
            items={visibleNav}
            path={path}
            collapsed={collapsed}
            role={user?.role}
            onNavigate={() => setMobile(false)}
            tour
          />
          <NavSection
            heading="Organisation"
            items={visibleOrg}
            path={path}
            collapsed={collapsed}
            role={user?.role}
            onNavigate={() => setMobile(false)}
          />
          <NavSection
            heading="Developer"
            items={visibleDeveloper}
            path={path}
            collapsed={collapsed}
            role={user?.role}
            onNavigate={() => setMobile(false)}
          />
        </div>
      </aside>
      <header className="topbar" ref={topbarRef}>
        <div className="topbar-lead">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <button
            className="icon-btn desktop-sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-pressed={collapsed}
          >
            <PanelLeft size={16} />
          </button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={12} aria-hidden="true" />
            <strong key={activeName} className="breadcrumb-current">
              {activeName}
            </strong>
          </nav>
        </div>
        <div className="topbar-actions">
          <button
            className="topbar-search"
            data-tour="topbar-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Search tickets, staff and modules"
          >
            <Search size={14} />
            <span>Search or jump to…</span>
            <kbd>⌘K</kbd>
          </button>
          <span
            className="topbar-status"
            data-tour="topbar-open-count"
            title={`${openItems.length} open tickets`}
          >
            <span className="live-label" aria-hidden="true">
              <i />
            </span>
            <span className="topbar-status-count">{openItems.length}</span>
            <span className="topbar-status-label">open</span>
          </span>
          {online.length > 1 && (
            <span
              className="topbar-presence"
              title={online.map((p) => p.name + (p.viewing ? ` — ${p.viewing}` : "")).join("\n")}
            >
              <span className="topbar-presence-faces" aria-hidden="true">
                {online.slice(0, 3).map((p) => (
                  <Avatar key={p.userId ?? p.name} name={p.name} tone="purple" showPresence={false} />
                ))}
              </span>
              <span className="topbar-presence-count">{online.length}</span>
              <span className="topbar-status-label">online</span>
            </span>
          )}
          <span className="topbar-divider" aria-hidden="true" />
          <span data-tour="topbar-theme" className="topbar-tools">
            <ThemeToggle />
          </span>
          <button
            className="icon-btn topbar-bell"
            data-tour="topbar-notifications"
            aria-label={unread.length ? `Notifications (${unread.length} unread)` : "Notifications"}
            onClick={() => { setNotifications(true); markRead(); }}
          >
            <Bell size={17} strokeWidth={1.8} />
            {(unread.length > 0 || openItems.some((t) => t.priority === "critical")) && (
              <i className={"notif-dot" + (unread.length ? " notif-dot-count" : "")}>
                {unread.length > 0 && <span>{unread.length > 9 ? "9+" : unread.length}</span>}
              </i>
            )}
          </button>
          <button
            className="topbar-avatar"
            data-tour="topbar-avatar"
            onClick={() => (user ? router.push("/profile") : openAuth())}
            aria-label="Account"
          >
            <Avatar name={user?.name || "IRIS"} tone="purple" />
          </button>
        </div>
      </header>
      <div className={"workspace-main" + (collapsed ? " sidebar-collapsed" : "")}>
        {banner}
        <main
          className={
            "content" +
            (fullHeight ? " content-full-height" : "") +
            (fullWidth ? " content-full-width" : "") +
            (banner ? " has-banner" : "")
          }
        >
          {!hideHeading && (
            <div className="page-heading">
              <div className="page-heading-text">
                {eyebrow && <div className="eyebrow">{eyebrow}</div>}
                <h1>{title}</h1>
              </div>
              {action && <div className="page-heading-actions">{action}</div>}
            </div>
          )}
          {pageLocked ? (
            <div className="locked-page">
              <span className="locked-page-icon">
                <Lock size={19} />
              </span>
              <h2>This page is for administrators</h2>
              <p>
                Your account has {user?.role} access. Ask an administrator if
                you need something changed here.
              </p>
              <Link href="/dashboard" className="btn btn-sm">
                Back to the overview
              </Link>
            </div>
          ) : (
            children
          )}
          {!hideFooter && (
            <footer className="page-footer">
              <span className="page-footer-brand">
                IRIS <span className="page-footer-sep">·</span> Physique 57 India
              </span>
              <span className="page-footer-meta">
                {openItems.length} open {openItems.length === 1 ? "ticket" : "tickets"}
                <span className="page-footer-sep">·</span>
                {user ? `Signed in as ${user.name}` : "Internal workspace"}
              </span>
            </footer>
          )}
        </main>
      </div>
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
        description="Search tickets or jump to a workspace module."
        size="narrow"
      >
        <div className="stack">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search tickets, staff or modules…"
          />
          {routes
            .filter(
              (n) =>
                !query || n.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map((n) => (
              <button
                className="related-ticket"
                key={n.href}
                onClick={() => {
                  router.push(n.href);
                  setSearchOpen(false);
                }}
              >
                <span>{n.label}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          {items
            .filter(
              (t) =>
                query &&
                (t.title + " " + t.ticketNumber + " " + t.memberName)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .slice(0, 10)
            .map((t) => (
              <Link
                href={"/tickets/" + t.id}
                onClick={() => setSearchOpen(false)}
                key={t.id}
                className="related-ticket"
              >
                <div>
                  <small>{t.ticketNumber}</small>
                  <p>{t.title}</p>
                </div>
                <ChevronRight size={14} />
              </Link>
            ))}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Notifications"
        description="Reminders addressed to you, then the workspace's urgent tickets."
        size="narrow"
      >
        <div className="stack">
          {notices.length > 0 && (
            <>
              <div className="nav-heading" style={{ paddingLeft: 0 }}>FOR YOU</div>
              {notices.slice(0, 8).map((n) => (
                <Link
                  key={n.id}
                  href={n.ticketId ? "/tickets/" + n.ticketId : "/dashboard"}
                  onClick={() => setNotifications(false)}
                  className={"related-ticket" + (n.readAt ? "" : " is-unread")}
                >
                  <div>
                    <small>{n.ticketNumber || "IRIS"}</small>
                    <p>{n.title}</p>
                    {n.body && <small className="secondary">{n.body}</small>}
                  </div>
                  <BellRing size={14} />
                </Link>
              ))}
              <div className="nav-heading" style={{ paddingLeft: 0 }}>URGENT IN THE WORKSPACE</div>
            </>
          )}
          {openItems
            .filter((t) => ["critical", "high"].includes(t.priority))
            .map((t) => (
              <Link
                key={t.id}
                href={"/tickets/" + t.id}
                onClick={() => setNotifications(false)}
                className="related-ticket"
              >
                <div>
                  <small>{t.ticketNumber}</small>
                  <p>{t.title}</p>
                </div>
                <Badge tone={t.priority === "critical" ? "red" : "amber"}>
                  {t.priority}
                </Badge>
              </Link>
            ))}
          {!openItems.some((t) =>
            ["critical", "high"].includes(t.priority),
          ) && <p className="secondary">No urgent tickets need attention.</p>}
        </div>
      </Modal>
      <GuidedTour />
    </div>
  );
}
