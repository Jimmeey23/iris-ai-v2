"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { api, useApp } from "./ui";

/**
 * The first-run walkthrough.
 *
 * Every step points at a real element in the shell through a `data-tour`
 * attribute rather than a CSS class, so restyling the chrome cannot silently
 * unhook the tour. A step whose anchor is missing — a nav item hidden on
 * mobile, a module the account cannot open — is dropped before the tour starts
 * instead of spotlighting empty space.
 *
 * Completion is stored per identity in `/api/preferences` (keyed by workspace
 * user, falling back to the browser cookie), so someone who has taken the tour
 * on the studio iPad is not shown it again on their laptop. Bumping
 * TOUR_VERSION re-runs it for everyone — use that only when the chrome itself
 * changes enough that the old walkthrough would mislead.
 */
export const TOUR_VERSION = 1;
const START_EVENT = "iris:start-tour";
/** Fired by the "Replay the tour" control on the profile page. */
export function startGuidedTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

type Step = {
  /** Matches `data-tour="…"` in the shell; absent for the opening card. */
  anchor?: string;
  title: string;
  body: string;
  /** Preferred side of the anchor; flipped automatically when it would overflow. */
  place?: "right" | "bottom" | "left" | "top";
};

const STEPS: Step[] = [
  {
    title: "Welcome to IRIS",
    body: "A two-minute look around the workspace: where tickets live, how IRIS helps you work them, and the handful of controls you will reach for every day.",
  },
  {
    anchor: "nav-dashboard",
    place: "right",
    title: "Overview",
    body: "Your landing page. Live counts, breaches about to happen and what changed since you were last here.",
  },
  {
    anchor: "nav-iris",
    place: "right",
    title: "IRIS assistant",
    body: "Describe an issue in plain words and IRIS drafts the ticket — member, studio, category and priority filled in. It also answers questions about tickets already logged.",
  },
  {
    anchor: "nav-radar",
    place: "right",
    title: "Radar",
    body: "Studio operations at a glance: what is ageing, what is unassigned and where the same problem keeps coming back.",
  },
  {
    anchor: "nav-tickets",
    place: "right",
    title: "All tickets",
    body: "The full queue. Filter it, switch between list, board and card views, and save the combinations you return to.",
  },
  {
    anchor: "nav-equipment",
    place: "right",
    title: "Equipment",
    body: "Every machine, its service history and the tickets raised against it.",
  },
  {
    anchor: "topbar-search",
    place: "bottom",
    title: "Search anything",
    body: "Tickets, people and modules from one field. ⌘K — or Ctrl+K — opens it from any page.",
  },
  {
    anchor: "topbar-open-count",
    place: "bottom",
    title: "Open tickets",
    body: "A live count of everything still open in the workspace. It is the same figure the overview reports, so the two never disagree.",
  },
  {
    anchor: "topbar-notifications",
    place: "bottom",
    title: "Urgent work",
    body: "Critical and high-priority tickets, one click away. The dot appears the moment something critical is open.",
  },
  {
    anchor: "topbar-theme",
    place: "bottom",
    title: "Light or dark",
    body: "Your choice follows your account, not this browser.",
  },
  {
    anchor: "topbar-avatar",
    place: "left",
    title: "Your account",
    body: "Name, password and sign-out — and the button that replays this tour whenever you want it again.",
  },
  {
    title: "That is the tour",
    body: "Everything here is also in the user guide under Reports. Raise your first ticket from the IRIS assistant, or head to the overview to see where things stand.",
  },
];

