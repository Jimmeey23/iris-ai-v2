"use client";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsAutomationPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { booleanSetting, eventSetting } = model;

  return (
    <section className="card card-pad">
      <h2>Quietly working behind the scenes</h2>
      <p className="secondary" style={{ fontSize: 12, marginTop: 6 }}>
        Events are saved to an outbox, delivered after ticket creation, and
        logged with their result.
      </p>
      <h3 style={{ marginTop: 18, fontSize: 13 }}>Ticket events sent to n8n</h3>
      <p className="secondary" style={{ fontSize: 12, margin: "4px 0 10px" }}>
        Each event posts the full ticket to your configured n8n webhook.
        Requires an enabled n8n connection. History imports never send events.
      </p>
      {eventSetting(
        "created",
        "Ticket created",
        "Fires once when a ticket is filed, from any source except a history import.",
      )}
      {eventSetting(
        "statusChanged",
        "Status changed",
        "Fires on every status move except resolving and closing, which send their own event.",
      )}
      {eventSetting(
        "assigned",
        "Owner assigned or changed",
        "Fires when a ticket gains a new owner, including a reassignment.",
      )}
      {eventSetting(
        "resolved",
        "Resolved or closed",
        "Fires once when a ticket reaches resolved or closed.",
      )}
      {eventSetting(
        "overdue",
        "Follow-up target missed",
        "Fires once per ticket, when an open ticket passes its SLA target. Checked on every scheduled run.",
      )}
      {eventSetting(
        "escalated",
        "Escalated to critical",
        "Fires when the automatic breach escalation raises a ticket to critical.",
      )}
      {booleanSetting(
        "assignmentEmail",
        "Email the owner and reporting manager",
        "Requires an enabled Mailtrap connection and verified sender. Sends assignment notifications and one reminder three hours before an unresolved ticket’s SLA target.",
      )}
      {booleanSetting(
        "weeklyReportEmail",
        "Weekly trend report",
        "Every Monday morning, mails each administrator and manager a snapshot of the week just ended — patterns detected, a written briefing and recommended actions. Managers see only their own studios and teams. Needs the email setting above.",
      )}
      <div className="info-box warning" style={{ marginTop: 20 }}>
        Enabling these controls authorizes automatic external delivery. Save
        your integrations first. Failed events stay in the delivery log and can
        be retried after review.
      </div>
      <Link className="text-btn" href="/integrations" style={{ marginTop: 18 }}>
        Manage connections & delivery log <ArrowUpRight size={12} />
      </Link>
    </section>
  );
}
