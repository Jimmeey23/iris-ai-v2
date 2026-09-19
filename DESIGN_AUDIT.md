# IRIS — Style & Design Audit

**Scope:** full visual language, component library, motion system, accessibility and
front-end performance.
**Codebase:** Next.js 16.2.6 (App Router, Turbopack) · React 19.2.6 · Tailwind CSS 4.1.17 · Radix Dialog · lucide-react
**Measured at:** `6c98023` on `main`, 19 Sep 2026
**Surface:** 1,911 lines of `globals.css` (227 KB), 26 components, 16 routes, 11.6k lines of TSX

---

## 1. Executive summary

IRIS already has strong *art direction*. The matte-black-and-gold palette, the hand-built
SVG illustration set, the cinematic landing curtain and the instrument-panel framing of the
metric cards are a coherent, opinionated point of view — most internal ops tools never get
that far. The problem is not taste. It is that the taste was applied **one screen at a time**,
with no shared system underneath it.

The numbers make that concrete:

| | Found on `main` |
|---|---|
| Distinct `border-radius` values | **38** (4px → 26px, plus 99px and 50%) |
| Distinct `font-size` values | **35** (including 7px, 7.5px, 8px, 8.5px) |
| Distinct transition durations | **21** (.1s → .9s) |
| Bespoke button classes | **18** |
| Separate tab implementations | **7** |
| Tailwind utility classes actually emitted | **0** |
| `role="tablist"` / `aria-selected` in the codebase | **0** |
| Light-theme colours failing WCAG AA | **5 of 8** |
| Hard-coded colour literals in CSS | **174** |
| Inline `style={{…}}` objects in TSX | **333** |
| Infinite CSS animations | **43** |

Tailwind v4 is a dependency, is imported at the top of `globals.css`, and produces
**zero** utilities — verified by grepping the compiled bundle for `.flex{`, `.p-4{`,
`.text-sm{`. Every pixel of the product is hand-written CSS in one file, while the
framework paid for on every build contributes nothing but its preflight.

The net effect is a UI that looks designed up close and inconsistent at arm's length:
the same "small pill" is 5px radius at 9.5px type on a ticket chip, 4px radius at 8px
type on a nav badge, and 10px radius at 8.5px type on a context tab. None of those
decisions is wrong. Together they read as noise, and noise is the opposite of premium.

**What premium actually costs here is not more decoration — it is subtraction.**
A radius scale, a type scale with a legibility floor, one motion vocabulary, and a
component layer that every screen consumes. That is what this pass delivers.

### Headline issues, ranked by impact

| # | Issue | Severity | Category |
|---|---|---|---|
| 1 | No design-token layer; Tailwind v4 installed but unused | **Critical** | Architecture |
| 2 | 5 of 8 light-theme colours fail WCAG AA at the sizes used | **Critical** | Accessibility |
| 3 | Landing page downloads a 1.9–4.6 MB video on *every* visit, including skips | **Critical** | Performance |
| 4 | Landing hero downloads both theme variants (254 KB) and displays one | **High** | Performance |
| 5 | 7 tab implementations, none with ARIA roles or keyboard navigation | **High** | Accessibility |
| 6 | Modals have an entrance animation and no exit — they blink out | **High** | Craft |
| 7 | Canvas halo runs ~84 `shadowBlur` fills per frame, forever, off-screen | **High** | Performance |
| 8 | 38 radii / 35 type sizes / 21 durations — no scales | **High** | Consistency |
| 9 | 28 declarations render text at 7–8.5px | **High** | Legibility |
| 10 | `:focus-visible` rule sets `border-radius:4px`, reshaping the focused element | **High** | Bug |
| 11 | `.chip` declared twice with conflicting geometry; the second wins | **Medium** | Bug |
| 12 | `.toggle` declares `border` twice; the first is dead code | **Medium** | Bug |
| 13 | `--danger` referenced but never defined (falls back to a hard-coded hex) | **Medium** | Bug |
| 14 | Halo captured its colour prop with `[]` deps — stale after a theme switch | **Medium** | Bug |
| 15 | Toasts have no exit animation, no pause-on-hover, no countdown | **Medium** | Craft |
| 16 | Ticket tables render every row; no virtualisation | **Medium** | Performance |
| 17 | Two 1-second `setInterval` ticks re-render whole trees | **Medium** | Performance |
| 18 | Tailwind scans 168 files including 7 markdown docs, SQL and PNGs | **Low** | Build |
| 19 | 333 inline `style={{}}` objects defeat memoisation | **Low** | Code health |
| 20 | `public/Trainer Images/` — 4.8 MB, unoptimised, space in the path | **Low** | Assets |

---

## 2. Methodology

Findings are measured, not eyeballed. Specifically:

- **Token fragmentation** — extracted every `border-radius:`, `font-size:` and
  `transition:` declaration from `globals.css` with `grep -o`, then counted distinct values.
- **Contrast** — parsed the `:root[data-theme=…]` palettes and computed WCAG 2.1 relative
  luminance ratios for every foreground/background pair a badge, chip or meta line can
  actually land on (`--bg`, `--surface`, `--surface-2`, `--surface-3`).
- **Bundle reality** — compiled `globals.css` through `@tailwindcss/postcss` outside the dev
  server and inspected the emitted CSS plus Tailwind's `dependency` messages to see exactly
  which files it scans and which utilities it generates.
- **Runtime behaviour** — read the rendered SSR HTML for `/`, `/dashboard` and all 16 routes
  to confirm what the browser is actually asked to download before JavaScript runs.
