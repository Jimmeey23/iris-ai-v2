/**
 * The Feedback tab: a fixed tab on the edge of every page that opens a report
 * form, collects the page context automatically, and posts to /api/feedback,
 * which emails the developer straight away.
 *
 * Deliberately not a ticket. A ticket is studio work; this is "the app is wrong",
 * and it goes to one inbox. The wording throughout says so, because staff were
 * filing app bugs as operations tickets and they were being routed to trainers.
 */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { usePathname } from "next/navigation";
import {
  MessageSquareWarning,
  X,
  Camera,
  Paperclip,
  Send,
  Trash2,
  Loader2,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { useApp, useToast, Switch } from "./ui";
import {
  FEEDBACK_KINDS,
  FEEDBACK_SEVERITIES,
  KIND_LABELS,
  SEVERITY_LABELS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  type FeedbackKind,
  type FeedbackSeverity,
} from "@/lib/feedback-shared";

/** Pages where a feedback tab would be in the way or has nobody to attribute a
 *  report to. Sign-in is the only real case: nothing there is the app's own UI. */
const HIDDEN_ON = [/^\/login/, /^\/auth\//, /^\/change-password/];

/** Friendly names for the paths the tab can appear on, so the email subject reads
 *  "Tickets" rather than "/tickets/482". Longest prefix wins. */
const PAGE_LABELS: [RegExp, string][] = [
  [/^\/$/, "Dashboard"],
  [/^\/dashboard/, "Dashboard"],
  [/^\/tickets\/[^/]+$/, "Ticket detail"],
  [/^\/tickets/, "Tickets"],
  [/^\/iris/, "IRIS assistant"],
  [/^\/forms/, "Forms"],
  [/^\/templates/, "Templates"],
  [/^\/analytics/, "Analytics"],
  [/^\/reports/, "Reports"],
  [/^\/radar/, "Ops radar"],
  [/^\/equipment/, "Equipment"],
  [/^\/trainers/, "Trainers"],
  [/^\/staff/, "Staff"],
  [/^\/momence/, "Momence"],
  [/^\/integrations/, "Integrations"],
  [/^\/settings/, "Settings"],
  [/^\/profile/, "Profile"],
  [/^\/design-system/, "Design system"],
];
const labelFor = (path: string) =>
  PAGE_LABELS.find(([re]) => re.test(path))?.[1] ?? path;

type RecentError = { at: string; message: string };
/** The last few runtime errors seen on this page load. The single most useful
 *  thing a report can carry and the one thing a reporter never thinks to copy. */
const recentErrors: RecentError[] = [];
let listening = false;
function listenForErrors() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const push = (message: string) => {
    recentErrors.push({ at: new Date().toISOString(), message: message.slice(0, 500) });
    if (recentErrors.length > 12) recentErrors.shift();
  };
  window.addEventListener("error", (e) =>
    push(`${e.message} (${e.filename ?? "?"}:${e.lineno ?? 0})`),
  );
  window.addEventListener("unhandledrejection", (e) =>
    push(`Unhandled rejection: ${String((e as PromiseRejectionEvent).reason).slice(0, 300)}`),
  );
  const original = console.error;
  console.error = (...args: unknown[]) => {
    push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    original(...args);
  };
}

type Attachment = { id: string; file: File; preview?: string; origin: "screenshot" | "upload" };

const DRAFT_KEY = "iris-feedback-draft";
const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

type Draft = {
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  title: string;
  details: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  contactBack: boolean;
  reporterEmail: string;
};
const EMPTY: Draft = {
  kind: "bug",
  severity: "normal",
  title: "",
  details: "",
  stepsToReproduce: "",
  expected: "",
  actual: "",
  contactBack: true,
  reporterEmail: "",
};

export function FeedbackTab() {
  const pathname = usePathname() || "/";
  const { user } = useApp();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(listenForErrors, []);

  // A half-written report survives a reload or an accidental close; it is thrown
  // away only once the report has actually been sent. Restored when the panel is
  // opened rather than on mount, so the server and the first client render match.
  const restoreDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) });
    } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, open]);

  const set = useCallback(
    <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value })),
    [],
  );

  const addFiles = useCallback(
    (incoming: File[], origin: Attachment["origin"] = "upload") => {
      setFiles((current) => {
        const next = [...current];
        for (const file of incoming) {
          if (next.length >= MAX_ATTACHMENTS) {
            notify(`Up to ${MAX_ATTACHMENTS} attachments.`, "error");
            break;
          }
          if (file.size > MAX_ATTACHMENT_BYTES) {
            notify(`${file.name} is larger than 8MB.`, "error");
            continue;
          }
          next.push({
            id: crypto.randomUUID(),
            file,
            origin,
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          });
        }
        return next;
      });
    },
    [notify],
  );

  // Paste a screenshot straight in — the way people actually share one.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (images.length) {
        e.preventDefault();
        addFiles(images, "screenshot");
        notify("Screenshot attached from the clipboard.", "success");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, addFiles, notify]);

  // Ctrl/Cmd + Shift + F from anywhere, and Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (!open) {
          setSent(null);
          restoreDraft();
        }
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open && !sending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, restoreDraft]);

  const capture = useCallback(async () => {
    setShooting(true);
    // The panel is hidden for the capture, otherwise every screenshot is a picture
    // of the feedback form covering the thing being reported.
    const node = panel.current;
    if (node) node.style.visibility = "hidden";
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(document.body, {
        backgroundColor:
          getComputedStyle(document.body).backgroundColor || "#0a0a0d",
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        // Third-party iframes and canvases taint the render and throw; skipping
        // them yields a usable picture instead of no picture at all.
        filter: (el) => !(el instanceof HTMLIFrameElement),
        cacheBust: true,
      });
      if (!blob) throw new Error("empty capture");
      addFiles(
        [new File([blob], `iris-screenshot-${Date.now()}.png`, { type: "image/png" })],
        "screenshot",
      );
      notify("Page captured and attached.", "success");
    } catch {
      notify(
        "This page could not be captured automatically. Take a screenshot and paste it here instead.",
        "error",
      );
    } finally {
      if (node) node.style.visibility = "";
      setShooting(false);
    }
  }, [addFiles, notify]);

  const context = useMemo(
    () => ({
      url: typeof window === "undefined" ? pathname : window.location.href,
      route: pathname,
      viewport:
        typeof window === "undefined" ? "" : `${window.innerWidth}×${window.innerHeight}`,
      screen: typeof window === "undefined" ? "" : `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      language: typeof navigator === "undefined" ? "" : navigator.language,
      theme:
        typeof document === "undefined" ? "" : document.documentElement.dataset.theme || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: typeof navigator === "undefined" ? "" : String(navigator.onLine),
      role: user?.role ?? "signed out",
      studio: user?.studio ?? "",
      occurredAt: new Date().toISOString(),
      recentErrors: recentErrors.slice(-6),
    }),
    [pathname, user],
  );

  const remove = (id: string) =>
    setFiles((current) => {
      const hit = current.find((f) => f.id === id);
      if (hit?.preview) URL.revokeObjectURL(hit.preview);
      return current.filter((f) => f.id !== id);
    });

  const reset = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setDraft(EMPTY);
    setShowDetail(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const submit = async () => {
    if (draft.title.trim().length < 4) return notify("Give the report a short title.", "error");
    if (draft.details.trim().length < 10)
      return notify("Describe what happened in a sentence or two.", "error");
    if (!user && !draft.reporterEmail.trim())
      return notify("Add your email so the developer can follow up.", "error");
    setSending(true);
    try {
      const body = new FormData();
      body.append(
        "report",
        JSON.stringify({
          kind: draft.kind,
          severity: draft.severity,
          title: draft.title.trim(),
          details: draft.details.trim(),
          stepsToReproduce: draft.stepsToReproduce.trim() || undefined,
          expected: draft.expected.trim() || undefined,
          actual: draft.actual.trim() || undefined,
          pagePath: pathname,
          pageLabel: labelFor(pathname),
          contactBack: draft.contactBack,
          reporterEmail: draft.reporterEmail.trim() || undefined,
          context,
        }),
      );
      for (const f of files) body.append("files", f.file, f.file.name);
      const res = await fetch("/api/feedback", { method: "POST", body });
      const data = (await res.json()) as { reference?: string; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Feedback could not be sent.");
      setSent(data.reference ?? null);
      notify(data.message || "Feedback sent to the developer.", "success");
      reset();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Feedback could not be sent.", "error");
    } finally {
      setSending(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  return (
    <>
      <button
        type="button"
        className="feedback-tab"
        onClick={() => {
          setSent(null);
          restoreDraft();
          setOpen(true);
        }}
        title="Report a problem or suggest an improvement (Ctrl/⌘ + Shift + F)"
      >
        <MessageSquareWarning size={15} />
        <span>Feedback</span>
      </button>

      {open && (
        <div className="feedback-scrim" onClick={() => !sending && setOpen(false)} />
      )}
      <div
        ref={panel}
        className={"feedback-panel" + (open ? " open" : "")}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Send feedback to the developer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header className="feedback-head">
          <div>
            <h2>Send feedback</h2>
            <p>
              Goes straight to the developer — not to the ticket queue. You are on{" "}
              <strong>{labelFor(pathname)}</strong>.
            </p>
          </div>
          <button type="button" className="feedback-close" onClick={() => setOpen(false)} aria-label="Close feedback">
            <X size={16} />
          </button>
        </header>

        {sent ? (
          <div className="feedback-body feedback-done">
            <CheckCircle2 size={38} />
            <h3>Thank you — it is on its way.</h3>
            <p>
              Reference <strong>{sent}</strong>. The developer has the page you were on, your
              notes, the attachments and the browser details.
            </p>
            <button type="button" className="btn btn-outline" onClick={() => setSent(null)}>
              Report something else
            </button>
          </div>
        ) : (
          <div className="feedback-body">
            <fieldset className="feedback-choices">
              <legend>What kind of feedback is this?</legend>
              <div className="feedback-chips">
                {FEEDBACK_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={"feedback-chip" + (draft.kind === k ? " on" : "")}
                    aria-pressed={draft.kind === k}
                    onClick={() => set("kind", k)}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="feedback-choices">
              <legend>How much is it holding you up?</legend>
              <div className="feedback-chips">
                {FEEDBACK_SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={"feedback-chip sev-" + s + (draft.severity === s ? " on" : "")}
                    aria-pressed={draft.severity === s}
                    onClick={() => set("severity", s)}
                  >
                    {SEVERITY_LABELS[s]}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="feedback-field">
              <span>Title</span>
              <input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Saving a ticket clears the studio field"
                maxLength={160}
              />
            </label>

            <label className="feedback-field">
              <span>What happened?</span>
              <textarea
                value={draft.details}
                onChange={(e) => set("details", e.target.value)}
                rows={5}
                placeholder="Describe it the way you would to a colleague. What were you doing, and what went wrong?"
                maxLength={8000}
              />
            </label>

            <button
              type="button"
              className={"feedback-more" + (showDetail ? " open" : "")}
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
            >
              <ChevronDown size={14} />
              Add steps, expected and actual behaviour (optional, but it speeds up a fix)
            </button>
            {showDetail && (
              <div className="feedback-extra">
                <label className="feedback-field">
                  <span>Steps to reproduce</span>
                  <textarea
                    value={draft.stepsToReproduce}
                    onChange={(e) => set("stepsToReproduce", e.target.value)}
                    rows={4}
                    placeholder={"1. Open a ticket\n2. Change the studio\n3. Press Save"}
                  />
                </label>
                <div className="feedback-row">
                  <label className="feedback-field">
                    <span>What you expected</span>
                    <textarea value={draft.expected} onChange={(e) => set("expected", e.target.value)} rows={3} />
                  </label>
                  <label className="feedback-field">
                    <span>What actually happened</span>
                    <textarea value={draft.actual} onChange={(e) => set("actual", e.target.value)} rows={3} />
                  </label>
                </div>
              </div>
            )}

            <div className={"feedback-drop" + (dragging ? " dragging" : "")}>
              <div className="feedback-drop-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={capture} disabled={shooting}>
                  {shooting ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
                  {shooting ? "Capturing…" : "Capture this page"}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => picker.current?.click()}>
                  <Paperclip size={14} /> Attach files
                </button>
                <span className="feedback-hint">or drag files in, or paste a screenshot</span>
              </div>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,video/webm,video/mp4"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="feedback-files">
                  {files.map((f) => (
                    <li key={f.id}>
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt="" />
                      ) : (
                        <span className="feedback-file-icon">
                          <Paperclip size={14} />
                        </span>
                      )}
                      <span className="feedback-file-name">
                        {f.file.name}
                        <em>{bytes(f.file.size)}</em>
                      </span>
                      <button type="button" onClick={() => remove(f.id)} aria-label={`Remove ${f.file.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!user && (
              <label className="feedback-field">
                <span>Your email</span>
                <input
                  type="email"
                  value={draft.reporterEmail}
                  onChange={(e) => set("reporterEmail", e.target.value)}
                  placeholder="you@physique57india.com"
                />
              </label>
            )}

            <div className="feedback-switch">
              <Switch
                checked={draft.contactBack}
                onChange={(v) => set("contactBack", v)}
                label="Ask the developer to reply"
              />
              <span>Reply to me about this</span>
            </div>

            <details className="feedback-context">
              <summary>What is sent automatically</summary>
              <dl>
                {Object.entries(context).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === "object" ? JSON.stringify(v) : String(v) || "—"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        )}

        {!sent && (
          <footer className="feedback-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={sending}>
              Clear
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={sending}>
              {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
              {sending ? "Sending…" : "Send to the developer"}
            </button>
          </footer>
        )}
      </div>
    </>
  );
}
