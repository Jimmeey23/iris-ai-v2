"use client";
import {useState, useSyncExternalStore} from 'react';
import {LayoutList, MessageSquareText} from 'lucide-react';
import {Shell} from '../shell';
import {IrisMarquee} from '../iris-marquee';
import {IrisChat} from '../iris-chat';
import {IntakeFlow} from './intake-flow';

const MODE_KEY = 'iris-intake-mode';
type Mode = 'form' | 'chat';
// The remembered mode lives in localStorage; reading it through an external store keeps the
// server render ('form') and the first client render identical, then switches without a flash.
const listeners = new Set<() => void>();
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'chat' ? 'chat' : 'form'; } catch { return 'form'; } };
const subscribe = (cb: () => void) => { listeners.add(cb); window.addEventListener('storage', cb); return () => { listeners.delete(cb); window.removeEventListener('storage', cb); }; };
const writeMode = (m: Mode) => { try { localStorage.setItem(MODE_KEY, m); } catch {} listeners.forEach(cb => cb()); };

/**
 * /iris — the form-based generator is the intake. The conversational flow stays reachable
 * behind a clearly labelled "Legacy chat" switch (its approve/chat routes are untouched), and
 * the choice is remembered per browser.
 */
export function IrisIntakePage({presetCategory, presetSubcategory, presetMode, presetDesk}: {presetCategory?: string; presetSubcategory?: string; presetMode?: 'form' | 'chat'; presetDesk?: boolean}) {
  const remembered = useSyncExternalStore(subscribe, readMode, () => 'form' as Mode);
  // A ?mode= in the URL wins for this visit only; the remembered choice is what the desk set.
  const [override, setOverride] = useState<Mode | undefined>(presetMode);
  const mode = override || remembered;
  const choose = (m: Mode) => { setOverride(undefined); writeMode(m); };

  if (mode === 'chat') {
    return (
      <Shell hideHeading hideFooter fullHeight banner={<IrisMarquee />}>
        <div className="intake-legacy-bar" role="status">
          <span className="badge amber"><MessageSquareText size={10} /> Legacy chat intake</span>
          <span>The conversational flow is kept for reference; new tickets should go through the form.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => choose('form')}><LayoutList size={13} /> Switch to the form</button>
        </div>
        <IrisChat presetCategory={presetCategory} presetSubcategory={presetSubcategory} />
      </Shell>
    );
  }
  return (
    <Shell hideHeading hideFooter banner={<IrisMarquee />}>
      <IntakeFlow presetCategory={presetCategory} presetSubcategory={presetSubcategory} presetDesk={presetDesk} onLegacy={() => choose('chat')} />
    </Shell>
  );
}