- **Regression gate** — `tsc --noEmit`, `eslint .` and an HTTP 200 + no-error-boundary check
  on all 16 routes, before and after.

*Limitation:* this sandbox has no browser binary and the Playwright CDN is unreachable, so
there are no screenshots in this report. Everything here is derived from source, compiled
output and rendered HTML. The app does run — `npm run dev` on port 3000 — and `/design-system`
was added so the results can be reviewed visually in one place.

---

## 3. Findings

### A. Design-token architecture — *Critical*

**A1. Tailwind v4 is installed, imported, and generates nothing.**

`globals.css` line 1 is `@import "tailwindcss"`. Compiling it and grepping the output for
`^\.flex{`, `^\.p-4{`, `^\.text-sm{` returns **zero matches**. Of the ~15 strings in TSX that
look like utilities (`flex-row`, `grid`, `text-xs`), all but a handful are the project's own
custom classes. So the build pays for Tailwind's engine and preflight and receives no
utilities, while 227 KB of hand-written CSS does the actual work.

There is no `@theme` block, which means the tokens don't exist as far as Tailwind is
concerned: `bg-surface`, `text-muted` and `rounded-card` are not available even though those
are precisely the values the product is built from.

**A2. 174 hard-coded colour literals.**

`#ffd166` appears 8×, `#f4f2ec` 6×, `#9b98a8` 6×, `#c9902a` 5×, `#b39dff` 5× — all of them
duplicates of values that already exist as `--accent-bright`, `--text`, `--muted`,
`--accent-deep` and `--purple`. The landing page re-declares the entire dark palette as
`--l-*` variables inside `.intro` and `.lb`, so there are now two copies of the brand colours
that must be edited together.

**A3. `--danger` is referenced but never defined.**

`.asset-card-down` uses `var(--danger, #e5484d)` — a red that is in neither palette. It always
took the fallback, so the equipment register's "out of rotation" state was a colour the design
system has never heard of.

**A4. Z-index reaches 300 with no scale.**

Fifteen distinct values: 0, 1, 2, 3, 5, 15, 30, 40, 50, 70, 80, 100, 101, 200, 300. Sidebar is
40, topbar is 30, dialog overlay is 100, dialog is 101, toasts are 300, the intro curtain is
200. Nothing documents why the curtain sits *below* the toasts, and the next popover added has
no obvious number to take.

**A5. Tailwind scans 168 source files.**

With no `@source` directive, v4 auto-detects by walking the project. The scan list includes
`.env.example`, all seven markdown strategy documents, `data/historic-tickets.json`, the
drizzle SQL migrations and JSON snapshots, `package.json`, and `public/Trainer Images/…PNG`.
Forty-four of 168 are not source at all, and all of them are re-scanned on every rebuild.

---

### B. Typography & legibility — *High*

**B1. Thirty-five distinct font sizes, with no scale.**

The distribution is revealing: 61 uses of 11px, 59 of 10px, 57 of 12px, **49 of 10.5px**,
46 of 9px, **42 of 11.5px**, **35 of 9.5px**, 25 of 12.5px. Half-pixel steps are the third,
fourth, fifth and seventh most common sizes in the product. They exist because each screen
tuned its own type until it looked right, rather than picking from a set.

**B2. Twenty-eight declarations render at 7–8.5px.**

`.compose-hint` at **7.5px**, `.ticket-card-owner .avatar` at **7px**, and 8px or 8.5px for
`.nav-ai`, `.chat-day`, `.priority-badge`, `.d-label`, `.m-label`, `.t-label`, `.tier-badge`,
`.nav-radar-pill`, `.room-category-badge`, `.ticket-flag`, `.bt-label`, `.status-indicator-tag`,
`.quick-action-tag` and more. Almost all are uppercase mono with letter-spacing — the hardest
possible text to read small, on a tool used on studio-floor laptops in variable light.

These are not decorative. `.priority-badge` carries *Critical*. `.d-label` labels diagnostic
values in the room inspector. `.ticket-flag` marks a stale ticket.

**B3. Two display faces with overlapping roles.**

Outfit (variable, 100–900) and Space Grotesk (500/600/700) are both geometric sans-serifs, and
`--font-display` falls back from one to the other:

```css
--font-display: var(--font-space), "Space Grotesk", var(--font-outfit), sans-serif;
```

Three families is a lot of font payload for a product where Space Grotesk and Outfit are
visually near-interchangeable at UI sizes.

---

### C. Colour & contrast — *Critical*

**C1. Five of eight light-theme colours fail WCAG AA at the sizes they are used.**

Measured against all four light surfaces, worst case shown:

| Token | Value on `main` | Worst ratio | Verdict |
|---|---|---|---|
| `--text` | `#0c1220` | 16.38 | AAA ✓ |
| `--secondary` | `#3d4454` | 8.54 | AAA ✓ |
| `--accent` | `#1554d6` | 5.62 | AA ✓ |
| `--blue` | `#1554d6` | 5.62 | AA ✓ |
| `--purple` | `#6d4fd1` | **4.99** | AA ✓ (marginal) |
| `--muted` | `#6b7280` | **4.23** | ✗ **fails** |
| `--red` | `#d8394a` | **4.00** | ✗ **fails** |
| `--green` | `#0f8a5f` | **3.82** | ✗ **fails** |
| `--amber` | `#b1690a` | **3.76** | ✗ **fails** |

