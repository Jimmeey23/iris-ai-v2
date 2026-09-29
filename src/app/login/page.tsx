"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Sparkles,
  User,
  Users2,
  Building2,
} from "lucide-react";
import { IrisLockup } from "@/components/iris-mark";
import { useApp } from "@/components/ui";
import { STUDIOS, DEPARTMENT_RECORDS } from "@/lib/constants";
import { reportingManagerFor } from "@/lib/staff-directory";
import "./login.css";

/** Fixed copy for every error code the auth routes redirect with. Anything
 *  unrecognised falls back to a generic line — query text is never rendered. */
const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google sign-in is not enabled for this workspace yet. Ask an administrator.",
  inactive:
    "This account is not active in the workspace. Ask an administrator to restore it.",
  not_authorised:
    "Your account is not authorised for this workspace. Ask an administrator for an invite.",
  profile_unavailable:
    "You signed in, but your workspace profile could not be loaded. Please try again shortly.",
  oauth_failed: "Sign-in could not be completed. Please try again.",
};

/**
 * The films behind the sign-in panel.
 *
 * Two are theme-matched — the dark and light cuts of the intro — and the rest are studio
 * films that read well against either. One is chosen per page load, so the page is not the
 * same picture every morning, and the theme-matched pair is weighted so the panel usually
 * suits the theme somebody is already in.
 */
const AUTH_CLIPS = [
  {src: '/video/iris-intro-dark.mp4', poster: '/video/iris-intro-dark.webp', theme: 'dark'},
  {src: '/video/iris-intro-light.mp4', poster: '/video/iris-intro-light.webp', theme: 'light'},
  {src: '/video/iris-intro-light1.mp4', poster: '/video/iris-intro-light.webp', theme: 'light'},
  {src: '/video/create_a_cinematic_and_impactf.mp4', poster: '/video/iris-intro-dark.webp', theme: 'any'},
  {src: '/video/b_create_a_cinematic_a.mp4', poster: '/video/iris-intro-dark.webp', theme: 'any'},
  {src: '/video/b_the_agent_must_look_.mp4', poster: '/video/iris-intro-dark.webp', theme: 'any'},
  {src: '/video/retry_this_is_a_support_assi.mp4', poster: '/video/iris-intro-dark.webp', theme: 'any'},
] as const;

