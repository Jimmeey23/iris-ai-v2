# Ticket Ownership, Department & Escalation — The Single Rule

**Last updated:** 2026-11-06 · **Applies to:** every ticket that requires resolution
(`resolutionRequired = true`). Record-only tickets (feedback, compliments,
assessments) carry no SLA and never escalate.

---

## 1. The five facts every ticket shows

Every ticket — on the board, in the detail view, in the digest — states
these five facts in the same order and the same words:

| Fact | Where it is stored | What the UI shows |
|------|--------------------|-------------------|
| **1. Responsible department** | `tickets.departmentName` (from `settings → categoryDepartments` → `subcategoryRouting`) | Blue chip `Operations`, `Training`, `Marketing` … |
| **2. Lead owner (assignee)** | `tickets.assignedStaffId / Name / Email` | Avatar + name, `Lead` badge. `Unassigned → department queue` when no eligible cover |
| **3. Reporting manager** | `staff.manager` (free-text, resolved via `lib/reporting-line.ts`) → staff directory | `Reports to: Ravi Sharma` under the owner, with handle `@ravi.sharma` when known |
| **4. Escalation target & rule** | `tickets.escalatedTo*` + `settings → escalateAfterBreachHours` + `settings → escalationOwnerIds` | `Escalates to [target] [hours]h past target` — or `Escalation off` when `0` |
| **5. Extra visibility** | `tickets.additionalOwners`, `slaDueAt`, `committedResolutionAt`, `isEscalated` | Co-owners (`+2`), SLA countdown, committed date, escalation banner |

If any of the five is missing, the UI says **why** — e.g. *“No reporting manager on file — falls back to Operations escalation owner (Zahur)”* — rather than leaving a blank.

---

## 2. How a ticket gets its owner

```
Category + Subcategory → Department (config.categoryDepartments)
                                    ↓
                    ── routing precedence ──────────────────
                    1. Subcategory override owner (config.subcategoryRouting[cat|||sub].ownerId)
                    2. Studio + Category override (config.routingOwners[cat::studio])
                    3. Category default owner (config.routingOwners[cat])
                    4. Named city seats (config.cityOwnerIds[dept][city]) — lowest open workload
                    5. Everyone covering that studio — round-robin for Sales/CS, lowest workload otherwise
                    6. Department queue (Unassigned) — when nobody eligible covers the studio
```

*All five levels check `isActive` and studio coverage. An inactive person or
someone who does not cover the ticket’s studio is skipped to the next level;
nothing silently falls back to a default.*

Studio coverage is:

* explicit `staffStudioCoverage[staffId]` when set, otherwise
* the staff member’s `studioId` / `location` city, via `lib/routing.ts → studioIdsFor() / cityOf()`.

A manual reassignment by an administrator prompts for a reason
(`assignmentReason`) when it overrides the rule above.

---

## 3. How a ticket gets its priority & SLA

| Signal | Effect |
|--------|--------|
| Category / subcategory baseline | `critical` for Safety/ theft / emergency; `high` for AC, bikes, washroom, audio, censorship; `low` for Brand/Misc |
| `isImmediateDanger = Yes` or `impact = Safety concern` | ≥ `critical` |
| `isClassImpacted = Yes` / `Not yet` or `impact = Could not proceed` | ≥ `high` |
| `memberImpact = Yes` (a paying member lost a session) | ≥ `high` |
| `cycleSeverity = critical` (pedal, flywheel, brake — rider could be hurt) | ≥ `critical` |

One SLA number follows the final priority (workspace defaults, editable in
Settings → Assignment rules):

`critical 12h · high 16h · medium 48h · low 72h`

A per-subcategory `slaHours` override can extend the target up to 72h.
`SLA = createdAt + slaHours`. Nothing ever moves the target except a
one-time extension (see §5).

---

## 4. Escalation — the one rule