AA requires 4.5:1 for text below 24px (18.66px bold). Every one of these failing colours is
used at **9–11px** in badges, chips, status pills, priority markers and meta lines. `--green`
is worst at 3.82:1 — and green is the colour the product uses to say *resolved*, *live* and
*healthy*. `--amber` at 3.76:1 is what *SLA due soon* looks like.

The dark theme is fine; `--muted` clears 4.64:1 at its worst. This is a light-mode-only defect,
which is exactly the kind that ships — the team works in dark.

**C2. `::selection` used the raw accent.**

Selecting text on a gold background with near-black foreground is fine, but the rule gave no
alpha, so selection in light mode painted solid `#1554d6` over `--accent-text` white. Readable,
but harsh against the otherwise soft palette.

---

### D. Component-library fragmentation — *High*

**D1. Eighteen button classes, no button component.**

```
.btn .btn-primary .btn-soft .btn-danger .btn-sm .btn-primary-action
.btn-secondary-action .btn-create-snag .btn-quick-resolve .btn-dispatch-lead
.btn-view-ticket .btn-open-iris-link .lb-cta-p .lb-cta-s .wa-btn-send
.icon-btn .text-btn .toolbar-pill-btn .toolbar-icon
```

Seven of these are one-off buttons invented for a single screen — `.btn-create-snag`,
`.btn-quick-resolve`, `.btn-dispatch-lead`, `.btn-view-ticket`, `.btn-open-iris-link`,
`.btn-primary-action`, `.btn-secondary-action`. Each re-implements radius, colour, hover,
transition and layout from scratch, which is why they drift: `.btn-quick-resolve` is 28px tall
at 10.5px type with a `.15s` transition, while `.btn-open-iris-link` is 27px at 10.5px with a
`transform .15s` transition and no background change at all.

Usage counts show where the leverage is — `className="btn"` 43×, `btn btn-primary` 39×,
`btn btn-sm` 33×. Roughly **120 call sites** share three rules.

There is no loading state, so 23 places hand-roll `{busy?<Loader2 className="animate-spin"/>:null}`
inside the button, and the button changes width mid-action.

**D2. Seven tab implementations, zero ARIA.**

| Class | Style | Where |
|---|---|---|
| `.workspace-tabs` | underline | command centre, reports, ticket detail |
| `.module-tabs` | segmented | momence, equipment, integration dialog |
| `.view-switch` | icon segmented | command centre, momence, equipment |
| `.panel-tab-btn` | card | iris chat right panel |
| `.rw-tabs` | stacked card | resolution panel |
| `.context-tab` | pill | iris context bar |
| `.template-category-nav` | reuses `.btn.btn-sm.active` | templates |

A grep for `role="tablist"`, `role="tab"` and `aria-selected` across all TSX returned **0**.
None of the seven has arrow-key navigation, a roving tabindex, or an association between the
selected tab and the panel it controls. A screen-reader user hears seven buttons and no
indication of which is selected or what changed.

They also disagree visually: `.workspace-tabs button.active` sets a 2px `border-bottom` that
appears instantly, `.module-tabs button.active` swaps a flat background, `.panel-tab-btn.active`
raises a card with a shadow. Three metaphors for one interaction.

**D3. `.chip` was declared twice, and the second declaration won.**

Line 21 grouped it with buttons:

```css
.btn,.chip{…padding:9px 14px;border-radius:9px;font-size:12px;transition:…transform .1s}
.btn:hover,.chip:hover{background:var(--surface-3);…}
.btn:active,.chip:active{transform:translateY(1px)}
```

Line 1074 re-declared it as metadata: `padding:2px 7px;border-radius:5px;font-size:9.5px`.
Because it came later at equal specificity, the *geometry* from line 1074 won — but the
`transform:translateY(1px)` on `:active` and the hover background from line 21 still applied.
So a passive metadata chip depresses when you click it, as though it were a control.

**D4. `.toggle` declared `border` twice.**

```css
.toggle{…border:0;padding:2px;…border:1px solid var(--border)}
```

The `border:0` is dead code. The knob travelled by a hard-coded `translateX(15px)` unrelated to
the track width, so any change to either silently misaligns it.

**D5. 333 inline `style={{}}` objects.**

Worst offenders: `trainer-report.tsx` 40, `equipment-panel.tsx` 21, `iris-chat.tsx` 20,
`reports/page.tsx` 19, `settings/page.tsx` 17. Each creates a new object identity per render,
so any `React.memo` downstream is defeated and React re-applies the style attribute on every
pass. Most set values that belong in a class — `style={{fontSize:10}}`, `style={{marginBottom:15}}`.

---

### E. Motion & animation — *High*

**E1. Twenty-one distinct transition durations.**

`.18s` 37×, `.15s` 36×, `.2s` 33×, `.22s` 13×, `.25s` 12×, `.14s` 8×, `.16s` 6×, then `.5s`,
`.8s`, `.24s`, `.6s`, `.3s`, `.1s`, `.9s`, `.7s`, `.4s`, `.35s`, `.13s`, `.12s`, `.55s`.
Adjacent controls in the same toolbar animate at 140ms, 150ms, 160ms and 180ms. Individually
imperceptible; collectively it is why the product reads as *busy* rather than *calm*.

**E2. Modals have no exit animation.**

`.dialog-content` animates `dialog-in .22s`; `.dialog-overlay` animates `fade-in .18s`.
Neither has a `[data-state=closed]` rule. Radix keeps the node mounted until `animationend`
precisely so you can animate the exit — that capability was installed and unused. Dialogs
therefore assemble smoothly and then vanish between frames.

**E3. Toasts have no exit animation, no pause-on-hover, no countdown.**

