"use client";
import type { StaffRecord } from "@/lib/constants";
import type { TicketListRecord, TicketRecord } from "@/lib/ticket-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { mentionIdsIn, type MentionPerson } from "./mention-box";
import { TicketDialogView } from "./ticket-detail-view";
import { coOwnersOf } from "./ticket-detail/ownership";
import { api, useApp } from "./ui";
type Resolution = import("./resolution-panel").Resolution;
type Bundle = {
  ticket: TicketRecord;
  comments: {
    id: number;
    authorName: string;
    authorRole: string;
    body: string;
    createdAt: string;
  }[];
  activities: {
    id: number;
    actorName: string;
    action: string;
    detail: string;
    createdAt: string;
  }[];
  similar: {
    id: number;
    ticketNumber: string;
    title: string;
    status: string;
  }[];
  linked: { id: number; ticketNumber: string; title: string; status: string }[];
  canResolve: boolean;
  /** Administrator, or the person who filed this ticket. The server enforces the same rule. */
  canEditDetails: boolean;
  asset: {
    id: number;
    name: string;
    assetTag: string | null;
    status: string;
    type: string;
    studio: string;
  } | null;
  resolution: Resolution | null;
  steps: import("./resolution-panel").ResolutionStep[];
  followUps: import("./resolution-panel").FollowUp[];
  contacts: import("./resolution-panel").ContactEntry[];
  attachments: import("./resolution-panel").ResolutionAttachment[];
  conversationAttachments: {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }[];
};

const TABS = ["overview", "resolution", "activity", "related"] as const;
/** Everything the ticket workspace renders. Exported so the design preview can
 *  hand in a fixture instead of going to the database. */
