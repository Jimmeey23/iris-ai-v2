import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {db} from '../../src/db/index.ts';
import {appUsers} from '../../src/db/schema.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to run the checks: the suites sign in through Supabase Auth.');

const service = createClient(url, serviceKey, {auth: {autoRefreshToken: false, persistSession: false}});

/** Creates a confirmed Supabase user plus its workspace profile, and returns the
 *  credentials the check suite signs in with. Confirmation is forced so the run
 *  does not depend on an inbox. */
export async function createTestUser({name, email, role = 'agent', staffId = null}) {
  const password = randomBytes(24).toString('base64url');
  const {data, error} = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {full_name: name},
  });
  if (error) throw new Error(`Could not create the Supabase test user ${email}: ${error.message}`);
  const [user] = await db
    .insert(appUsers)
    .values({name, email, role, staffId, supabaseUserId: data.user.id})
    .returning();
  return {id: user.id, supabaseUserId: data.user.id, email, password};
}

/** Removes the Supabase accounts created by a run. The app_users rows are deleted
 *  by the suite's own cleanup, which also clears their dependent records. */
export async function deleteTestAuthUsers(supabaseUserIds) {
  for (const id of supabaseUserIds)
    await service.auth.admin.deleteUser(id).catch(() => {});
}