`setTimeout(…,6500)` removes the node outright. A message you are halfway through reading
disappears with no warning and no way to hold it. The stack is capped by `t.slice(-3)`, which
drops the *oldest* silently rather than animating it away.

**E4. Forty-three infinite animations.**

`ambient-drift` (14s, 18s), `cc-drift` (11s, 9s), `cc-shine` (6.5s), `cc-orb-pulse` (3.4s),
`lb-breathe` (5.5s), `lb-bob` (7s, 8s), `lb-ticker` (46s), `marquee-slide` (80s), `pulse-dot`
(11 uses), `shimmer`, `sla-pulse`, `td-glow-drift` (14s), `stream-blink`. Several run on
elements that also carry `filter:blur(40px)` or `blur(50px)` — `.chat-ambient-glow::before`
and `::after` animate a 420px and a 320px blurred radial gradient continuously. Blurred
elements that move must be re-rasterised every frame; this is among the most expensive things
CSS can do, and it runs whether or not the chat panel is on screen.

**E5. Reduced motion was covered in seven places and missed everywhere else.**

Blocks existed for `.lb`, the metric cards, `.pr-value`, `.stream-caret`, `.intro` and two
others. Everything else — all 43 infinite animations, every entrance, the chat marquee, the
skeletons — still moved. A user who asks for reduced motion got a partial answer.

---

### F. Accessibility — *Critical*

Beyond C1 and D2:

**F1. The `:focus-visible` rule reshaped whatever had focus.**

```css
button:focus-visible,a:focus-visible,input:focus-visible,[tabindex]:focus-visible{
  outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
```

That trailing `border-radius:4px` applies to the focused element, not to its outline. Tabbing
into a 14px-radius card snapped its corners to 4px for as long as it held focus. Every modern
browser draws `outline` following the element's own `border-radius`, so the declaration was
both harmful and unnecessary.

**F2. Interactive `div`s without keyboard access.**

`tickets-board.tsx:103` — `<div className="matrix-cell" onClick={…}>`. The studio heatmap grid
is mouse-only; there is no `role`, no `tabIndex`, no key handler. `shell.tsx:45`
(`sidebar-scrim`) is defensible as a dismiss target, but the matrix cells are primary
navigation into a filtered ticket list.

**F3. Icon-only buttons without accessible names.**

`momence/page.tsx:13` renders `<button className="icon-btn" onClick={…}>` with no
`aria-label` and no `title`. Most other icon buttons in the codebase do label themselves —
103 `aria-label` occurrences overall — so this is drift rather than a missing convention.

**F4. Tooltips were `title` attributes only.**

`title` is invisible to touch, invisible to keyboard users, unstyleable, and delayed by roughly
a second by the platform. On a dense toolbar of icon buttons that is the difference between a
control being discoverable and not.

---

### G. Performance — *Critical*

**G1. The intro video is fetched on every visit, including visits that skip it.**

The SSR HTML for `/` contained:

```html
<video class="intro-video" src="/video/iris-intro-dark.mp4" poster="/video/iris-intro-dark.webp"
       muted playsInline autoPlay preload="auto">
```

`preload="auto"` is a hint to download the *entire* file. Because it is in the server-rendered
HTML, the browser begins fetching it from the HTML stream — before any JavaScript runs, before
React hydrates, and before the effect that checks `sessionStorage.getItem('iris-intro-seen')`
can bail out and unmount it. Returning visitors therefore pulled **1.9 MB** (dark) or
**4.6 MB** (light) on every trip to the home page to display nothing.

**G2. The hero downloads both theme variants.**

```html
<img src="/images/iris-hero-dark.webp" class="lb-img lb-img-dark" fetchPriority="high"/>
<img src="/images/iris-hero.webp"      class="lb-img lb-img-light"/>
```

with

```css
[data-theme=light] .lb-img-dark{display:none}
[data-theme=dark]  .lb-img-light{display:none}
```

`display:none` does not prevent a download. 121 KB + 133 KB = **254 KB fetched, 121 KB shown**,
on what is almost certainly the LCP element. Neither image carried `width`/`height`, so the
1024×1024 frame had no reserved box until the bytes landed — a layout shift on the largest
element on the page.

**G3. The canvas halo used `shadowBlur` on ~84 particles per frame.**

```js
ctx.shadowBlur=10*dpr;ctx.shadowColor=`rgba(${rgb},.9)`;ctx.fill();ctx.shadowBlur=0;
```

Canvas shadow-blur forces an offscreen buffer and a blur pass *per draw call*. Three orbits of
18 + 28 + 38 particles = 84 blurred fills, plus 70 dust fills, every frame, forever. The loop
had no IntersectionObserver and no `visibilitychange` listener, so it continued at full rate
after the hero scrolled out of view and while the tab was backgrounded.

It also captured `rgb` with an empty dependency array while the prop changes on theme switch:

```js
},[]);   // rgb is in scope but not in deps
```

ESLint flagged this on `main` (`react-hooks/exhaustive-deps`). The practical result: switch to
light mode and the halo keeps drawing gold particles over a blue page.

**G4. `next/image` is used once; raw `<img>` nine times.**

Only `ticket-art.tsx` imports it. Every other image is a raw `<img>`, so there is no responsive
`srcset`, no AVIF, no automatic dimension reservation. `public/images/` holds 568 KB of WebP at
fixed 1024×1024 regardless of the 470px they render at.

**G5. Ticket tables render every row.**

