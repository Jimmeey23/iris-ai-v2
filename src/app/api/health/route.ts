import {db} from '@/db';
import {sql} from 'drizzle-orm';
import {optionalUser} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Liveness, database reachability, and — for a signed-in administrator — whether the
 * background work is actually running.
 *
 * The public answer stays what it was: `ok`, `db`, commit and environment, no writes and
 * nothing secret, so an uptime monitor can hit it freely. On the Vercel Hobby plan there is no
 * cron history worth reading and the sweeps ride on ordinary requests (lib/sweeps), so an
 * administrator asking "did the outbox drain, did the digest go out" has nowhere else to look.
 * That detail is added for an administrator only: a backlog count and the schema version are
 * reconnaissance for anybody else.
 */
const n = (value: unknown) => Number(value ?? 0);

export async function GET() {
  const meta = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
  };
  try {
    await db.execute(sql`select 1`);
    const user = await optionalUser().catch(() => null);
    if (user?.role !== 'admin')
      return Response.json({ok: true, db: 'up', ...meta}, {headers: {'Cache-Control': 'no-store'}});

    const [outbox, sweeps, migrations] = await Promise.all([
      db.execute(sql`
        select
          count(*) filter (where status = 'pending')::int as pending,
          count(*) filter (where status = 'failed')::int  as failed,
          min(created_at) filter (where status = 'pending') as oldest_pending
        from delivery_logs
      `),
      // The sweep claims and the digest's day marker, in one read: both are app_settings rows.
      db.execute(sql`
        select key, value ->> 'at' as at, value ->> 'day' as day
        from app_settings
        where key like 'sweep:%' or key = 'digest:lastSentDay'
      `),
      // Compared against the number of files in drizzle/: a deployment running ahead of its
      // schema shows up here, and its failure mode is a column that does not exist yet.
      db.execute(sql`select count(*)::int as applied from drizzle.__drizzle_migrations`),
    ]);

    const markers = sweeps.rows as {key: string; at: string | null; day: string | null}[];
    const lastSweeps = Object.fromEntries(
      markers.filter(row => row.key.startsWith('sweep:')).map(row => [row.key.slice('sweep:'.length), row.at]),
    );
    const [backlog] = outbox.rows as {pending: number; failed: number; oldest_pending: string | null}[];

    return Response.json(
      {
        ok: true,
        db: 'up',
        ...meta,
        migrationsApplied: n((migrations.rows[0] as {applied?: number} | undefined)?.applied),
        outbox: {
          pending: n(backlog?.pending),
          failed: n(backlog?.failed),
          oldestPending: backlog?.oldest_pending ?? null,
        },
        lastSweeps,
        digestLastSentDay: markers.find(row => row.key === 'digest:lastSentDay')?.day ?? null,
      },
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (error) {
    console.error('[health] database check failed:', error instanceof Error ? error.message : error);
    return Response.json({ok: false, db: 'down', ...meta}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}
