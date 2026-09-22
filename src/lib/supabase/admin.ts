import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "./env";

/** Service-role client for administrator-only user management. It bypasses RLS
 *  and can mint accounts, so it must only ever be constructed inside a route
 *  that has already established the caller is an administrator. */
export function createSupabaseAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
