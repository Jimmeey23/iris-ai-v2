/**
 * Cross-browser "something changed" signal.
 *
 * Inside one tab the board already refreshes on a `iris:tickets-updated` window event. For
 * anybody else's tab the only mechanism was the poll interval, so a studio with four people
 * on the floor ran four pollers against `/api/tickets` for the whole shift and still showed a
 * teammate's new ticket up to a poll late.
 *
 * This broadcasts over Supabase Realtime, which the project already pays for, and the client
 * turns the broadcast into the same window event. Two deliberate limits:
 *
 *  - **No row data on the wire.** The payload is a kind and a timestamp, nothing else. The
 *    channel is public (any holder of the publishable key may listen), and ticket rows carry
 *    member names and phone numbers. Clients re-fetch through `/api/tickets`, which applies
 *    `ticketScope` and the member-masking setting as it always has — so realtime can never
 *    widen what somebody is allowed to see. Postgres change-data-capture on `tickets` would
 *    have put the row itself on the wire and made the access rules RLS's problem; that is a
 *    much bigger change than this is worth.
 *  - **Advisory only.** Delivery is not guaranteed and is never awaited for correctness. The
 *    client keeps its (slow) poll as the floor, so a dropped socket costs freshness and
 *    nothing else.
 */
import {supabaseServiceRoleKey, supabaseUrl} from "@/lib/supabase/env";

/** What changed, so a listener can ignore signals for a surface it is not showing. */
export type SignalKind = "tickets" | "notifications" | "equipment";

export const REALTIME_TOPIC = "iris-workspace";
export const REALTIME_EVENT = "changed";

export type Signal = {kind: SignalKind; at: string};

/** Set when the project is configured for realtime. Read once per process: an unconfigured
 *  deployment must not pay a failed fetch per write. */
function endpoint(): {url: string; key: string} | null {
  try {
    return {url: `${supabaseUrl()}/realtime/v1/api/broadcast`, key: supabaseServiceRoleKey()};
  } catch {
    return null;
  }
}

let configured: {url: string; key: string} | null | undefined;

/**
 * Tells every other open tab that `kind` moved. Never throws and never blocks: call it from
 * `after()` so it cannot add latency to the write that caused it.
 */
export async function signalChanged(kind: SignalKind): Promise<void> {
  if (configured === undefined) configured = endpoint();
  if (!configured) return;
  const signal: Signal = {kind, at: new Date().toISOString()};
  try {
    const response = await fetch(configured.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: configured.key,
        Authorization: `Bearer ${configured.key}`,
      },
      body: JSON.stringify({
        messages: [{topic: REALTIME_TOPIC, event: REALTIME_EVENT, payload: signal}],
      }),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    // A 4xx here means the project's realtime settings changed under us. Worth one log line —
    // but not worth reporting as an error: the app is still correct, just less fresh.
    if (!response.ok)
      console.log(
        JSON.stringify({
          level: "warn",
          source: "realtime.broadcast",
          status: response.status,
          kind,
        }),
      );
  } catch {
    // Timed out or offline. The client's poll covers it.
  }
}