const PAD = 8;
const CARD_W = 340;
const GAP = 14;

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // A zero-size box means the element is present but not shown (collapsed rail,
  // mobile breakpoint). Treat it as absent rather than pointing at nothing.
  if (r.width < 2 || r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function GuidedTour() {
  const { user } = useApp();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const running = steps !== null;
  const step = running ? steps[index] : null;

  const begin = useCallback(() => {
    // Anchors are resolved once, at the start: a tour that silently loses a step
    // halfway through reads as a bug, where a shorter tour reads as intentional.
    const usable = STEPS.filter((s) => !s.anchor || rectOf(s.anchor));
    setIndex(0);
    setSteps(usable);
  }, []);

  useEffect(() => {
    const handler = () => begin();
    window.addEventListener(START_EVENT, handler);
    return () => window.removeEventListener(START_EVENT, handler);
  }, [begin]);

  /** First run: ask the server whether this person has already been shown it. */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api<{ tour?: { version?: number } }>("/api/preferences")
      .then((p) => {
        if (cancelled) return;
        if ((p.tour?.version ?? 0) >= TOUR_VERSION) return;
        // One frame of grace so the shell has painted and the anchors measure true.
        window.setTimeout(begin, 600);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, begin]);

  const finish = useCallback(
    (completed: boolean) => {
      setSteps(null);
      setRect(null);
      void api("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          tour: { version: TOUR_VERSION, completedAt: new Date().toISOString(), completed },
        }),
      }).catch(() => {});
    },
    [],
  );

  /** Track the anchor: the page can scroll or resize under an open tour. */
  useLayoutEffect(() => {
    if (!running) return;
    const measure = () => setRect(step?.anchor ? rectOf(step.anchor) : null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [running, step]);

  useEffect(() => {
    if (running) cardRef.current?.focus();
  }, [running, index]);

  const next = useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) finish(true);
    else setIndex((i) => i + 1);
  }, [steps, index, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // The page behind must not scroll away from the element being pointed at.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [running, next, back, finish]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) return {};
    const vw = window.innerWidth,
      vh = window.innerHeight;
    let place = step?.place ?? "bottom";
    // Flip to the opposite side when the preferred one has no room for the card.
    if (place === "right" && rect.left + rect.width + GAP + CARD_W > vw) place = "left";
    if (place === "left" && rect.left - GAP - CARD_W < 0) place = "right";
    if (place === "bottom" && rect.top + rect.height + GAP + 220 > vh) place = "top";
    if (place === "top" && rect.top - GAP - 220 < 0) place = "bottom";
    const clampLeft = (v: number) => Math.min(Math.max(12, v), Math.max(12, vw - CARD_W - 12));
    const clampTop = (v: number) => Math.min(Math.max(12, v), Math.max(12, vh - 240));
    if (place === "right")
      return { top: clampTop(rect.top - 8), left: clampLeft(rect.left + rect.width + GAP) };
    if (place === "left")
      return { top: clampTop(rect.top - 8), left: clampLeft(rect.left - GAP - CARD_W) };
    if (place === "top")
      return { top: clampTop(rect.top - GAP - 230), left: clampLeft(rect.left + rect.width / 2 - CARD_W / 2) };
    return {
      top: clampTop(rect.top + rect.height + GAP),
      left: clampLeft(rect.left + rect.width / 2 - CARD_W / 2),
    };
  }, [rect, step]);

  if (!running || !step || !steps) return null;
  const last = index === steps.length - 1;

  return (
    <div className="tour-root" role="presentation">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour-scrim" aria-hidden="true" />
      )}
      <div
        className={"tour-card" + (rect ? "" : " tour-card-centred")}
        style={rect ? cardStyle : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        ref={cardRef}
      >
        <div className="tour-card-head">
          <span className="tour-badge">
            <Compass size={13} />
            Guided tour
          </span>
          <button
            type="button"
            className="tour-close"
            onClick={() => finish(false)}
            aria-label="Skip the tour"
          >
            <X size={15} />
          </button>
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-progress" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s.title} className={i === index ? "on" : i < index ? "done" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          <span className="tour-count">
            {index + 1} of {steps.length}
          </span>
          <div className="tour-buttons">
            {index > 0 && (
              <button type="button" className="btn btn-ghost" onClick={back}>
                <ArrowLeft size={15} />
                Back
              </button>
            )}
            {!last && (
              <button type="button" className="btn btn-ghost" onClick={() => finish(false)}>
                Skip
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={next}>
              {last ? (
                <>
                  <Check size={15} />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
