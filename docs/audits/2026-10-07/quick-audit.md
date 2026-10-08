# IRIS quick audit — 7 October 2026

Scope: read-only review of the current local checkout, plus one captured signed-in overview at https://iris-ai-v2.vercel.app/dashboard. Deployed/local commit parity was not established. Visual findings apply to the captured deployment; code findings apply to the checkout. No signup, ticket mutation, email, or destructive action was performed.

Validation: TypeScript passed; ESLint --quiet passed; 136 unit tests passed. These checks do not prove authenticated end-to-end correctness or accessibility compliance.

## Flow coverage

1. Overview — loaded with real ticket counts; visual, metric, and usability issues observed. Screenshot: [01-overview.png](01-overview.png).
2. All tickets — accessibility tree exposed table contents on the overview; attempted dedicated navigation could not be reliably verified because the active Chrome window changed to other apps. Source review completed.
3. Signup and intake — source review only; authenticated interaction, screen-reader behavior, mobile, dark mode, and resolution workflow remain unverified.

## Prioritized findings

| ID | Severity | Finding and evidence | Impact and recommended correction |
|---|---|---|---|
| 1 | Critical | Public signup checks the supplied email against an allowlist, then uses service-role `createUser` with `email_confirm: true` and signs in immediately. `src/app/api/auth/route.ts:198-269`; `src/lib/auth.ts:143-145`. | A caller can claim an unused allowed-domain address without proving mailbox ownership. Require verified email or an administrator invitation before activating a profile. Source-confirmed; not exploited against production. |
| 2 | High | Signup accepts any known studio selected by the caller and stores it as access scope. `src/app/api/auth/route.ts:238-255`. Agents can read tickets at their covered studio: `src/lib/auth.ts:415-419`. | Checking that a studio exists does not prove the applicant is entitled to its tickets. Derive scope from an approved staff record or require administrator approval. |
| 3 | High | Signup creates the Supabase user before studio/department validation. Those validation throws occur outside the cleanup try/catch. `src/app/api/auth/route.ts:223-246`. | Invalid input can leave an orphan confirmed identity and make subsequent signup fail. Validate all inputs before creation and ensure compensation covers every later failure. |
| 4 | High | Overview receives `tickets={tickets}` but its open/urgent/overdue subsets come from `filtered`. `src/components/command-center.tsx:122-136,431-440`. | Date/studio filters can change active work while leaving volume, resolved, clearance, and scope totals unfiltered. Pass one consistent filtered scope and define creation-period versus resolution-period reporting. |
| 5 | High | Overview calls `(open minus slaRisk)/open` “SLA compliance.” `src/components/overview-canvas.tsx:176-180`. Shared SLA compliance uses tracked tickets and includes late resolutions: `src/lib/metrics.ts:14-23,148-153`. | The same metric name has different denominators and failure rules; due-soon and non-tracked work also affect the overview figure. Use the shared metric, or explicitly name this “Open tickets outside the risk window.” |
| 6 | High | Ticket sorting is an `onClick` on a `<th>`; opening a ticket is an `onClick` on a `<tr>` with no keyboard target. `src/components/ticket-grid.tsx:160-184`. | Keyboard users cannot sort or open ticket details through these controls. Add a real sort button and a ticket link/button with clear focus styling. |
| 7 | Medium | Captured overview shows the page heading, date control, and Log a ticket action underneath the translucent sticky toolbar. Screenshot step 1. | Content becomes obscured in the captured scroll state. Recheck page-top and scrolled states, reserve proper toolbar spacing, and use an opaque surface or hide covered content. Exact CSS cause not established. |
| 8 | Medium | Large summary/volume panels dominate the captured desktop viewport; the ticket queue is below the fold. Screenshot step 1. | Staff must scroll past repeated summaries before acting on work. Reduce hero height and whitespace; bring the work queue closer to the top. This is a usability recommendation, not a functional failure. |
| 9 | Medium | Light overview labels and chart legend use `--ovc-faint: #98a2b3` on pale/white surfaces. `src/app/design-system.css:1784,1840-1846,2889-2895`; screenshot step 1. | On white this color has approximately 2.6:1 contrast, below 4.5:1 for normal text. Darken small labels and verify computed colors across both themes. No full WCAG compliance claim is made. |
| 10 | Medium | Chart has no dates or scale; zero buckets receive at least 8% bar height; resolved values are scaled only against the logged maximum and clipped at the top. `src/components/overview-canvas.tsx:432-455`. The resolved line is hidden from accessibility APIs. | Zero volume looks nonzero and resolution peaks can be flattened. Show actual zero height, scale both series together, label periods/axes, and provide accessible values or a data table. |
| 11 | Medium | Member/session lookup catches non-abort failures by clearing results and showing “No matches yet.” `src/components/multi-select.tsx:85,142-144`. | Authentication/provider failures look like missing members or sessions. Preserve error state with a retry action and distinguish successful empty searches. |
| 12 | Medium | Intake OptionSelect changes a visual cursor with arrow keys while focus remains on the trigger/search. Options lack stable IDs and no `aria-activedescendant` connects that cursor. `src/components/intake/option-select.tsx:48-59,68-80`. | Screen readers cannot reliably track the keyboard-highlighted option. Implement active-descendant linkage or move actual focus, then test with a screen reader. Source-confirmed semantic gap; runtime announcement not tested. |
| 13 | Medium | “Auto-routed today” is static copy below names drawn from all open tickets. “+N today” under Open is based on all tickets created today, not net open change. `src/components/overview-canvas.tsx:137-150,388,409`. | Copy implies timing and queue movement that its calculation does not establish. Use actual routing events; label creation count as “N logged today.” |
| 14 | Medium | Overview freezes its day and chart end at mount time and uses local `setHours` rather than shared workspace-timezone helpers. `src/components/overview-canvas.tsx:20-22,134-139,153-160`. | After midnight, “today” and age can remain stale; new tickets after mount can fall outside the chart span; browser timezones can disagree with India reporting. Refresh the clock and use shared timezone-aware helpers. |
| 15 | Low | Seven globally imported stylesheet layers total about 27,681 lines; ticket resolution layout is redefined repeatedly in globals.css (9585,14385,14591,17440). `src/app/layout.tsx:6-12`. | Cascade complexity is a maintenance risk and makes regressions harder to isolate. Consolidate final component rules and remove superseded overrides after verifying responsive states. This is not proof of a specific modal defect. |

## Recommended order

1. Repair signup verification, studio approval, and orphan-user handling.
2. Align dashboard scope and SLA definitions; fix chart and time calculations.
3. Add keyboard-operable ticket controls and correct dropdown semantics.
4. Fix lookup recovery, contrast, toolbar overlap, and queue placement.

Strengths: the signed-in overview loads populated data, offers clear actions and status text, and the checkout has passing static checks and unit coverage. Existing Radix modal primitives and some keyboard/reduced-motion handling provide a useful foundation.

Limits: no full mobile/dark-mode pass, automated accessibility scan, screen-reader test, production security exploit, database integrity audit, or end-to-end creation/resolution test. Shared browser activity prevented reliable capture of further steps. No application behavior was changed.
