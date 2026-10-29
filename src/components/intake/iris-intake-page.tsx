"use client";
import {useState} from 'react';
import {LayoutList, MessageSquareText} from 'lucide-react';
import {Shell} from '../shell';
import {IrisMarquee} from '../iris-marquee';
import {IrisChat} from '../iris-chat';
import {IntakeFlow} from './intake-flow';

type Mode = 'form' | 'chat';

/**
 * /iris — the form-based generator is the intake. The conversational flow is open to every
 * user on demand, behind the "Chat with Iris" switch, and is never remembered: each visit
 * starts on the form unless ?mode=chat asks for the chat.
 */
export function IrisIntakePage({presetCategory, presetSubcategory, presetMode, presetDesk}: {presetCategory?: string; presetSubcategory?: string; presetMode?: Mode; presetDesk?: boolean}) {
  const [mode, setMode] = useState<Mode>(presetMode || 'form');

  if (mode === 'chat') {
    return (
      <Shell hideHeading hideFooter fullHeight banner={<IrisMarquee page="iris" />}>
        <div className="intake-legacy-bar" role="status">
          <span className="badge amber"><MessageSquareText size={10} /> Chat intake</span>
          <span>Describe the issue by typing or speaking — Iris asks for anything missing and builds the ticket.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setMode('form')}><LayoutList size={13} /> Switch to the form</button>
        </div>
        <IrisChat presetCategory={presetCategory} presetSubcategory={presetSubcategory} />
      </Shell>
    );
  }
  return (
    <Shell hideHeading hideFooter banner={<IrisMarquee page="iris" />}>
      <IntakeFlow presetCategory={presetCategory} presetSubcategory={presetSubcategory} presetDesk={presetDesk} onLegacy={() => setMode('chat')} />
    </Shell>
  );
}
