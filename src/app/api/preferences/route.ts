import {z} from 'zod';
import {sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings} from '@/db/schema';
import {browserKey, errorResponse, sameOrigin} from '@/lib/auth';
import {getSetting, getConfig} from '@/lib/config';
import {dashboardPrefsSchema, dashboardPatchSchema, savedViewSchema, DEFAULT_DASHBOARD} from '@/lib/dashboard-contract';

export const dynamic = 'force-dynamic';

/**
 * Per-person preferences, stored in the database.
 *
 * Keyed by workspace identity when signed in and by a long-lived browser cookie otherwise,
 * so a view set up on the studio iPad is the same view on a laptop. Nothing here is kept
 * only in localStorage — the one exception is the theme, which is additionally cached
 * locally so the first paint does not flash the wrong colours before this call returns.
 */

const patchSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  view: z.enum(['list', 'board', 'cards', 'matrix', 'feed']).optional(),
  moduleViews: z.record(z.string().max(60), z.string().max(60)).optional(),
  /** Superseded by `views`; still accepted so older clients keep working. */
  savedFilters: z.array(z.record(z.string(), z.string())).max(30).optional(),
  views: z.array(savedViewSchema).max(40).optional(),
  /** Partial: the client sends only what changed, and it is merged over what is stored. */
  dashboard: dashboardPatchSchema.optional(),
});

export async function GET() {
  try {
    const key = await browserKey();
    const cfg = await getConfig();
    const stored = ((await getSetting('preferences:' + key))?.value ?? {}) as Record<string, unknown>;
    // The workspace defaults are the starting point; anything this person has chosen wins.
    const dashboard = dashboardPrefsSchema.parse({
      ...DEFAULT_DASHBOARD,
      groupBy: cfg.defaultGroupBy,
      density: cfg.defaultDensity,
      pageSize: cfg.defaultPageSize,
      columns: cfg.defaultColumns?.length ? cfg.defaultColumns : DEFAULT_DASHBOARD.columns,
      ...(typeof stored.dashboard === 'object' && stored.dashboard ? stored.dashboard : {}),
    });
    return Response.json({
      theme: cfg.defaultTheme,
      view: cfg.defaultView,
      ...stored,
      dashboard,
      views: Array.isArray(stored.views) ? stored.views : [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const body = patchSchema.parse(await req.json());
    const key = 'preferences:' + (await browserKey());

    // `dashboard` is merged one level deep. A jsonb `||` merge replaces the whole nested
    // object, so a client saving just `{dashboard:{groupBy}}` would wipe its own columns.
    const {dashboard, ...top} = body;
    const merged: Record<string, unknown> = {...top};
    if (dashboard) {
      const existing = ((await getSetting(key))?.value ?? {}) as Record<string, unknown>;
      const current = (typeof existing.dashboard === 'object' && existing.dashboard ? existing.dashboard : {}) as Record<string, unknown>;
      merged.dashboard = {...current, ...dashboard, ...(dashboard.filters ? {filters: {...(current.filters as object ?? {}), ...dashboard.filters}} : {})};
    }
    if (!Object.keys(merged).length) return Response.json({ok: true});

    await db
      .insert(appSettings)
      .values({key, value: merged})
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {value: sql`${appSettings.value} || ${JSON.stringify(merged)}::jsonb`, updatedAt: new Date()},
      });
    return Response.json({ok: true});
  } catch (e) {
    return errorResponse(e);
  }
}