/** Picks a film for this visit: one that suits the current theme, or a theme-neutral one. */
function pickClip(theme: string) {
  const suited = AUTH_CLIPS.filter(c => c.theme === theme || c.theme === 'any');
  const pool = suited.length ? suited : AUTH_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser, theme } = useApp();
  /**
   * Chosen after mount rather than during render: picking at render time would make the
   * server and the browser disagree about which film to show, and React would replace it
   * mid-fade on hydration. The poster covers the moment before the choice lands, and a
   * reload picks again — which is what makes it change on every visit.
   */
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const [clip, setClip] = useState<{src: string; poster: string}>(AUTH_CLIPS[0]);
  if (typeof window !== 'undefined' && pickedFor !== theme) {
    setPickedFor(theme);
    setClip(pickClip(theme));
  }
  const [mode, setMode] = useState<"login" | "signup" | "setup">("login"),
    [setupToken, setSetupToken] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [studio, setStudio] = useState(""),
    [department, setDepartment] = useState(""),
    [reportingManager, setReportingManager] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.user)
          return router.replace(
            d.passwordChangeRequired ? "/change-password" : "/dashboard",
          );
        if (d.setupRequired) setMode("setup");
        // Only a fixed message keyed by the code is shown; no query text is rendered.
        const code = new URLSearchParams(window.location.search).get("error");
        if (code) setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.oauth_failed);
      })
      .catch(() => {});
  }, [router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: mode,
          email,
          password,
          name: mode === "setup" || mode === "signup" ? name : undefined,
          studio: mode === "signup" ? studio : undefined,
          department: mode === "signup" ? department : undefined,
          reportingManager: mode === "signup" ? reportingManager : undefined,
          setupToken: mode === "setup" ? setupToken : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to continue");
      // A provisioned account must set its own password before it may go anywhere
      // else; every other guard in the app refuses it until then.
      const me = await fetch("/api/auth").then((x) => x.json()).catch(() => null);
      // Refresh the shared identity, not just this component's copy. Signing in
      // is a client-side navigation, so the app context survives it — and while
      // it still held `null`, the shell rendered every administrator page as
      // locked and anything keyed on the signed-in user never ran, until the
      // person happened to reload.
      await refreshUser().catch(() => {});
      router.replace(me?.passwordChangeRequired ? "/change-password" : "/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="IRIS operations workspace">
        <video
          key={clip.src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={clip.poster}
          className="auth-video"
        >
          <source src={clip.src} type="video/mp4" />
        </video>
        <div className="auth-veil" />
        <div className="auth-story">
          <div className="auth-kicker">
            <Sparkles size={14} /> Physique 57 India operations
          </div>
          <h1>
            Every member voice,
            <br />
            thoughtfully actioned.
          </h1>
          <p>
            One intelligent workspace for studio issues, ownership and
            follow-through.
          </p>
          <div className="auth-trust">
            <span>
              <Check />
              Clear ownership
            </span>
            <span>
              <Check />
              Role-based privacy
            </span>
            <span>
              <Check />
              Complete audit trail
            </span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <IrisLockup size={34} />
          <div className="auth-copy">
            <span className="auth-eyebrow">SECURE WORKSPACE</span>
            <h2>
              {mode === "login"
                ? "Welcome back"
                : mode === "signup"
                  ? "Create your account"
                  : "Set up your workspace"}
            </h2>
            <p>
              {mode === "login"
                ? "Sign in to continue to IRIS."
                : mode === "signup"
                  ? "Use your approved work email to join the workspace."
                  : "Create the first administrator using the one-time setup token."}
            </p>
          </div>
          {mode === "login" && (
            <>
              <a className="auth-google" href="/api/auth/google">
                <span className="google-g">G</span>Continue with Google
              </a>
              <div className="auth-divider">
                <span>or use email</span>
              </div>
            </>
          )}
          <form onSubmit={submit} className="auth-form">
            {mode === "setup" && (
              <label>
                Setup token
                <div className="auth-input">
                  <KeyRound />
                  <input
                    required
                    autoComplete="off"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="From the SETUP_TOKEN server variable"
                  />
                </div>
              </label>
            )}
            {(mode === "setup" || mode === "signup") && (
              <label>
                Full name
                <div className="auth-input">
                  <User />
                  <input
                    required
                    minLength={2}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </label>
            )}
            {/* Studio decides what the account can see — everything logged at
                that location, not only this person's own tickets — so it is a
                fixed list rather than free text, and the server checks it
                again against the same records. */}
            {mode === "signup" && (
              <>
                <div className="auth-signup-pair">
                <label>
                  Studio
                  <div className="auth-input auth-input-select">
                    <Building2 />
                    <select
                      required
                      value={studio}
                      onChange={(e) => setStudio(e.target.value)}
                    >
                      <option value="" disabled>
                        Select your studio
                      </option>
                      {STUDIOS.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label>
                  Department
                  <div className="auth-input auth-input-select">
                    <Users2 />
                    <select
                      required
                      value={department}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDepartment(next);
                        // Filled in from the directory, and only while the field is either
                        // empty or still showing the previous department's suggestion —
                        // a name somebody typed themselves is never overwritten.
                        const suggested = reportingManagerFor(next);
                        if (suggested && (!reportingManager || reportingManager === reportingManagerFor(department))) {
                          setReportingManager(suggested);
                        }
                      }}
                    >
                      <option value="" disabled>
                        Select your department
                      </option>
                      {DEPARTMENT_RECORDS.filter((d) => d.active).map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                </div>
                <label>
                  Reporting manager
                  <div className="auth-input">
                    <User />
                    <input
                      required
                      minLength={2}
                      maxLength={80}
                      value={reportingManager}
                      onChange={(e) => setReportingManager(e.target.value)}
                      placeholder="Who you report to"
                    />
                  </div>
                  {department && reportingManager === reportingManagerFor(department) && (
                    <small className="auth-hint">Filled in from the {department} team — change it if you report to someone else.</small>
                  )}
                </label>
              </>
            )}
            <label>
              Work email
              <div className="auth-input">
                <Mail />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@physique57.com"
                />
              </div>
            </label>
            <label>
              Password
              <div className="auth-input">
                <LockKeyhole />
                <input
                  required
                  minLength={12}
                  type={show ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? "Create a password (12+ characters)"
                      : "At least 12 characters"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="auth-notice" role="status">
                {notice}
              </div>
            )}
            <button className="auth-submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Create administrator"}
              <ArrowRight />
            </button>
          </form>
          <p className="auth-note">
            {mode === "login" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  className="auth-toggle"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Sign up with your work email
                </button>
              </>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="auth-toggle"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>Access is by invitation. Ask an administrator if you need an account.</>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
