"use client";
import { useEffect, useState } from "react";
import { api } from "./ui";
import { onVisibleInterval } from "@/lib/visible-interval";
import { Activity, ShieldAlert, Wrench, Database, Sparkles } from "lucide-react";

type Item = { label: string; value: string; tone?: string; badge?: string };

const TONE_COLOUR: Record<string, string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  blue: "var(--blue)",
  accent: "var(--accent)",
};
const TONE_ICON: Record<string, typeof Activity> = {
  green: Activity,
  amber: Wrench,
  red: ShieldAlert,
  blue: Database,
  accent: Sparkles,
};

/**
 * The live status strip.
 *
 * This used to be an infinitely scrolling marquee — 80-second loop, duplicated
 * track, ✦ separators — pinned above every page. It drew the eye continuously
 * while making the numbers hard to read, and it was the most intrusive motion
 * in the product, on the screen people sit in front of all day.
 *
 * It is now a plain strip of facts that stays still. Each page asks for the
 * handful of figures that bear on the work done there, and nothing renders
 * until they arrive: an empty strip is quieter than a wrong one.
 */
export function IrisMarquee({ page = "overview" }: { page?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api<{ items: Item[] }>(`/api/marquee?page=${encodeURIComponent(page)}`)
        .then((d) => {
          if (!cancelled) setItems(d.items || []);
        })
        .catch(() => {});
    };
    // Slow on purpose. This is ambient information; refreshing it every few
    // seconds would make the numbers jitter under the reader's eye for no gain.
    const stop = onVisibleInterval(load, 60000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [page]);

  if (!items.length) return null;

  return (
    <div className="iris-status-strip" aria-label="Operations status">
      {items.map((item, idx) => {
        const Icon = TONE_ICON[item.tone || "blue"] || Database;
        return (
          <div key={idx} className="status-cell">
            <span
              className="status-cell-icon"
              style={{ color: TONE_COLOUR[item.tone || "blue"] || "var(--blue)" }}
              aria-hidden="true"
            >
              <Icon size={13} strokeWidth={2} />
            </span>
            <span className="status-cell-label">{item.label}</span>
            <span className="status-cell-value">{item.value}</span>
            {item.badge && (
              <span className={`status-cell-badge ${item.tone === "red" ? "red" : item.tone === "amber" ? "amber" : "green"}`}>
                <span className="status-cell-dot" aria-hidden="true" />
                {item.badge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
