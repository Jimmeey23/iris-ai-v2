"use client";
import {useEffect} from "react";
import {supabaseBrowser} from "@/lib/supabase/client";
import {REALTIME_EVENT, REALTIME_TOPIC, type Signal} from "@/lib/realtime";

/**
 * Turns a realtime broadcast from another person's browser into the window events this app
 * already refreshes on.
 *
 * Mounted once, in the shell. Every surface that wants to react keeps listening for
 * `iris:tickets-updated` exactly as it did when the only source was the same tab — so nothing
 * downstream had to change, and a deployment with realtime switched off behaves as before.
 *
 * The broadcast carries no ticket data (see lib/realtime): this re-fetches through the API,
 * which applies the caller's own access scope.
 */
const EVENT_FOR: Record<Signal["kind"], string> = {
  tickets: "iris:tickets-updated",
  notifications: "iris:notifications-updated",
  equipment: "iris:equipment-updated",
};

export function LiveSignal() {
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | undefined;
    try {
      channel = supabaseBrowser().channel(REALTIME_TOPIC);
      channel
        .on("broadcast", {event: REALTIME_EVENT}, (message: {payload?: Signal}) => {
          const kind = message.payload?.kind;
          const name = kind && EVENT_FOR[kind];
          // A signal that arrives while the tab is hidden is dropped: the surfaces all
          // re-load on `visibilitychange`, so waking a background tab to re-fetch would be
          // paying for a render nobody is looking at.
          if (name && !document.hidden) window.dispatchEvent(new Event(name));
        })
        .subscribe((status: string) => {
          // A workspace whose Supabase project has Realtime switched off answers every
          // attempt with an error, and the client would otherwise reconnect with backoff for
          // the whole session. One refusal is enough to know this deployment polls instead.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void channel?.unsubscribe();
        });
    } catch {
      // Supabase is not configured in this environment. Polling still covers refresh.
      return;
    }
    return () => {
      void channel?.unsubscribe();
    };
  }, []);
  return null;
}