export type TicketDetailBundle = Bundle;
export function useTicketDialogController({
  id,
  open,
  onClose,
  onUpdated,
  fixture,
}: {
  id: number;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  /** Design-preview only: render this bundle and never touch the network. */
  fixture?: TicketDetailBundle;
}) {
  const { notify, user, openAuth } = useApp();
  const [bundle, setBundle] = useState<Bundle | undefined>(fixture),
    [error, setError] = useState(""),
    [tab, setTab] = useState<(typeof TABS)[number]>("overview"),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const [mentionPeople, setMentionPeople] = useState<MentionPerson[]>([]);
  const [mentioned, setMentioned] = useState<MentionPerson[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const resolutionToggle = useRef<HTMLButtonElement>(null);
  const resolutionRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!railOpen) return;
    const region = resolutionRegion.current;
    region?.focus({ preventScroll: true });
    // On a stacked dialog, opening resolution should reveal its controls,
    // even when the case description had already been scrolled a long way.
    const shell = region?.closest<HTMLElement>(".ticket-detail-shell");
    if (shell && shell.clientWidth < 900) {
      region?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [railOpen]);
  const closeResolution = () => {
    setTab("overview");
    setRailOpen(false);
    resolutionToggle.current?.focus({ preventScroll: true });
  };
  const [linkOpen, setLinkOpen] = useState(false),
    [linkQuery, setLinkQuery] = useState(""),
    [found, setFound] = useState<{ q: string; tickets: TicketListRecord[] }>({
      q: "",
      tickets: [],
    }),
    [childId, setChildId] = useState<number>(),
    [entity, setEntity] = useState<{
      module: "members" | "sessions";
      id: string;
    }>(),
    [localDetails, setLocalDetails] = useState<{
      title: string;
      data: unknown;
    }>(),
    [staff, setStaff] = useState<StaffRecord[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [edit, setEdit] = useState({
    title: "",
    summary: "",
    description: "",
    memberName: "",
    memberEmail: "",
    memberPhone: "",
    studio: "",
    incidentAt: "",
    classFormat: "",
    trainer: "",
    membership: "",
    preferredContact: "",
    requestedResolution: "",
    impact: "",
    resolutionRequired: true,
  });
  const load = useCallback(
    () =>
      fixture
        ? Promise.resolve()
        : api<Bundle>("/api/tickets/" + id).then(
            (d) => {
              setBundle(d);
              setError("");
            },
            (e: Error) => setError(e.message),
          ),
    [id, fixture],
  );
  // Reopening (or switching ticket) starts from a clean slate. Done while rendering,
  // not in an effect, so the stale bundle never paints for a frame.
  const shownKey = open ? String(id) : "";
  const [shownFor, setShownFor] = useState(shownKey);
  if (shownFor !== shownKey) {
    setShownFor(shownKey);
    if (open) {
      setBundle(fixture);
      setTab("overview");
      setRailOpen(false);
    }
  }
  useEffect(() => {
    if (open && !fixture) {
      void load();
      void api<{ staff: StaffRecord[] }>("/api/staff")
        .then((d) => setStaff(d.staff))
        .catch(() => {});
      void api<{
        people: {
          userId: number | null;
          name: string;
          username: string | null;
        }[];
      }>("/api/directory")
        .then((d) =>
          setMentionPeople(
            d.people.filter(
              (person): person is MentionPerson => person.userId !== null,
            ),
          ),
        )
        .catch(() => {});
      // Paused while the editor is open. A refresh landing mid-edit bumps the revision the
      // save is about to be checked against, so a perfectly good edit came back as "this
      // ticket changed elsewhere" — and the next poll after that would have reloaded the
      // fields underneath the person typing.
      // Realtime (`iris:tickets-updated`, below) carries a teammate's change; the interval is
      // only the floor for a dropped socket.
      const timer = setInterval(() => {
        if (!document.hidden && !editOpen) void load();
      }, 60000);
      // Skip the tick while the tab is hidden, then catch up with one fetch
      // the moment it becomes visible again rather than waiting out the interval.
      const onVisible = () => {
        if (!document.hidden && !editOpen) void load();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("iris:tickets-updated", onVisible);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("iris:tickets-updated", onVisible);
      };
    }
  }, [open, load, editOpen, fixture]);
  // The picker searches server-side (`?q=` returns up to 20 matches) rather than
  // downloading the whole ticket list, debounced so typing doesn't fire a request a key.
  const linkTerm = linkQuery.trim();
  useEffect(() => {
    if (!linkOpen || !linkTerm) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      void api<{ tickets: TicketListRecord[] }>(
        "/api/tickets?q=" + encodeURIComponent(linkTerm),
        { signal: ctl.signal },
      )
        .then((d) => setFound({ q: linkTerm, tickets: d.tickets }))
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setFound({ q: linkTerm, tickets: [] });
          notify(e.message, "error");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [linkOpen, linkTerm, notify]);
  const searching = Boolean(linkTerm) && found.q !== linkTerm;
  const choices = (found.q === linkTerm ? found.tickets : []).filter(
    (s) => s.id !== id && !bundle?.linked.some((l) => l.id === s.id),
  );
  async function patch(p: Record<string, unknown>) {
    if (!bundle) return;
    setBusy(true);
    try {
      const d = await api<{
        followUpTickets?: { id: number; ticketNumber: string }[];
      }>("/api/tickets/" + id, {
        method: "PATCH",
        body: JSON.stringify({ ...p, version: bundle.ticket.version }),
      });
      await load();
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      if (d.followUpTickets?.length)
        notify(
          `Recurrence checks ${d.followUpTickets.map((f) => f.ticketNumber).join(" and ")} raised, due 5 and 10 days from today.`,
        );
      else if (p.resolutionRequired !== undefined)
        notify(
          p.resolutionRequired
            ? "Changed to requires resolution · follow-up SLA target active."
            : "Changed to record only · informational record without SLA.",
        );
      else notify("Ticket updated.");
    } catch (e) {
      notify((e as Error).message, "error");
      await load();
    } finally {
      setBusy(false);
    }
  }
  /** A private reminder to the one person who owns this. Deliberately quiet: a toast to the
   *  sender, an in-app notification to the owner, a line on the activity log, and nothing
   *  else — no email, no manager copied in. */
  const [nudging, setNudging] = useState(false);
  async function nudge() {
    if (!t) return;
    setNudging(true);
    try {
      const d = await api<{ notified: string }>(`/api/tickets/${t.id}/nudge`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      notify(`Nudged ${d.notified}. They will see it in the app.`);
      await load();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not send the nudge",
        "error",
      );
    } finally {
      setNudging(false);
    }
  }

  /** One extension, with a reason. The server is the authority on "once" and on who may do
   *  it — this only keeps the form from being offered where it would certainly be refused. */
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendHours, setExtendHours] = useState(8);
  const [extendReason, setExtendReason] = useState("");
  async function extendSla() {
    if (!t) return;
    setBusy(true);
    try {
      await api(`/api/tickets/${t.id}/extend`, {
        method: "POST",
        body: JSON.stringify({ hours: extendHours, reason: extendReason }),
      });
      setExtendOpen(false);
      setExtendReason("");
      await load();
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      notify(`Resolution target moved out by ${extendHours} hours.`);
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not extend the target",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const d = await api<{ ticket: TicketRecord }>("/api/tickets/" + id, {
        method: "POST",
        body: JSON.stringify({ action: "duplicate" }),
      });
      notify(`${d.ticket.ticketNumber} created and linked as a duplicate.`);
      onUpdated?.();
      setChildId(d.ticket.id);
      await load();
      window.dispatchEvent(new Event("iris:tickets-updated"));
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function link(otherId: number, remove = false) {
    try {
      await api("/api/tickets/" + id, {
        method: "POST",
        body: JSON.stringify({
          action: remove ? "unlink" : "link",
          relatedId: otherId,
        }),
      });
      await load();
      setLinkOpen(false);
      notify(remove ? "Ticket relationship removed." : "Tickets linked.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api("/api/tickets/" + id + "/comments", {
        method: "POST",
        body: JSON.stringify({
          body: note,
          isInternal: true,
          mentionUserIds: mentionIdsIn(note, mentioned),
        }),
      });
      setNote("");
      setMentioned([]);
      await load();
      notify("Internal note saved.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  /** The values the form opened with. The save sends the difference against these, so a field
   *  nobody touched is never written back over somebody else's change. */
  type EditForm = typeof edit;
  const [editBaseline, setEditBaseline] = useState<EditForm>(edit);

  function openEditor() {
    if (!t) return;
    const seed: EditForm = {
      title: t.title || "",
      summary: t.summary || "",
      description: t.description || "",
      memberName: t.memberName || "",
      memberEmail: t.memberEmail || "",
      memberPhone: t.memberPhone || "",
      studio: t.studio || "",
      incidentAt: t.incidentAt || "",
      classFormat: t.classFormat || "",
      trainer: t.trainer || "",
      membership: t.membership || "",
      preferredContact: t.preferredContact || "",
      requestedResolution: t.requestedResolution || "",
      impact: t.impact || "",
      resolutionRequired: Boolean(t.resolutionRequired),
    };
    setEdit(seed);
    setEditBaseline(seed);
    setEditOpen(true);
  }

  /**
   * Saves the edit, then re-reads the ticket from the server.
   *
   * Only the fields that actually changed are sent, measured against the values the form was
   * seeded with. Sending the whole form wrote every field back on every save, which made the
   * activity log unreadable and meant two people editing different fields overwrote each
   * other with values neither had touched.
   *
   * The revision travels with it (`version`), so the server refuses the write outright if the
   * ticket moved underneath this form rather than silently discarding somebody's change — and
   * the reload afterwards is what confirms what was actually stored, rather than trusting
   * local state.
   */
  async function saveEdit() {
    if (!bundle) return;
    const changed = Object.fromEntries(
      Object.entries(edit).filter(
        ([key, value]) => value !== editBaseline[key as keyof typeof edit],
      ),
    );
    if (!Object.keys(changed).length) {
      setEditOpen(false);
      notify("Nothing changed.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api<{ ticket: TicketRecord }>("/api/tickets/" + id, {
        method: "PATCH",
        body: JSON.stringify({ ...changed, version: bundle.ticket.version }),
      });
      setEditOpen(false);
      // Re-read rather than patching local state from the form: what is on screen afterwards
      // is what the database returned, so a field the server normalised or rejected cannot
      // look saved when it was not.
      await load();
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      const fields = Object.keys(changed).length;
      notify(
        `Saved to ticket ${saved.ticket?.ticketNumber ?? t?.ticketNumber ?? ""} · ` +
          `${fields} field${fields === 1 ? "" : "s"} updated, revision ${saved.ticket?.version ?? "?"}.`,
      );
    } catch (e) {
      notify((e as Error).message, "error");
      // The save failed, so the form is out of step with the record: reload and let the person
      // see the stored values before trying again.
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket() {
    if (!bundle) return;
    setBusy(true);
    try {
      await api("/api/tickets/" + id, {
        method: "DELETE",
        body: JSON.stringify({
          version: bundle.ticket.version,
          confirmation: deleteConfirmation,
        }),
      });
      setDeleteOpen(false);
      onUpdated?.();
      window.dispatchEvent(new Event("iris:tickets-updated"));
      notify(`${bundle.ticket.ticketNumber} deleted.`);
      onClose();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * In the preview every write is switched off. The point of that route is to
   * judge the interface, and a mutation there would either fail against the
   * signed-out API or, worse, half-succeed. Saying so once, plainly, is better
   * than letting someone click Resolve and watch nothing happen.
   */
  const off = () =>
    notify("Actions are switched off in the design preview.");
  const as = <T extends (...args: never[]) => unknown>(fn: T) =>
    (fixture ? off : fn) as T;

  const t = bundle?.ticket;
  const coOwners = t ? coOwnersOf(t) : [];
  const settled = t ? ["resolved", "closed"].includes(t.status) : false;
  const recurrenceCount = Number(t?.customFields?.recurrenceCount) || 0;
  const canManage = Boolean(
    bundle && (bundle.canEditDetails || bundle.canResolve),
  );
  return {
    open,
    onClose,
    t,
    user,
    busy,
    setDeleteConfirmation,
    setDeleteOpen,
    error,
    bundle,
    settled,
    notify,
    openEditor,
    load,
    duplicate: as(duplicate),
    nudging,
    nudge: as(nudge),
    recurrenceCount,
    setChildId,
    coOwners,
    tab,
    setTab,
    id,
    railOpen,
    resolutionToggle,
    setRailOpen,
    mentionPeople,
    note,
    setNote,
    setMentioned,
    addNote: as(addNote),
    setLinkOpen,
    link: as(link),
    extendOpen,
    extendHours,
    setExtendHours,
    extendReason,
    setExtendReason,
    setExtendOpen,
    extendSla: as(extendSla),
    patch: as(patch),
    staff,
    canManage,
    setEntity,
    setLocalDetails,
    resolutionRegion,
    closeResolution,
    setBundle,
    editOpen,
    setEditOpen,
    edit,
    saveEdit: as(saveEdit),
    setEdit,
    deleteOpen,
    deleteConfirmation,
    deleteTicket: as(deleteTicket),
    linkOpen,
    linkQuery,
    setLinkQuery,
    linkTerm,
    searching,
    choices,
    childId,
    onUpdated,
    entity,
    localDetails,
  };
}
export function TicketDialog(props: {
  id: number;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  fixture?: TicketDetailBundle;
}) {
  const model = useTicketDialogController(props);
  return <TicketDialogView model={model} />;
}
