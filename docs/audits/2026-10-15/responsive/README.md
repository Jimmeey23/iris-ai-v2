# Responsive pass — 15 October 2026

Scope: staff core flows — shell/nav, Overview, Assigned, All tickets (list, board, card, matrix, feed), ticket detail and the
Resolution panel, intake (`/iris`). Not covered: analytics, reports, trainers, equipment, radar, settings, staff, templates,
integrations, design-system, and the signed-out login screen at tablet/desktop widths (it rendered correctly at 390px).

## Method
Run against a throwaway local Postgres seeded with demo data, from a git worktree with no `.env`, so no production data or
integration keys were touched. Playwright at 360 / 390 / 768 / 1024 / 1440px, light and dark. The strict check measures every
visible element's right edge against a fixed-width viewport (an emulated phone hides this by zooming out to fit).

## Defects found → fixed
| Screen | Problem | Fix |
|---|---|---|
| Top bar (phones) | Long page names pushed the bell ~12px off-screen; two menu buttons; "Workspace ›" trail | Left group can shrink and ellipsise; phones keep menu + current page only |
| Sidebar drawer (phones) | The saved desktop "collapsed rail" preference shrank the drawer to 72px, so the logo text leaked at the screen edge and the opened drawer was an icon rail | `shell.tsx`: the rail preference is ignored at ≤767px |
| Ticket tables (phones) | A wide desktop table with one visible column | Rows become cards: title + meta, then status, priority, owner |
| Ticket tables (tablet) | Status / Priority / Owner scrolled off-screen | Cells tagged `data-col`; lower-value columns step aside at ≤1100 and ≤900px |
| Feedback button | Covered rows, KPI tiles and the table's last column | Below 1100px it is a 44px corner button |
| Resolution panel (phones) | Tabs wrapped to two rows; **Mark resolved** sat ~800px down the page | One swipeable tab row; Mark resolved pinned to the bottom of the sheet |
| Ticket sheet (phones) | Refresh / Duplicate / **Nudge owner** hidden below 640px | Restored on their own row |
| Intake (phones) | Stepper wrapped onto two rows; description box narrow | Dots on one line, only the current step is named |
| Feed view (phones) | Page became 474px wide on a 390px screen | Chips wrap under the entry |
| Forms (phones) | Sub-16px inputs make iOS Safari zoom on focus; small tap targets | 16px inputs and 40px buttons at ≤720px |

## Result
Zero off-screen elements across 5 widths × 2 themes × 5 screens (50 combinations); typecheck, ESLint on changed components and
the 226 unit tests pass. `phone-before.png` / `phone-after.png` are the same screens before and after.

## Known gaps
- Roughly 10–20 small controls per page remain under 32px at tablet/desktop widths; phones were prioritised.
- Board and matrix views scroll sideways inside their own container on phones (by design).
- The CSS cascade still redefines several components in `globals.css`, `premium.css` and CSS modules; this pass fixed the
  winning rule in place where it could and otherwise added final rules in a marked block at the end of `globals.css`.
