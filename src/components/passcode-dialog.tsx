"use client";
import {useState} from 'react';
import {LockKeyhole} from 'lucide-react';
import {Modal} from './ui';

/** The passcode that opens the live form designer. A convenience gate against accidental edits
 *  on a shared desk; publishing is still checked on the server. */
const DESIGN_PASSCODE = '9818';

export function PasscodeDialog({open, onClose, onUnlock, onCode, title = 'Enter the designer passcode', description = 'The form designer changes the live form for every studio.'}: {
  open: boolean; onClose: () => void; onUnlock: () => void;
  /** Hands the typed code to the caller instead of checking it here — for gates the server
   *  verifies, where comparing in the browser would be theatre. */
  onCode?: (code: string) => void;
  title?: string; description?: string;
}) {
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);
  const submit = () => {
    if (onCode) { onCode(code); setCode(''); return; }
    if (code === DESIGN_PASSCODE) { setCode(''); setWrong(false); onUnlock(); return; }
    setWrong(true); setCode('');
  };
  return (
    <Modal open={open} onClose={() => { setCode(''); setWrong(false); onClose(); }} size="narrow" title={title} description={description} resetKey={String(open)}
      footer={<><span /><div className="flex-row" style={{gap: 8}}><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={submit} disabled={code.length < 4}><LockKeyhole size={13} /> Unlock</button></div></>}>
      <form className="passcode" onSubmit={e => { e.preventDefault(); submit(); }}>
        <label htmlFor="passcode-input">Passcode</label>
        <input id="passcode-input" className={'passcode-input' + (wrong ? ' wrong' : '')} type="password" inputMode="numeric" autoComplete="off" maxLength={8} autoFocus value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setWrong(false); }} aria-invalid={wrong || undefined} aria-describedby="passcode-msg" />
        <span id="passcode-msg" className={wrong ? 'passcode-error' : 'field-hint'}>{wrong ? 'That passcode is not right. Try again.' : 'Ask an administrator if you do not have it.'}</span>
      </form>
    </Modal>
  );
}
