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
} from "lucide-react";
import { IrisLockup } from "@/components/iris-mark";
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

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "setup">("login"),
    [setupToken, setSetupToken] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) return router.replace("/dashboard");
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
          setupToken: mode === "setup" ? setupToken : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to continue");
      router.replace("/dashboard");
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
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/iris-intro-dark.webp"
          className="auth-video auth-video-dark"
        >
          <source src="/video/iris-intro-dark.mp4" type="video/mp4" />
        </video>
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/iris-intro-light.webp"
          className="auth-video auth-video-light"
        >
          <source src="/video/iris-intro-light.mp4" type="video/mp4" />
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
