"use client";

/**
 * Set a new password. Reached two ways: a provisioned account is sent here by the
 * sign-in flow and cannot go anywhere else until it is done, and anyone signed in
 * can open it to change their own password.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../login/login.css";

const MIN_LENGTH = 12;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [required, setRequired] = useState(false),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [show, setShow] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) return router.replace("/login");
        setName(d.user.name ?? "");
        setRequired(Boolean(d.passwordChangeRequired));
        setReady(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    !busy && password.length >= MIN_LENGTH && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "change-password", newPassword: password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to set your password");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to set your password");
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="auth-page auth-page-plain">
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <h1 className="auth-title">
            {required ? "Set your own password" : "Change your password"}
          </h1>
          <p className="auth-sub">
            {required
              ? `Welcome${name ? ", " + name.split(" ")[0] : ""}. Your account was created with a shared password. Choose your own before you continue — nobody else should know it.`
              : "Choose a new password for your workspace account."}
          </p>

          {error && (
            <div className="error-box" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <label className="field">
              <span>New password</span>
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                minLength={MIN_LENGTH}
                aria-describedby="pw-rule"
              />
            </label>
            <p
              id="pw-rule"
              className="secondary"
              style={{ fontSize: 11, margin: "-4px 0 10px" }}
            >
              {tooShort
                ? `${MIN_LENGTH - password.length} more character${MIN_LENGTH - password.length === 1 ? "" : "s"} needed.`
                : `At least ${MIN_LENGTH} characters.`}
            </p>

            <label className="field">
              <span>Confirm new password</span>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {mismatch && (
              <p
                className="secondary"
                style={{ fontSize: 11, margin: "-4px 0 10px", color: "var(--red)" }}
              >
                The two passwords do not match.
              </p>
            )}

            <label className="auth-show">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
              />
              <span>Show password</span>
            </label>

            <button className="btn btn-primary auth-submit" disabled={!canSubmit}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
