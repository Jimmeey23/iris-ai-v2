"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Compass, Hand, X } from "lucide-react";
import { api, useApp } from "./ui";

/**
 * The first-run walkthrough.
 *
 * Two things make it more than a slideshow:
 *
 *  1. **It gates on real actions.** The steps that matter — opening search,
 *     opening the IRIS assistant, switching theme — do not offer a Next button.
 *     They open a hole in the overlay over the real control and wait for the
 *     person to use it. Reading that search exists teaches far less than
 *     pressing ⌘K once. Every gated step still carries a quiet "skip this one",
 *     so nobody is trapped by a control they cannot reach.
 *  2. **It survives navigation.** A gated step that sends you to another page
 *     would otherwise end the tour, since the shell remounts. Progress lives in
 *     sessionStorage and is picked up again by the next page's shell.
 *
 * Every step points at a real element through a `data-tour` attribute rather
 * than a CSS class, so restyling the chrome cannot silently unhook the tour. A
 * step whose anchor is missing — a nav item hidden on mobile, a module the
 * account cannot open — is dropped before the tour starts instead of
 * spotlighting empty space.
 *
 * Completion is stored per identity in `/api/preferences` (keyed by workspace
 * user, falling back to the browser cookie), so someone who has taken the tour
 * on the studio iPad is not shown it again on their laptop. Bumping
 * TOUR_VERSION re-runs it for everyone — use that only when the chrome itself
 * changes enough that the old walkthrough would mislead.
 */
export const TOUR_VERSION = 2;
const START_EVENT = "iris:start-tour";
/** Shell tells the tour when a panel it asked for has actually opened. */
export const TOUR_SIGNAL = "iris:tour-signal";
const RESUME_KEY = "iris-tour-progress";

/** Fired by the "Replay the tour" control on the profile page. */
export function startGuidedTour() {
  window.dispatchEvent(new Event(START_EVENT));
}
/** Called from the shell: `signalTour("search")` when the search dialog opens. */
export function signalTour(name: string) {
  window.dispatchEvent(new CustomEvent(TOUR_SIGNAL, { detail: name }));
}

type Require =
  /** Waits for `signalTour(name)` — a panel the shell owns has opened. */
  | { kind: "signal"; name: string; hint: string }
  /** Waits for `<html data-theme>` to change. */
  | { kind: "theme"; hint: string }
  /** Waits for the router to land on a path. The tour resumes on the new page. */
  | { kind: "route"; path: string; hint: string };