`ticket-grid.tsx:240` is `<tbody>{sorted.map((t) => row(t, false))}</tbody>` with no windowing
and no page cap. The workspace has a `data/historic-tickets.json` import path, so row counts in
the thousands are the expected steady state, not an edge case. Each row carries avatars, badges,
chips, a priority rail and an SLA countdown.

**G6. Two 1-second intervals re-render whole subtrees.**

`board-telemetry.tsx:57` (`setInterval(tick, 1000)`) and `studio-ops-radar.tsx:127`
(`setInterval(() => setNow(Date.now()), 1000)`). Setting a timestamp into state once a second
re-renders the component and every child that isn't memoised, to update a clock. Six further
intervals run at 12s/30s/60s across the app — twelve `setInterval` calls total, none
co-ordinated, so they drift in and out of phase and produce bursty work.

**G7. `public/Trainer Images/` — 4.8 MB, 21 files, space in the directory name.**

Unoptimised JPEGs served as-is. The space forces URL-encoding in every reference and makes the
path fragile in shell scripts and markdown.

**G8. `next/font/google` fetches at build time.**

`next build` in this sandbox fails outright:

```
next/font: error: Failed to fetch `Outfit` from Google Fonts.
```

Three families × up to three weights. Self-hosting is the right end state (and `next/font` does
it in production), but a build that requires egress to `fonts.googleapis.com` is a CI fragility
— it will fail on an air-gapped runner or during a Google outage.

---

### H. Code health — *Medium*

**H1. One 1,911-line CSS file, minified by hand.**

Nearly every rule is compressed onto a single line, several carrying four or five declarations
per selector with no whitespace. It is not machine-minified output — it is authored that way,
which makes diffs unreadable and review effectively impossible. Nine selectors are declared
more than once (`.draft-document` 3×; `.timeline-row`, `.ticket-card`, `.integration-card`,
`.draft-cover`, `.detail-hero`, `.btn`, `.badge-critical-pill`, `.badge` 2× each), and in at
least three cases the duplicate silently overrides the original.

**H2. `.detail-hero` is defined twice with incompatible intent.**

Line 1122 sets it as a flex row with a gradient background. Line 1138 re-declares it as
`position:relative;overflow:hidden;isolation:isolate`. Both apply. Neither reader knows the
other exists.

**H3. Twenty-four `!important` declarations**, including `font-size:22px!important` and
`font-size:24px!important` on the SLA countdown — specificity fights resolved by escalation
rather than by restructuring.

**H4. `.rise-stagger` covers six children.**

```css
.rise-stagger>*:nth-child(6){animation-delay:.22s}
```

The seventh and later children of any staggered container animate with no delay at all,
arriving *before* their siblings. The template grid renders dozens.

---

## 4. What was implemented in this pass

Everything below is committed on `arena/01a0ba95-iris-ai-v2`. The strategy was to fix the
**foundation** rather than the screens: token layer, primitives and the landing page. Because
roughly 120 button call sites share three CSS rules, upgrading those rules improves every
screen at once with no migration.

### 4.1 Token layer (`globals.css`, new)

- **`@theme inline` block** re-publishing the runtime variables into Tailwind v4's namespaces.
  `bg-surface`, `text-muted`, `rounded-card`, `shadow-3`, `ease-out-expo` now exist, and
  because the mapping is `inline` they keep pointing at the live `var()` and re-resolve on
  theme switch. Tailwind is finally load-bearing.
- **Radius scale** — 7 steps (`--radius-2xs` 4px → `--radius-2xl` 24px, `--radius-full`).
- **Type scale** — 11 steps on a 1.167 ratio (`--text-3xs` 10px → `--text-4xl` 52px), plus
  `--tracking-*` and `--leading-*`.
- **Spacing scale** — 4px base, `--space-1` → `--space-10`.
- **Elevation scale** — `--shadow-1` → `--shadow-5`, plus `--highlight-inset` (the hairline of
  light along a top edge) and `--ring` (the focus ring).
- **Motion scale** — 4 easings (`--ease-out-expo` for entrances, `--ease-spring` for presses,
  `--ease-standard` for colour, `--ease-in-out-quart` for curtains) and 6 durations
  (`--dur-1` 100ms → `--dur-6` 760ms).
- **Layer scale** — `--z-base` → `--z-intro`, replacing the 15 ad-hoc values.
- **Semantic aliases** — `--danger`, `--success`, `--warning`, `--info` and their `-bg` pairs.
  `--danger` is now defined, so `.asset-card-down` resolves to the palette red.
- **`--grain`** — a 3% fractal-noise data URI, available for large gradients where banding
  shows.
- **`@source` scoping** — `@import "tailwindcss" source(none)` plus one `@source` for `src/`.
  Scanned files: **168 → 122**, all of them source.

### 4.2 Accessibility

- **Light palette re-balanced.** All eight semantic colours now clear AA against all four light
  surfaces, worst case 5.02:1:

  | Token | Was | Now | Worst ratio |
  |---|---|---|---|
  | `--muted` | `#6b7280` (4.23 ✗) | `#5b6472` | **5.24 ✓** |
  | `--green` | `#0f8a5f` (3.82 ✗) | `#0a6f4b` | **5.43 ✓** |
  | `--red` | `#d8394a` (4.00 ✗) | `#bd2a3a` | **5.17 ✓** |
  | `--amber` | `#b1690a` (3.76 ✗) | `#965704` | **5.02 ✓** |
  | `--purple` | `#6d4fd1` (4.99) | `#6346c6` | **5.71 ✓** |

- **Legibility floor.** All 28 declarations at 7/7.5/8/8.5px collapsed onto 9px. Sub-9px type
  in the product is now **0**.
