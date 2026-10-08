# IRIS styling audit and refinement

Reviewed the shared shell, theme tokens, navigation, Tabs primitive, overview
graphics, metrics, ticket workspace, filters, badges, and ticket detail styles.
This is a source-based audit; authenticated visual acceptance is still pending.

| Finding | Evidence | Change |
| --- | --- | --- |
| Conflicting visual direction | `premium.css` contained quiet-surface rules followed by glass, gradient, glow, and luxury overrides for the same components. | Replaced the competing finish layers with one shared contract. White/slate surfaces, blue selection, restrained elevation, and consistent radii apply across the shell and workspace. |
| Selected navigation was too subtle | The final sidebar rules used a translucent accent with no persistent marker. Workspace links matched only exact routes. | Selected links now use solid accent, contrasting text/icons, and stronger label weight. Ticket detail routes keep All tickets selected. |
| Tab refinements targeted absent markup | The removed polish layer targeted `.tab-count`; Tabs actually renders `.tab-pill`. | Style the real pill, with contrasting counts on selected tabs. Share selected-state styling with view switches and module navigation. |
| Indicator and scrolling had different coordinate systems | The absolute `.tabs-thumb` was outside the scrollable `.tabs-list`, but its width and position came from buttons inside that list. | Put the underline indicator inside the list. Segmented tabs use their own button background, so selection remains visible before measurement and during overflow. |
| Theme-specific overview diverged from the app | `design-system.css` gave overview a separate warm dark palette, strong paired shadows, and independent surface colors. | Map overview tokens to shared theme values; refine volume bars, sparklines, chips, and metric typography. Keep existing real-data graphics and drill-down behavior. |
| Status colors were hardcoded | The removed badge layer used fixed purple, amber, red, and green text values in both themes. | Use semantic theme tokens for text, backgrounds, borders, and dots. Remove glowing and pulsing badge dots. |
| Motion and elevation competed for attention | Hover lifts, repeated glows, slow card flips, and broad transitions appeared in the removed layer. | Use short finite entrances, restrained hover/focus feedback, a 280ms overview flip, and a subtle CTA arrow. Preserve the global reduced-motion policy and loading feedback. |
| Small-screen controls and spacing needed consistency | Tab and view-switch heights varied; toolbar content could compete for width. | Allow toolbar wrapping, scroll tab labels, increase small-screen control sizes, and align page gutters and overview stacking. |

## Implementation boundaries

- `premium.css` stays last in the root CSS import order and owns the shared
  finish. Its two remaining `!important` declarations preserve the established
  ticket-dialog width contract.
- Appearance spacing, corner-radius, and shadow controls remain token driven.
- Existing case-column/resolution-rail layout rules remain in place.
- No new dependencies, imagery, business logic, data sources, or authentication
  changes were introduced.
- Historical CSS remains in `globals.css` (18,422 lines) and
  `design-system.css`; this change consolidates the final finish, not every
  historical rule. A broader migration should move page-specific styles to
  CSS Modules incrementally with signed-in visual comparisons.

## Validation

- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed.
- `npm run build` — passed; production CSS compiled successfully.
- PostCSS parsing of all three shared stylesheets — passed.
- Calculated contrast: selected text 6.64:1 in light mode and 8.58:1 in
  dark mode; muted text on the main surface 5.51:1 and 6.92:1 respectively.
  These checks cover those token pairs, not every rendered component.
- `git diff --check` — passed.
- React component review: retained tab keyboard handlers, selected/current-page
  semantics, disabled states, measurement cleanup, and existing data behavior.
- Local `/dashboard` returns the expected unauthenticated redirect. No session
  was fabricated or authentication bypassed for visual testing.

Browser limitations: an isolated in-app browser was unavailable; native Chrome
was concurrently being used and its state changed during inspection. No
post-change signed-in screenshots or desktop/mobile/dark-mode visual claims are
made. Still verify overview, All tickets (all view modes), selected/overflowing
tabs, nested ticket routes, ticket detail and resolution, and representative
forms at desktop and 375px widths, in both themes and with reduced motion.
