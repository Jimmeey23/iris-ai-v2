"use client";
import {createBrowserClient} from "@supabase/ssr";
import {supabasePublishableKey, supabaseUrl} from "./env";

/** Browser client, created once per tab. The server holds the session in cookies, so this is
 *  used only for the things that genuinely need a socket — currently the realtime signal in
 *  lib/realtime.ts. Authentication and every data read still go through the route handlers. */
let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  if (!client) client = createBrowserClient(supabaseUrl(), supabasePublishableKey());
  return client;
}