- **Focus ring fixed.** The `border-radius:4px` is gone; `outline` follows each element's own
  radius and no longer clobbers a component's `box-shadow`, so a glowing primary button keeps
  its glow while focused. Coverage extended to `summary`, `[role=tab]`, `[role=switch]`,
  `[role=menuitem]`, with a `:focus:not(:focus-visible)` reset so clicking leaves no artefact.
- **`aria-current="page"`** on active sidebar links (`shell.tsx`).
- **Tabular numerals** on everything that can change — timers, IDs, counts, metrics — so digits
  no longer jitter as they tick.

### 4.3 Primitives

- **Buttons** — one base, **7 intents** (`primary`, `secondary`, `soft`, `ghost`, `outline`,
  `danger`, `success`) and **4 sizes** (`xs`/`sm`/`md`/`lg`), plus `block` and `active`.
  Layered gradient with an inset top highlight and a bottom shade so the primary reads as a
  physical key; a sheen sweeps on hover; `:active` bottoms out on a spring easing. A real
  `is-loading` state reserves the label box and swaps in a spinner — the button never changes
  width mid-action. `.btn` and `.chip` are separated: chips are now correctly inert.
- **`Button` component** (`ui.tsx`) — renders a `<button>`, or an `<a>` when given `href`, so a
  navigation target never has to be faked with `onClick`.
- **`Tabs` component** — `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`,
  roving tabindex, and Arrow/Home/End navigation. Two skins (`segment`, `underline`) sharing one
  indicator element that *glides* between tabs: its offset and width are measured off the DOM
  and written to `--tab-x`/`--tab-w`, so the motion is a transform rather than a repaint. It
  re-measures on resize and on `document.fonts.ready`. Paired with `TabPanel` for the ARIA
  relationship.
- **Legacy tab strips restyled, not replaced.** `.workspace-tabs`, `.module-tabs`,
  `.view-switch` and `.panel-tab-btn` were rebuilt on the shared tokens — the underline scales
  out from the centre, the segmented variant sits in an inset groove with a raised thumb. Every
  screen improves with no migration.
- **Tooltips** — pure CSS via `data-tip` / `data-tip-pos`, four placements, delayed 400ms on the
  way in so sweeping a toolbar doesn't strobe, instant out, suppressed on `hover:none`. A
  `<Tip>` wrapper guarantees an `aria-label` alongside the visual hint, because a tooltip is
  not an accessible name.
- **Dialogs** — exit animations on `[data-state=closed]` for both overlay and content (the leave
  is deliberately faster than the enter); entry now includes a 6px blur-out; head and foot float
  over the scrolling body with `backdrop-filter` so rows pass *under* them and more-content is
  always legible; accent hairlines that fade at both ends; body children stagger in behind the
  frame. **Below 768px the dialog becomes a bottom sheet** that slides up from the floor,
  rounded only at the top, respecting `env(safe-area-inset-bottom)`.
- **Toasts** — icon in a tinted well, a countdown bar driven by `--toast-ms` so CSS and JS can
  never disagree, pause-on-hover for both timer and bar, a real exit animation, and a
  `role="region"` landmark.
- **Switch** — the dead `border:0` removed; track width derived from the knob via CSS variables
  so the two cannot drift; the knob travels on a spring and stretches slightly mid-throw.
- **Form controls** — hover step before focus; `aria-invalid` and `.field-invalid` styling;
  disabled state; a custom select chevron; `:-webkit-autofill` neutralised so Chrome stops
  painting fields system-blue in both palettes; real checkbox with an animated tick; `kbd`
  styled as a keycap.
- **Surfaces** — `.card`/`.panel` on elevation tokens with `--highlight-inset`; opt-in
  `.card-interactive` (lifts and takes an accent rim) and `.card-raised`; `.divider-fade`.
- **Avatars** — tonal gradient with a ring that matches the surface it sits on, so stacks
  separate; `sm`/`lg`/`xl` sizes; `.online` presence ring.
- **Badges** — border derived from `currentColor`, so a tone modifier only sets colour and
  background and the hairline follows automatically; `badge-outline`, `badge-lg`, and a
  breathing `.status-dot.live` for genuinely live state versus a static category dot.

### 4.4 Motion

- **One global `prefers-reduced-motion` block** replacing the seven partial ones. Collapses all
  animation and transition to 1ms *and* forces anything whose entrance ends at `opacity:0` back
  to visible, so nothing is stranded invisible.
- **`.stagger`** — delays each child by 55ms through a CSS counter (`--i`), covering 11+
  children. Fixes `.rise-stagger`'s six-child cliff, where the seventh child arrived first.
- **`.reveal-scroll`** — scroll-driven reveal via `animation-timeline: view()`, gated behind
  `@supports`. Runs on the compositor thread: no IntersectionObserver, no JS, no layout thrash.
  Inert where unsupported.
- **Theme cross-fade** — `.theme-transitioning` on the root transitions *colour properties only*
  (never geometry) for 320ms, applied by `ThemeToggle` and skipped for reduced-motion users.
  Theme switching now reads as a dimmer rather than a swap.

### 4.5 Shell

- **Sidebar** — faint vertical wash, right edge that fades at both ends.
- **Nav links** — an accent rail that grows from the centre on the active item (so selecting a
  section reads as motion toward it), a gradient wash, an icon that brightens and scales a beat
  before the label, and a count pill that tints when active.