type Step = {
  id: string;
  /** Matches `data-tour="…"` in the shell; absent for the opening card. */
  anchor?: string;
  title: string;
  body: string;
  /** Preferred side of the anchor; flipped automatically when it would overflow. */
  place?: "right" | "bottom" | "left" | "top";
  /** Present on a gated step: what the person has to do to move on. */
  require?: Require;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to IRIS",
    body: "A short, hands-on tour. You will actually use a few of these controls rather than just read about them — it takes about two minutes.",
  },
  {
    id: "search",
    anchor: "topbar-search",
    place: "bottom",
    title: "Find anything, from anywhere",
    body: "Tickets, people and modules from one field. Open it — click the box, or press ⌘K (Ctrl+K on Windows).",
    require: { kind: "signal", name: "search", hint: "Open search to continue" },
  },
  {
    id: "notifications",
    anchor: "topbar-notifications",
    place: "bottom",
    title: "What needs you now",
    body: "Critical and high-priority tickets sit behind the bell, and the dot appears the moment something critical is open. Give it a click.",
    require: { kind: "signal", name: "notifications", hint: "Open the bell to continue" },
  },
  {
    id: "theme",
    anchor: "topbar-theme",
    place: "bottom",
    title: "Light or dark, your choice",
    body: "Switch the theme. It follows your account rather than this browser, so the studio iPad and your laptop agree.",
    require: { kind: "theme", hint: "Switch the theme to continue" },
  },
  {
    id: "open-count",
    anchor: "topbar-open-count",
    place: "bottom",
    title: "Open tickets, live",
    body: "The number of tickets still open across the workspace. It is the same figure the overview reports, so the two never disagree.",
  },
  {
    id: "nav-radar",
    anchor: "nav-radar",
    place: "right",
    title: "Radar",
    body: "Studio operations at a glance: what is ageing, what is unassigned, and where the same problem keeps coming back.",
  },
  {
    id: "nav-tickets",
    anchor: "nav-tickets",
    place: "right",
    title: "The full queue",
    body: "Every ticket, filterable, in list, board or card view — and the filter combinations you return to can be saved.",
  },
  {
    id: "nav-equipment",
    anchor: "nav-equipment",
    place: "right",
    title: "Equipment",
    body: "Every machine, its service history, and the tickets raised against it.",
  },
  {
    id: "nav-iris",
    anchor: "nav-iris",
    place: "right",
    title: "Now raise something with IRIS",
    body: "Describe an issue in plain words and IRIS drafts the ticket for you — member, studio, category and priority filled in. Open it and see.",
    require: { kind: "route", path: "/iris", hint: "Open the IRIS assistant to continue" },
  },
  {
    id: "iris-compose",
    anchor: "iris-composer",
    place: "top",
    title: "Type it the way you would say it",
    body: "“Treadmill 3 at Kemps Corner is making a grinding noise” is enough. IRIS asks only for what it still needs, then shows you the draft before anything is logged.",
  },
  {
    id: "avatar",
    anchor: "topbar-avatar",
    place: "left",
    title: "Your account",
    body: "Name, password and sign-out live here — along with the button that replays this tour whenever you want it again.",
  },
  {
    id: "done",
    title: "You are set up",
    body: "That is the workspace. Raise your first real ticket with IRIS, or head back to the overview to see where things stand.",
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

/** Steps whose anchor exists on *this* page, or which point at nothing at all.
 *  A step gated on a route is kept even when its anchor is not here yet — it is
 *  the step that takes you to the page where the anchor lives. */
function usableSteps(): Step[] {
  return STEPS.filter((s) => !s.anchor || s.require?.kind === "route" || rectOf(s.anchor) || s.id === "iris-compose");
}

type Progress = { ids: string[]; index: number };
function readProgress(): Progress | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Progress;
    return Array.isArray(p.ids) && typeof p.index === "number" ? p : null;
  } catch {
    return null;
  }
}
function writeProgress(p: Progress | null) {
  try {
    if (p) sessionStorage.setItem(RESUME_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* Private browsing: the tour simply will not survive a navigation. */
  }
}

/** A short burst of paper, thrown once when the tour is finished. Canvas rather
 *  than a few hundred DOM nodes, and it takes itself down when the last piece
 *  has fallen off-screen. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth,
      h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const colours = ["#f4bb3d", "#ffd166", "#b39dff", "#57d6a8", "#8ec5ff", "#f6f4ee"];
    // Two cannons, fired inward from the lower corners: a single overhead
    // shower reads as rain, where crossing arcs read as celebration.
    const pieces = Array.from({ length: 150 }, (_, i) => {
      const left = i % 2 === 0;
      // Up and inward: -45° from the left corner, -135° from the right one.
      const angle = (left ? -Math.PI / 4 : -3 * (Math.PI / 4)) + (Math.random() - 0.5) * 0.7;
      const speed = 13 + Math.random() * 10;
      return {
        x: left ? -10 : w + 10,
        y: h * 0.86,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 6,
        colour: colours[i % colours.length],
        wobble: Math.random() * Math.PI * 2,
      };
    });
    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of pieces) {
        p.vy += 0.32; // gravity
        p.vx *= 0.995; // drag
        p.wobble += 0.12;
        p.x += p.vx + Math.sin(p.wobble) * 0.7;
        p.y += p.vy;
        p.rot += p.spin;
        if (p.y > h + 40) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        // Flattening with the rotation gives each piece the flutter of paper
        // rather than the tumble of a solid block.
        // Simulated: the last piece leaves the frame around 160, so the fade
        // has to start before that or it never shows.
        ctx.globalAlpha = frame > 100 ? Math.max(0, 1 - (frame - 100) / 70) : 1;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        ctx.restore();
      }
      if (alive > 0 && frame < 260) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="tour-confetti" aria-hidden="true" />;
}

export function GuidedTour() {
  const { user } = useApp();
  const path = usePathname();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [satisfied, setSatisfied] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const running = steps !== null;
  const step = running ? steps[index] : null;
  const gate = step?.require;

  const begin = useCallback(() => {
    const usable = usableSteps();
    setIndex(0);
    setSatisfied(false);
    setSteps(usable);
    writeProgress({ ids: usable.map((s) => s.id), index: 0 });
  }, []);

  useEffect(() => {
    const handler = () => begin();
    window.addEventListener(START_EVENT, handler);
    return () => window.removeEventListener(START_EVENT, handler);
  }, [begin]);

  /** Resume a tour that navigated to this page mid-way. Deferred by a tick: the
   *  new page's shell is still mounting, and the resumed step's anchor has to
   *  exist before the tour measures it. */
  useEffect(() => {
    const saved = readProgress();
    if (!saved) return;
    const resumed = saved.ids
      .map((id) => STEPS.find((s) => s.id === id))
      .filter((s): s is Step => Boolean(s));
    if (!resumed.length) return;
    const t = window.setTimeout(() => {
      setSteps(resumed);
      setIndex(Math.min(saved.index, resumed.length - 1));
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  /** First run: ask the server whether this person has already been shown it. */
  useEffect(() => {
    if (!user || readProgress()) return;
    let cancelled = false;
    void api<{ tour?: { version?: number } }>("/api/preferences")
      .then((p) => {
        if (cancelled) return;
        if ((p.tour?.version ?? 0) >= TOUR_VERSION) return;
        // A beat of grace so the shell has painted and the anchors measure true.
        window.setTimeout(begin, 600);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, begin]);

  const close = useCallback(
    (completed: boolean) => {
      setSteps(null);
      setRect(null);
      writeProgress(null);
      void api("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          tour: { version: TOUR_VERSION, completedAt: new Date().toISOString(), completed },
        }),
      }).catch(() => {});
    },
    [],
  );
  const finish = useCallback(() => {
    close(true);
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 3400);
  }, [close]);

  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      setSatisfied(false);
      setSteps((s) => {
        if (s) writeProgress({ ids: s.map((x) => x.id), index: i });
        return s;
      });
    },
    [],
  );
  const next = useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) finish();
    else goTo(index + 1);
  }, [steps, index, finish, goTo]);
  const back = useCallback(() => goTo(Math.max(0, index - 1)), [goTo, index]);

  /** Watch for the action a gated step is waiting on. */
  useEffect(() => {
    // `satisfied` is cleared when the step changes (see goTo), not here.
    if (!running || !gate) return;
    if (gate.kind === "route") {
      // The route step is satisfied by the page it asked for, which is this very
      // render once the router has landed.
      if (!path.startsWith(gate.path)) return;
      const mark = window.setTimeout(() => setSatisfied(true), 0);
      const advance = window.setTimeout(next, 450);
      return () => {
        window.clearTimeout(mark);
        window.clearTimeout(advance);
      };
    }
    if (gate.kind === "signal") {
      const onSignal = (e: Event) => {
        if ((e as CustomEvent<string>).detail !== gate.name) return;
        setSatisfied(true);
        window.setTimeout(next, 900);
      };
      window.addEventListener(TOUR_SIGNAL, onSignal);
      return () => window.removeEventListener(TOUR_SIGNAL, onSignal);
    }
    const root = document.documentElement;
    const start = root.dataset.theme;
    const obs = new MutationObserver(() => {
      if (root.dataset.theme === start) return;
      setSatisfied(true);
      obs.disconnect();
      window.setTimeout(next, 900);
    });
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [running, gate, path, next]);

  /** Track the anchor: the page can scroll or resize under an open tour. */
  useLayoutEffect(() => {
    if (!running) return;
    const measure = () => setRect(step?.anchor ? rectOf(step.anchor) : null);
    measure();
    // A gated step can open a panel that moves things; re-measure for a moment.
    const poll = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [running, step]);

  useEffect(() => {
    if (running) cardRef.current?.focus();
  }, [running, index]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      // A gated step must not be passed with the keyboard either — except ⌘K,
      // which is the very thing the search step is asking for.
      if (gate) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, gate, next, back, close]);

  /** The page must not scroll away from the element being pointed at — but a
   *  gated step often opens a dialog that needs its own scrolling, so the lock
   *  lifts the moment the person has done the thing. */
  useEffect(() => {
    if (!running || satisfied) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [running, satisfied]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) return {};
    const vw = window.innerWidth,
      vh = window.innerHeight;
    let place = step?.place ?? "bottom";
    // Flip to the opposite side when the preferred one has no room for the card.
    if (place === "right" && rect.left + rect.width + GAP + CARD_W > vw) place = "left";
    if (place === "left" && rect.left - GAP - CARD_W < 0) place = "right";
    if (place === "bottom" && rect.top + rect.height + GAP + 240 > vh) place = "top";
    if (place === "top" && rect.top - GAP - 240 < 0) place = "bottom";
    const clampLeft = (v: number) => Math.min(Math.max(12, v), Math.max(12, vw - CARD_W - 12));
    const clampTop = (v: number) => Math.min(Math.max(12, v), Math.max(12, vh - 260));
    if (place === "right")
      return { top: clampTop(rect.top - 8), left: clampLeft(rect.left + rect.width + GAP) };
    if (place === "left")
      return { top: clampTop(rect.top - 8), left: clampLeft(rect.left - GAP - CARD_W) };
    if (place === "top")
      return { top: clampTop(rect.top - GAP - 250), left: clampLeft(rect.left + rect.width / 2 - CARD_W / 2) };
    return {
      top: clampTop(rect.top + rect.height + GAP),
      left: clampLeft(rect.left + rect.width / 2 - CARD_W / 2),
    };
  }, [rect, step]);

  if (celebrating && !running) return <Confetti />;
  if (!running || !step || !steps) return null;
  const last = index === steps.length - 1;

  return (
    <div className="tour-root" role="presentation">
      {rect ? (
        <>
          {/* Four panels rather than one sheet: they dim everything around the
              anchor while leaving the anchor itself clickable, which is what a
              gated step needs. */}
          <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
          <div className="tour-mask" style={{ top: rect.top + rect.height + PAD, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-mask" style={{ top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <div className="tour-mask" style={{ top: rect.top - PAD, left: rect.left + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }} />
          <div
            className={"tour-ring" + (gate ? " is-live" : "")}
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="tour-mask tour-mask-full" />
      )}
      <div
        className={"tour-card" + (rect ? "" : " tour-card-centred")}
        style={rect ? cardStyle : undefined}
        role="dialog"
        aria-modal="false"
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
            onClick={() => close(false)}
            aria-label="Skip the tour"
          >
            <X size={15} />
          </button>
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        {gate && (
          <p className={"tour-gate" + (satisfied ? " is-done" : "")} aria-live="polite">
            {satisfied ? <Check size={14} /> : <Hand size={14} />}
            {satisfied ? "Nicely done." : gate.hint}
          </p>
        )}
        <div className="tour-progress" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s.id} className={i === index ? "on" : i < index ? "done" : ""} />
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
            {gate ? (
              // Gated, but never a dead end: a control that cannot be reached —
              // a dialog already open, a page that will not load — must not
              // strand someone inside the tour.
              !satisfied && (
                <button type="button" className="text-btn tour-bypass" onClick={next}>
                  Skip this one
                </button>
              )
            ) : (
              <>
                {!last && (
                  <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
