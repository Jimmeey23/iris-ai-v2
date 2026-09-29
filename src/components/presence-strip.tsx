"use client";
import {useEffect, useState} from 'react';
import {api, Avatar} from './ui';

type Present = {userId: number; name: string; role: string; path: string; label: string | null; seenAt: string};

/**
 * Who else is in the workspace right now, and what they have open.
 *
 * Polled on the same cadence as the heartbeat in the shell, one beat behind at worst. It
 * renders nothing at all when you are the only person here — an empty "nobody else is
 * online" panel is a worse answer than no panel.
 */
export function PresenceStrip({selfId}: {selfId?: number}) {
  const [online, setOnline] = useState<Present[]>([]);
  useEffect(() => {
    const load = () => { void api<{online: Present[]}>('/api/presence').then(d => setOnline(d.online)).catch(() => {}); };
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const others = online.filter(p => p.userId !== selfId);
  if (!others.length) return null;
  return (
    <section className="presence-strip" aria-label="Who is online">
      <header>
        <span className="live-label"><i /></span>
        <h3>{others.length} {others.length === 1 ? 'colleague' : 'colleagues'} online</h3>
      </header>
      <ul>
        {others.slice(0, 10).map(p => (
          <li key={p.userId}>
            <Avatar name={p.name} tone="purple" />
            <div>
              <strong>{p.name}</strong>
              <small>{p.label || prettyPath(p.path)}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A route turned into the name of the page, for a heartbeat that predates the label. */
function prettyPath(path: string) {
  const first = path.split('/').filter(Boolean)[0];
  if (!first) return 'Overview';
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
}