- **Topbar** — real glass (`blur(18px) saturate(1.7)`), and elevation that appears **only once
  scrolled**, driven by `data-scrolled` written straight to the DOM from a `requestAnimationFrame`-
  throttled passive listener. It deliberately does *not* go through state: a scroll handler that
  re-renders the whole shell per frame is how an app starts to feel sticky.
- **Command trigger** — now looks pressable, with hover ring, ellipsis on overflow, and an
  active scale.

### 4.6 Performance

| | Before | After |
|---|---|---|
| Intro video fetched on a returning visit | 1.9 MB (dark) / 4.6 MB (light) | **0 bytes** |
| `<video>` in SSR HTML | present, `preload="auto"` | **absent** |
| Curtain flash on a returning visit | 1 frame of black | **none** |
| Hero image bytes fetched | 254 KB (both variants) | **121 KB** |
| Hero `width`/`height` (CLS) | missing | **1024×1024 intrinsic** |
| Canvas blurred fills per frame | ~84 (`shadowBlur`) | **0** (pre-rendered sprite blits) |
| Halo loop off-screen / tab hidden | ran forever | **stopped** |
| Halo colour after theme switch | stale (gold over blue) | **correct** |
| Tailwind sources scanned | 168 (44 non-source) | **122 (all source)** |

The halo now pre-renders one radial-gradient sprite and blits it with `drawImage`, which is
effectively free next to a per-draw blur pass, and looks the same. Timing is driven by a real
delta clamped to 50ms, so the motion holds its speed on a 120Hz display instead of running twice
as fast, and returning from a background tab doesn't teleport every particle.

### 4.7 Bugs fixed

| Bug | Location | Effect |
|---|---|---|
| `:focus-visible` set `border-radius:4px` | `globals.css` | Focused cards visibly snapped to 4px corners |
| `.chip` declared twice, second wins | `globals.css:21` / `:1074` | Inert metadata chips depressed on click |
| `.toggle` declared `border` twice | `globals.css:553` | Dead code; knob travel unrelated to track width |
| `--danger` never defined | `globals.css` | Equipment "out of rotation" used an off-palette red |
| Halo captured `rgb` with `[]` deps | `landing-hero.tsx:53` | Gold particles over the blue light theme |
| `.rise-stagger` stopped at 6 children | `globals.css` | 7th+ child animated **before** its siblings — now derived from a counter, clamped at 13 |
| `min-height` vs `height` collision | 6 `.rw-*` rules | Base 36px silently defeated dense 29–32px controls |

> **Toolchain gotcha found while doing this.** A `transition` whose duration is a bare
> `var()` inside a `::-webkit-scrollbar-thumb` rule makes Turbopack fail the whole CSS
> bundle with `Parsing CSS source code failed` — and every route then 500s. It compiles
> cleanly through `@tailwindcss/postcss` standalone, so a PostCSS-based check will not catch
> it. The offending declaration was also useless: WebKit only honours `transition` on
> scrollbar pseudo-elements inconsistently. Worth knowing before the token migration in
> recommendation 6 reaches the scrollbar rules.

### 4.8 New: `/design-system`

A living reference page linked from the sidebar, rendering **only** the components the product
ships — no mock-ups. Eight sections: Foundations (palette, radius, elevation, type and motion
scales rendered from the tokens themselves), Buttons (every intent × size × state), Badges &
data, Forms, Tabs (the new primitive beside the restyled legacy strips), Overlays (all three
dialog sizes), Feedback (toasts, skeletons, progress, callouts, the full empty-art set) and
Motion (stagger, scroll reveal, reduced motion).

Change a token at the top of `globals.css` and this page moves with it, which is the point.

### 4.9 Resulting metrics

| | `main` | Now |
|---|---|---|
| Distinct px radii | 38 | **23** |
| Distinct px font sizes | 35 | **31** |
| Sub-9px font sizes | 28 | **0** |
| Light-theme colours failing AA | 5 of 8 | **0 of 8** |
| Tailwind utilities emitted | 0 | **token namespaces wired** |
| Tailwind sources scanned | 168 | **122** |
| `role="tablist"`/`aria-selected` | 0 | **6** |
| Bespoke button classes | 18 | 18 (+ a system to retire them into) |
| ESLint problems | 59 (38e/21w) | **57 (38e/19w)** |
| `globals.css` gzipped | 40.9 KB | 53.9 KB compiled |

The gzip growth is the token layer, six rebuilt primitives and the reference page. It buys the
removal of duplicated one-off CSS listed in the roadmap below, which should recover most of it.

---

## 5. Recommended next steps

Ordered by (impact ÷ effort). Nothing here is started; all of it is scoped.

### P0 — do next

1. **Virtualise the ticket table.** `ticket-grid.tsx:240` maps every row. At the volumes the
   historic import implies, this is the largest single DOM cost in the product. `@tanstack/react-virtual`
   is ~5 KB and drops it to ~30 nodes. Pair with `content-visibility:auto` (`.cv-auto` is already
   in the token layer) on the long report and analytics sections.
2. **Re-encode the intro video.** 4.6 MB for the light variant is roughly 10× what a 6-second
   1080p clip should cost. `ffmpeg -c:v libx265 -crf 30 -an` (it is muted — the audio track is
   pure waste) plus a VP9/AV1 `<source>` pair should land under 500 KB. No `ffmpeg` in this
   sandbox, so it was not done here. Consider making the curtain opt-in rather than default: a
   full-screen video gate on an internal ops tool is a tax on the people who use it forty times
   a day.
