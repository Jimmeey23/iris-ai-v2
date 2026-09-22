import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Request-scoped Supabase client. Reads and writes the auth cookies on the
 *  current request, so a refreshed access token is persisted for the response. */
export async function createSupabaseServerClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The middleware refreshes
          // the session instead, so this is safe to ignore there.
        }
      },
    },
  });
}
