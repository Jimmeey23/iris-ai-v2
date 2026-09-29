"use client";
import {Avatar, useDirectory} from './ui';

/**
 * Who else is in the workspace right now, and what they have open.
 *
 * Reads the shared directory rather than polling for itself, so the strip, every avatar's
 * live dot and the heartbeat in the shell all agree — and there is one request behind all
 * of them rather than one per component. It renders nothing when you are the only person
 * here: an empty "nobody else is online" panel is a worse answer than no panel.
 */
export function PresenceStrip({selfId}: {selfId?: number}) {
  const {online} = useDirectory();
  const others = online.filter(p => p.userId !== selfId);
  if (!others.length) return null;
  return (
    <section className="presence-strip" aria-label="Who is online">
      <header>
        <span className="live-label"><i /></span>
        <h3>{others.length} {others.length === 1 ? 'colleague' : 'colleagues'} online</h3>
      </header>
      <ul>
        {others.slice(0, 12).map(p => (
          <li key={p.userId ?? p.name}>
            <Avatar name={p.name} tone="purple" showPresence />
            <div>
              <strong>{p.name}</strong>
              <small>{p.viewing || 'In the workspace'}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