3. **Convert the seven tab strips to `<Tabs>`.** The CSS is already unified, so this is a
   mechanical JSX change that closes the largest remaining ARIA gap. Highest value first:
   `workspace-tabs` (3 screens), `module-tabs` (3 screens), `view-switch` (3 screens).
4. **Give the heatmap matrix cells keyboard access.** `tickets-board.tsx:103` — add `role="button"`,
   `tabIndex={0}` and an Enter/Space handler, or render an actual `<button>`. It is primary
   navigation, not decoration.

### P1 — high value, moderate effort

5. **Split `globals.css`.** 2,715 lines in one file is the root cause of every duplicate-selector
   bug in this report. Proposed: `tokens.css` (§4.1), `base.css` (reset + typography + elements),
   `primitives.css` (buttons, badges, inputs, tabs, dialogs, toasts), then **CSS Modules per
   component** for the screen-specific rules — `.resolution-v2`, `.ticket-detail-shell`,
   `.studio-ops-radar` and so on. Modules would also scope the `ds-*` reference-page styles out
   of the global bundle. Reformat on the way: one declaration per line, so diffs are reviewable.
6. **Migrate to the token scales.** 23 distinct px radii and 31 distinct px font sizes remain in
   the legacy sections. Mechanical, and it is what makes the "designed one screen at a time"
   feel disappear. Start with the highest-frequency values: `border-radius:10px` (34×),
   `font-size:11px` (61×), `font-size:10px` (59×), `font-size:12px` (57×).
7. **Retire the seven one-off button classes.** `.btn-create-snag`, `.btn-quick-resolve`,
   `.btn-dispatch-lead`, `.btn-view-ticket`, `.btn-open-iris-link`, `.btn-primary-action`,
   `.btn-secondary-action` all collapse into `<Button size="xs"|"sm" variant=…>`. Roughly 90
   lines of CSS and seven separate hover behaviours deleted.
8. **Move the 336 inline `style={{}}` objects into classes.** Start with the five worst files
   (`trainer-report` 40, `equipment-panel` 21, `iris-chat` 20, `reports/page` 19,
   `settings/page` 17). Most set `fontSize` or `marginBottom` and belong in a utility class.
9. **Adopt `next/image`.** Eight raw `<img>` remain. The trainer photos especially: 4.8 MB of
   unoptimised JPEG at `public/Trainer Images/` — rename the directory to `trainer-images`
   (the space forces URL-encoding everywhere) and let `next/image` emit AVIF `srcset`.
10. **Co-ordinate the polling.** Twelve `setInterval` calls, two at 1 second. Replace the
    per-second clock ticks with a single shared ticker context so one interval drives every
    countdown, and align the 12s/30s/60s polls to a common phase. Then memoise the leaves so a
    clock tick doesn't re-render a table.

### P2 — refinement

11. **Gate the expensive ambience.** `.chat-ambient-glow` animates two `blur(40–50px)` radial
    gradients continuously. Add `content-visibility` or an IntersectionObserver-driven class so
    they only run while the panel is actually visible, and drop the blur radius — a 20px blur at
    420px reads identically to a 40px blur and costs a quarter of the rasterisation.
12. **Delete the duplicated landing palette.** `.intro` and `.lb` re-declare the entire dark
    palette as `--l-*`. Alias them to the real tokens so brand colour changes in one place.
13. **Drop to two font families.** Outfit and Space Grotesk are near-interchangeable at UI sizes.
    Keeping Outfit (variable) for display and body, and JetBrains Mono for data, removes a family
    and its weights from every page load.
14. **Self-host the fonts** with `next/font/local` to remove the build-time dependency on
    `fonts.googleapis.com`, which currently fails a build outright when egress is restricted.
15. **Replace the 24 `!important` declarations** with specificity that doesn't need them — most
    are the SLA countdown's `font-size:22px!important`, which exists because a size modifier lost
    a fight with a base rule.
16. **Add a visual regression gate.** Playwright is already a devDependency and 16 routes render
    without a database. Snapshotting `/design-system` in both themes would catch the next
    contrast or token regression automatically — the light-mode failures in §C1 shipped precisely
    because the team works in dark.

---

## 6. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint .` | **57 problems** (baseline `main`: 59) — no new errors, 2 warnings removed |
| `eslint src/app/design-system/page.tsx` | **0 problems** |
| All 16 routes HTTP 200 | ✓ |
| Error boundary triggered on any route | **0** |
| Turbopack CSS parse (dev, all routes) | ✓ |
| `globals.css` compiles through `@tailwindcss/postcss` | ✓ 366,787 bytes, all primitives present |
| Light-theme AA (8 semantic colours × 4 surfaces) | **32/32 pass**, worst 5.02:1 |
| Sub-9px type remaining | **0** |

*Note:* `next build` cannot complete in this sandbox — `next/font/google` requires egress to
`fonts.googleapis.com`, which is blocked here. This is an environment limitation, and finding G8
above; the dev server compiles and serves every route correctly.

---

## 7. Files changed

```
src/app/globals.css              token layer, scales, primitives, motion, shell, contrast, legibility
src/components/ui.tsx            Button, Tabs, TabPanel, Tip; toast lifecycle; theme cross-fade
src/components/shell.tsx         scroll-aware topbar, aria-current, design-system nav entry
src/components/landing-hero.tsx  halo rewrite (sprite blits, visibility gating, theme fix), hero image
src/components/intro-overlay.tsx useSyncExternalStore gating — video out of SSR entirely
src/app/design-system/page.tsx   new — living reference for the token layer and primitives
```

Open `/design-system` in the running app to review all of it in one place, in both themes.