```
IF ticket.resolutionRequired
   AND ticket.status NOT IN (resolved, closed, recorded)
   AND slaDueAt IS NOT NULL
   AND now > slaDueAt + escalateAfterBreachHours
   AND priority != critical
THEN
  1. Raise priority → critical (and move the SLA target to critical's hours)
  2. Reassign lead owner:
        primary: owner's reporting manager (staff.manager → reportingManagerId())
        fallback: department's escalation owner (settings.escalationOwnerIds[deptId])
        — when neither resolves, the ticket stays with its owner and only the priority moves
  3. Record escalatedFromStaffId / escalatedToStaffId / escalatedAt
  4. Notify the new owner by email + in-app bell; CC the previous owner
  5. Never escalate the same ticket twice (escalatedAt guards it)
```

Configuration point: **Settings → Board → `Escalate after a missed target`**
(`escalateAfterBreachHours`). `0` = off. Typical prod: `4`–`24`.

**Escalation owners (fallbacks) — the standing matrix:**

| Department | Escalation owner |
|------------|-----------------|
| Operations | Zahur (19) |
| Training | Anisha (3) |
| Marketing | Reyna (18) |
| Sales & Client Servicing | Jimmeey (9) |
| Customer Service | Jimmeey (9) |
| Accounts | Sachin (21) |
| Management | — (uses reporting manager only) |

Edit in **Settings → Assignment rules → Escalation matrix** (new).

The **primary** path is always the owner’s own manager. The department owner
is the safety net for misspelt names, shared first-names, or an owner with no
manager recorded.

---

## 5. Extensions & commitments

* **One extension per ticket.** Owner or their reporting manager can add
  `1–72h` with a mandatory reason (`POST /api/tickets/:id/extend`). The server
  moves `slaDueAt` forward exactly by that number, so every SLA query and the
  sweep defer with it. A second attempt is refused.

* **Committed resolution date.** Separate from the SLA — the date the owner
  promises the *fix* by (`committedResolutionAt`). Editable by owner/manager,
  shown under Commitments. When it slips while open, it is marked *Commitment
  missed*.

---

## 6. Repeat reports & automatic re-checks

* **Three reports → high priority + escalated.** `appendRepeatReport` counts in
  SQL. On the 3rd report of the same fault (same ticket still open) the priority
  rises to at least `high` and `isEscalated` flips on.

* **Resolved bike / AC / mic → two re-checks, day 5 & day 10.** Assigned to the
  *original reporter’s* active staff profile (so the person who saw it confirms it),
  or left unassigned with a reason. Each check is idempotent by `submissionKey`.

---

## 7. Where it is visible

* **Board (TicketGrid):** columns `Department`, `Owner`, `Escalation` are now in
  the default set. Group-by → `Department` folds the table into department
  lanes. Escalation cells read `Escalated to X · 6 Nov`.

* **Ticket detail (header):** the *Accountability* strip — department, owner,
  reports-to, escalation path, co-owners — sits immediately below the title,
  so it is the first thing a reader sees after *what happened*.

* **Ticket detail (rail):** `Commitments` card — escalation banner, extension
  fact, revised SLA (when moved), committed date. One place, no duplication.

* **Settings → Assignment rules:** the matrix lives beside the category routing,
  with a sentence under each department saying *“When a ticket owned by someone
  with no manager on file breaches, it goes to …”*.

---

## 8. What was simplified in this revision

* Escalation is now one rule with two explicit targets, not three undocumented
  fallbacks. The previous `ESCALATION_OWNERS` regex table in `lib/routing.ts`
  is the matrix, with its names replaced by stable staff IDs so a rename does
  not silently break a handover.

* Status flow: no new states, but the detail view documents in one card
  *who* may move a ticket where, rather than scattering the rules across
  tooltips.

* The duplicate `Department` vs `department` chips were unified; `Co-owners`
  no longer repeats the lead owner’s name.

* Board defaults: department and escalation columns ship as on for new
  workspaces; existing users receive them via the `DASHBOARD_PREFS_VERSION`
  bump rather than having to discover them.

---

## 9. Verification

* `npm run check:unit` — `reporting-line`, `dashboard-contract`, `ticket-policy`
* `npm run check:routing` — every category routes to an active department
* `GET /api/health` (as admin) — `escalations` / `migrationsApplied`
* `POST /api/tickets/:id/extend` with `hours` + `reason` — second call 409
* Trigger escalation: set `escalateAfterBreachHours = 1`, create a ticket,
  back-date `slaDueAt` by 2h, call `GET /api/cron/outbox` with `CRON_SECRET`

