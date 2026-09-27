# Radar tab design QA

## Scope

- Reference: the two user-supplied luxury isometric studio floor plans.
- Implementation: `/radar`, primarily `src/components/studio-ops-radar.tsx` and the final Radar overrides in `src/app/globals.css`.
- Assets checked: Kwality, Supreme, Kenkere House, Courtside, and Copper Chimney floor plans in `public/radar/`.

## Source and asset review

- Passed: all five studios have a dedicated raster floor plan.
- Passed: each live room returned by the Radar data model has a corresponding interactive hotspot.
- Passed: room selection, room status, incident counts, SLA copy, and the existing room inspector remain data-driven.
- Passed: hotspots are real buttons with room-specific accessible labels, selected state, and visible keyboard focus.
- Passed: the layout falls back to a horizontally scrollable plan on narrow screens rather than compressing room targets below a usable size.
- Passed: all new plan images have verified dimensions and are rendered through `next/image`.
- Passed: `npm run typecheck`, targeted ESLint, `git diff --check`, and a Next.js production build.

## Visual comparison

- The plan surfaces use the reference direction: photorealistic bird's-eye architecture, warm neutral materials, dark wall framing, restrained status overlays, and a flatter surrounding UI.
- The interaction layer is intentionally translucent so it does not hide the architectural render.
- The selected room receives a clear accent outline while warning and critical rooms receive amber/red operational tinting.

## Browser verification

- Blocked: no in-app browser connector is available in this session, and the Product Design browser-choice rules do not permit silently substituting a different browser runner. A rendered desktop/mobile screenshot comparison was therefore not performed.

final result: blocked
