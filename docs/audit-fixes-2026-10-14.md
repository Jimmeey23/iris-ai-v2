# Audit priority fixes — 14 October 2026

Implemented the first recommended batch from the attached audit:

- Self-service signup sends a Supabase email confirmation instead of creating a confirmed account and immediately signing in. No application profile is inserted until verified sign-in.
- Self-service and Google profile creation require an active staff-directory email. Name, staff ID, studio, department, and reporting manager come from that directory. Existing administrator invitations remain supported.
- Provider responses that return an immediate signup session are rejected, signed out, and the new provider account is removed. Supabase must have **Confirm email** enabled. Allow the deployed `/auth/callback` URL in Supabase's redirect URL list; email delivery and confirmation must be tested in the target environment.
- Overview SLA compliance uses the shared tracked-ticket denominator, including late resolutions and excluding record-only/untracked tickets. Zero volume bars have zero height.
- Ticket titles and sort headers use native buttons with keyboard focus styles. Clicking a title activates it once while row mouse navigation remains available.
- Momence lookup failures have an explicit error and Retry button. Superseded requests cannot overwrite newer results.
- Login uses one silent H.264 1280×720 fast-start clip (1.3 MB). Mobile and reduced-motion users see the poster with no MP4 request. Seven unused MP4 files removed.
- Overview's low-contrast light-theme label token darkened.

Validation: typecheck, lint, 162 unit tests, 37 access checks, 50 dashboard checks, and diff whitespace checks pass. Browser checks confirmed desktop/mobile login rendering, no mobile or reduced-motion MP4 requests, and signup has no editable scope selectors. Signup UI check mocked the auth identity response; no provider account or email was created. Security regression checks enforce code wiring, not live Supabase behavior. Authenticated grid interactions and email confirmation delivery remain unverified.

The broader roadmap remains: CSS module migration, LLM classification and prefill, IRIS telemetry, semantic duplicates, historical resolution suggestions, predictive alerts/digests, reply-by-email and messaging integrations, command palette/bulk actions/undo, member-impact tracking, PWA/offline drafts, and full filing-to-resolution UI tests. No deployment was performed.


## Component and image optimization

- Settings is a lazy route entry with a state controller and view. Its 12 panels load by selected tab (personal/workspace appearance are separate panels).
- Ticket composer and detail load only when opened. Their state/actions and views are separate modules. Detail tabs, sidebar, and edit/delete/link dialogs are separate chunks.
- IRIS chat loads on demand; history, draft review, edit, and confirmation dialogs load only when opened.
- The shared draft document is independent of the composer so intake/chat previews do not load the composer implementation.
- All split files are below 1,000 lines; the largest is the 974-line composer view. Original state/action statements were compared against the extracted controllers and preserved.
- Five floorplans: 12,322,282 bytes to 940,406 bytes. Four associate photos: 4,268,602 bytes to 319,586 bytes. Combined reduction: 92.4 percent. Original image dimensions and hotspot coordinates are preserved. Source references now use WebP; unused PNG/JPG originals were removed.
- Floorplan regeneration uploads the matching image MIME type, including WebP references, so the format change does not break editing.

Validation: production build, typecheck, lint, 171 unit tests, and production chunk checks pass. Chunk checks confirm the heavy feature controllers are absent from initial dashboard/settings/templates scripts. All 12 Settings panels also rendered with fixture state. A floorplan crop was visually inspected for readable room labels. Authenticated browser interactions were not completed; the available Chrome window changed during attempts to inspect the existing IRIS session. No actual Vercel CPU/spend measurements or deployment were performed.

To repeat the bundle check without sharing the running dev server's output directory:

```sh
NEXT_DIST_DIR=.next-audit-build npm run build
NEXT_DIST_DIR=.next-audit-build npm run check:client-chunks
```
