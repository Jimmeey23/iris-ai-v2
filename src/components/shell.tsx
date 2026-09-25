"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Lock,
} from "lucide-react";
import {
  useApp,
  ThemeToggle,
  Avatar,
  Modal,
  api,
  SearchField,
  Badge,
} from "./ui";
import { IrisLockup } from "./iris-mark";
import { isOpen } from "@/lib/metrics";
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  ai?: boolean;
  live?: boolean;
};
const nav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/iris", label: "IRIS assistant", icon: Bot, ai: true },
  { href: "/radar", label: "Ops Radar & Heatmap", icon: Radar, live: true },
  { href: "/tickets", label: "All tickets", icon: Tickets },
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
  { href: "/design-system", label: "Design system", icon: Palette },
];
/** Every tab is listed for everyone; these open for administrators only. (Each
 *  of these screens is readable by any workspace role through its API, so no
 *  item is hidden outright — the lock explains itself instead.) */
const ADMIN_ONLY = ["/settings", "/integrations", "/staff", "/trainers"];
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
 *  will not open, rather than meeting a silent, unreachable span. */
function LockedNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className="nav-link locked"
      aria-disabled="true"
      data-tip={LOCKED_HINT}
      data-tip-pos="right"
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
  const { user, openAuth, workspaceName } = useApp();
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(true),
    [searchOpen, setSearchOpen] = useState(false),
    [notifications, setNotifications] = useState(false),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<
      {
        id: number;
        title: string;
        ticketNumber: string;
        memberName: string;
        status: string;
        priority: string;
      }[]
    >([]);
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
    // The default page (500, newest first) — the open count below is the same
    // figure the top bar shows, so the two can never disagree.
    void api<{ tickets: typeof items }>("/api/tickets")
      .then((d) => setItems(d.tickets))
      .catch(() => {});
  }, [user]);
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
  const openItems = items.filter(isOpen);
  return (
    <div className="workspace">
      {mobile && (
        <div
          className="sidebar-scrim"
          aria-hidden="true"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar" + (mobile ? " open" : "") + (collapsed ? " collapsed" : "")}>
        <Link className="brand" href="/">
          <IrisLockup size={30} />
        </Link>
        <Link href="/settings" className="workspace-selector">
          <div className="mini-spark">
            <Sparkles size={15} />
          </div>
          <div className="grow">
            <strong style={{ fontWeight: 500 }}>IRIS workspace</strong>
            <div className="muted" style={{ fontSize: "var(--text-3xs)" }}>
              {workspaceName}
            </div>
          </div>
          <ChevronDown size={13} />
        </Link>
        <div className="sidebar-scrollable">
          <div className="nav-heading">WORKSPACE</div>
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const active =
              path === n.href || (path === "/" && n.href === "/dashboard");
            if (lockedFor(n.href, user?.role))
              return <LockedNavItem key={n.href} item={n} />;
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
                onClick={() => setMobile(false)}
              >
                <Icon size={16} />
                <span className="nav-label">{n.label}</span>
                {n.ai && <span className="nav-ai">AI</span>}
                {n.href === "/radar" && (
                  <span className="nav-radar-pill">LIVE</span>
                )}
                {n.href === "/tickets" && (
                  <span
                    className="nav-count"
                    aria-label={openItems.length + " open tickets"}
                  >
                    {openItems.length}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="nav-heading">ORGANIZATION</div>
          {visibleOrg.map((n) => {
            const Icon = n.icon;
            const active = path.startsWith(n.href);
            if (lockedFor(n.href, user?.role))
              return <LockedNavItem key={n.href} item={n} />;
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
                onClick={() => setMobile(false)}
              >
                <Icon size={16} />
                <span className="nav-label">{n.label}</span>
              </Link>
            );
          })}
          {visibleDeveloper.length > 0 && (
            <>
              <div className="nav-heading">DEVELOPER</div>
              {visibleDeveloper.map((n) => {
                const Icon = n.icon;
                const active = path.startsWith(n.href);
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
                    onClick={() => setMobile(false)}
                  >
                    <Icon size={16} />
                    <span className="nav-label">{n.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="flex-row">
              <Sparkles size={14} className="accent" />
              <strong style={{ fontSize: 11, fontWeight: 500 }}>
                Log it with IRIS
              </strong>
            </div>
            <p>
              Turn what you saw — or what a member told you — into a clean
              ticket.
            </p>
            <Link href="/iris" className="text-btn">
              Start logging <ArrowUpRight size={13} />
            </Link>
          </div>
          <button
            className="user-button"
            onClick={() => (user ? router.push("/profile") : openAuth())}
          >
            <Avatar name={user?.name || "Guest"} tone="purple" />
            <div className="grow">
              <strong>{user?.name || "Not signed in"}</strong>
              <small>
                {user ? user.role + " access" : "Sign in to your account"}
              </small>
            </div>
            <ChevronDown size={13} className="muted" />
          </button>
        </div>
      </aside>
      <div className={"workspace-main" + (collapsed ? " sidebar-collapsed" : "")}>
        <header className="topbar" ref={topbarRef}>
          <div className="flex-row">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <button
              className="icon-btn desktop-sidebar-toggle"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-pressed={collapsed}
            >
              <PanelLeft size={17} />
            </button>
            <div className="breadcrumb">
              <PanelLeft size={15} />
              <span>Workspace</span>
              <ChevronRight size={11} />
              <strong key={activeName} className="breadcrumb-current">
                {activeName}
              </strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={14} />
              <span>Search tickets, staff, modules…</span>
              <kbd>⌘K</kbd>
            </button>
            <span className="topbar-divider" />
            <span
              className="topbar-status"
              title={openItems.length + " open tickets"}
            >
              <span className="live-label">
                <i />
              </span>
              <span className="topbar-status-count">{openItems.length}</span>
              <span className="topbar-status-label">open</span>
            </span>
            <span className="topbar-divider" />
            <ThemeToggle />
            <button
              className="icon-btn"
              aria-label="Open notifications"
              onClick={() => setNotifications(true)}
              style={{ position: "relative" }}
            >
              <Bell size={17} />
              {openItems.some((t) => t.priority === "critical") && (
                <i className="notif-dot" />
              )}
            </button>
            <span className="topbar-divider" />
            <button
              className="topbar-avatar"
              onClick={() => (user ? router.push("/profile") : openAuth())}
              aria-label="Account"
            >
              <Avatar name={user?.name || "IRIS"} tone="purple" />
            </button>
          </div>
        </header>
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
              <div>
                {eyebrow && <div className="eyebrow">{eyebrow}</div>}
                <h1>{title}</h1>
              </div>
              {action}
            </div>
          )}
          {pageLocked ? (
            <div className="locked-page">
              <span className="locked-page-icon">
                <Lock size={20} />
              </span>
              <h2>This page is for administrators</h2>
              <p>
                Your account has {user?.role} access. Ask an administrator if
                you need something changed here.
              </p>
              <Link href="/dashboard" className="btn">
                Back to the overview
              </Link>
            </div>
          ) : (
            children
          )}
          {!hideFooter && (
            <footer className="page-footer">
              <span>
                <span className="live-label">
                  <i />
                </span>
                Every issue logged. Every follow-up tracked.
              </span>
              <span className="page-footer-brand">
                IRIS <span className="page-footer-sep">/</span> Physique 57
                India <span style={{ color: "var(--accent)" }}>✧</span>
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
        title="Priority tickets"
        description="Open critical and high-priority tickets in the workspace."
        size="narrow"
      >
        <div className="stack">
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
    </div>
  );
}
