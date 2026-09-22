/** Central resolution of the Supabase project credentials.
 *
 *  Anonymous/publishable key: Supabase renamed `anon` to `publishable` in 2025;
 *  both spellings are accepted so an existing deployment does not break on the
 *  rename. The service-role key is read separately and must never be exposed to
 *  the browser, so it is deliberately not NEXT_PUBLIC_.
 */
export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required. Copy it from Supabase Dashboard > Project Settings > API.",
    );
  return url;
}

export function supabasePublishableKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required. Copy the publishable (anon) key from Supabase Dashboard > Project Settings > API.",
    );
  return key;
}

export function supabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for administrator account management. Copy the service_role key from Supabase Dashboard > Project Settings > API and keep it server-side only.",
    );
  return key;
}
