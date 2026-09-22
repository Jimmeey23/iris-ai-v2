"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import { IrisLockup } from "@/components/iris-mark";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login"),
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
        if (d.user) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code)
      setError(
        code === "google_not_configured"
          ? "Google sign-in is not enabled. Turn on the Google provider in your Supabase project."
          : code === "inactive"
            ? "This account is not active in the workspace. Ask an administrator to restore it."
            : code === "profile_unavailable"
              ? "Signed in with Google, but your workspace profile could not be loaded. The database may be unreachable or out of date."
              : "Google sign-in could not be completed. Please try again.",
      );
  }, []);
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
          name: mode === "signup" ? name : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to continue");
      if (d.confirmationRequired) {
        // Supabase has sent a confirmation link; there is no session to redirect with yet.
        setNotice(
          `Check ${email} for a confirmation link. Your account is ready once you have clicked it.`,
        );
        setMode("login");
        setPassword("");
        return;
      }
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
            <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p>
              {mode === "login"
                ? "Sign in to continue to ThitOps."
                : "Join your team workspace with protected agent access."}
            </p>
          </div>
          <div className="auth-tabs" role="tablist">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
                setNotice("");
              }}
            >
              Sign in
            </button>
            <button
              className={mode === "signup" ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setError("");
                setNotice("");
              }}
            >
              Sign up
            </button>
          </div>
          <a className="auth-google" href="/api/auth/google">
            <span className="google-g">G</span>Continue with Google
          </a>
          <div className="auth-divider">
            <span>or use email</span>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && (
              <label>
                Full name
                <div className="auth-input">
                  <Sparkles />
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
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
                  : "Create agent account"}
              <ArrowRight />
            </button>
          </form>
          <p className="auth-note">
            New accounts start with Agent access. Managers and Admins are
            assigned by an administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
