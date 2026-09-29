"use client";
import {useEffect, useState} from 'react';
import {api} from './ui';
import {
  Activity,
  ShieldAlert,
  Wrench,
  Database,
  Sparkles,
} from 'lucide-react';

type Item = {label: string; value: string; tone?: string; badge?: string};

const TONE_COLOUR: Record<string, string> = {
  green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)',
  blue: 'var(--blue)', accent: 'var(--accent)',
};
const TONE_ICON: Record<string, typeof Activity> = {
  green: Activity, amber: Wrench, red: ShieldAlert, blue: Database, accent: Sparkles,
};

/**
 * The live ticker.
 *
 * It used to recite fixed copy — room lists and SLA targets that read the same on a quiet
 * Tuesday as during an outage — so people stopped seeing it. Each page now asks for the
 * handful of facts that bear on the work done there, and nothing is rendered until they
 * arrive: an empty strip is quieter than a wrong one.
 */
export function IrisMarquee({page = 'overview'}: {page?: string}) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void api<{items: Item[]}>(`/api/marquee?page=${encodeURIComponent(page)}`)
        .then(d => { if (!cancelled) setItems(d.items || []); })
        .catch(() => {});
    };
    load();
    // Slow on purpose. This is ambient information; refreshing it every few seconds would
    // make the numbers jitter under the reader's eye for no gain.
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [page]);

  if (!items.length) return null;

  return (
    <div className="iris-fullwidth-marquee" aria-label="Operations live marquee">
      <div className="marquee-track">
        {/* Track 1 */}
        {items.map((item, idx) => {
          const Icon = TONE_ICON[item.tone || 'blue'] || Database;
          return (
            <div key={`t1-${idx}`} className="mq-unit">
              <span className="mq-unit-sep">✦</span>
              <div className="mq-unit-content">
                <span className="mq-unit-icon" style={{ color: TONE_COLOUR[item.tone || 'blue'] || 'var(--blue)' }}>
                  <Icon size={12.5} strokeWidth={2.2} />
                </span>
                {item.badge && (
                  <span className={`mq-unit-badge ${item.tone === 'red' ? 'red' : item.tone === 'amber' ? 'amber' : 'green'}`}>
                    <span className="mq-unit-dot" />
                    {item.badge}
                  </span>
                )}
                <span className="mq-unit-label">{item.label}:</span>
                <span className="mq-unit-val">{item.value}</span>
              </div>
            </div>
          );
        })}

        {/* Track 2 (Exact Duplicate for seamless infinite loop) */}
        {items.map((item, idx) => {
          const Icon = TONE_ICON[item.tone || 'blue'] || Database;
          return (
            <div key={`t2-${idx}`} className="mq-unit" aria-hidden="true">
              <span className="mq-unit-sep">✦</span>
              <div className="mq-unit-content">
                <span className="mq-unit-icon" style={{ color: TONE_COLOUR[item.tone || 'blue'] || 'var(--blue)' }}>
                  <Icon size={12.5} strokeWidth={2.2} />
                </span>
                {item.badge && (
                  <span className={`mq-unit-badge ${item.tone === 'red' ? 'red' : item.tone === 'amber' ? 'amber' : 'green'}`}>
                    <span className="mq-unit-dot" />
                    {item.badge}
                  </span>
                )}
                <span className="mq-unit-label">{item.label}:</span>
                <span className="mq-unit-val">{item.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
