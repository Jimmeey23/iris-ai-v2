"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { api, useApp } from "@/components/ui";
import { ShieldCheck, LogOut, Compass } from "lucide-react";
import { startGuidedTour } from "@/components/guided-tour";
export default function ProfilePage() {
  const router = useRouter();
  const { user, refreshUser, notify } = useApp();
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [signingOut, setSigningOut] = useState(false);
  // Adjust state during render rather than in an effect: the identity loads asynchronously
  // (see AppStateProvider), so the field must pick up the name the first time it arrives —
  // without this it would keep re-rendering with the empty initial value forever.
  const [syncedName, setSyncedName] = useState(user?.name);
  if (user?.name !== syncedName) {
    setSyncedName(user?.name);
    setName(user?.name || "");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, password: password || undefined }),
      });
      await refreshUser();
      setPassword("");
      notify("Profile updated", "success");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not update profile",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      });
      await refreshUser();
      router.replace("/login");
      router.refresh();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not sign out",
        "error",
      );
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <Shell title="Your account" eyebrow="PROFILE & SECURITY">
      <div className="card" style={{ maxWidth: 620, padding: 28 }}>
        <div className="flex-row" style={{ marginBottom: 24 }}>
          <ShieldCheck size={20} />
          <div>
            <h3>Personal settings</h3>
            <p className="secondary">These changes affect only your account.</p>
          </div>
        </div>
        <form className="stack" onSubmit={save}>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={user?.email || ""} disabled />
          </label>
          <label className="field">
            <span>Access level</span>
            <input value={user?.role || ""} disabled />
          </label>
          <label className="field">
            <span>
              New password <small>(optional)</small>
            </span>
            <input
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          <div className="profile-signout">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => startGuidedTour()}
            >
              <Compass size={16} />
              Replay the guided tour
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              <LogOut size={16} />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
