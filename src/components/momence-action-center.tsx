"use client";
import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  Gift,
  CalendarPlus,
  UserCheck,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  Send,
  Copy,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CreditCard,
  Ticket,
} from 'lucide-react';
import { Avatar, Badge, api, useApp } from './ui';
import { TRAINERS, STUDIOS } from '@/lib/constants';

interface ActionCenterProps {
  memberId?: string;
  memberName?: string;
  memberEmail?: string;
  studio?: string;
  category?: string;
  subcategory?: string;
  sessionId?: string;
  classFormat?: string;
  trainer?: string;
  issueSummary?: string;
}

interface ActionReceipt {
  id: string;
  action: 'grant_credit' | 'extend_membership' | 'substitute_trainer' | 'log_note';
  targetType: 'member' | 'session';
  targetId: string;
  targetName: string;
  summary: string;
  details: Record<string, unknown>;
  performedAt: string;
  performedBy: string;
  status: 'synced' | 'pending';
  momenceRef: string;
}

export function MomenceActionCenter({
  memberId,
  memberName,
  memberEmail,
  studio,
  category,
  subcategory,
  sessionId,
  classFormat,
  trainer,
  issueSummary,
}: ActionCenterProps) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  
  // Active action accordion (all visible at a glance, click to expand/focus)
  const [expandedAction, setExpandedAction] = useState<'credit' | 'extension' | 'whatsapp' | 'substitute'>('credit');
  
  const [selectedMemberName, setSelectedMemberName] = useState(memberName || 'Priya Mehta');
  const [selectedMemberId, setSelectedMemberId] = useState(memberId || '481102');
  const [creditReason, setCreditReason] = useState('AC / Facility Disruption');
  const [creditCount, setCreditCount] = useState(1);
  const [extensionDays, setExtensionDays] = useState(7);
  const [extensionReason, setExtensionReason] = useState('Medical / Injury Freeze Courtesy');
  const [subTrainer, setSubTrainer] = useState<string>(TRAINERS[1] || 'Tanya Sharma');
  const [bonusCredits, setBonusCredits] = useState(0);
  const [bonusDays, setBonusDays] = useState(0);
  const [receipts, setReceipts] = useState<ActionReceipt[]>([]);
  const [lastReceipt, setLastReceipt] = useState<ActionReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (memberName && memberName !== selectedMemberName) {
      setSelectedMemberName(memberName);
    }
    if (memberId && memberId !== selectedMemberId) {
      setSelectedMemberId(memberId);
    }
  }, [memberName, memberId]);

  // Load existing action history
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const query = selectedMemberId ? `?memberId=${encodeURIComponent(selectedMemberId)}` : '';
        const res = await api<{
          history: ActionReceipt[];
          bonusCredits: number;
          extensionDays: number;
        }>(`/api/momence/actions${query}`);
        if (!cancelled) {
          setReceipts(res.history || []);
          setBonusCredits(res.bonusCredits || 0);
          setBonusDays(res.extensionDays || 0);
        }
      } catch {
        // Handled
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedMemberId]);

  // Executing 1-Click Compensation Actions
  async function handleGrantCredit() {
    setBusy(true);
    try {
      const res = await api<{ success: boolean; receipt: ActionReceipt; bonusCredits: number }>(
        '/api/momence/actions',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'grant_credit',
            memberId: selectedMemberId,
            memberName: selectedMemberName,
            credits: creditCount,
            reason: creditReason,
            studio: studio || 'Kwality House, Kemps Corner',
          }),
        }
      );
      if (res.receipt) {
        setLastReceipt(res.receipt);
        setReceipts((prev) => [res.receipt, ...prev]);
        setBonusCredits(res.bonusCredits);
        notify(`Granted +${creditCount} class credit(s) to ${selectedMemberName}!`);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendMembership() {
    setBusy(true);
    try {
      const res = await api<{ success: boolean; receipt: ActionReceipt; extensionDays: number }>(
        '/api/momence/actions',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'extend_membership',
            memberId: selectedMemberId,
            memberName: selectedMemberName,
            extensionDays,
            reason: extensionReason,
            studio: studio || 'Kwality House, Kemps Corner',
          }),
        }
      );
      if (res.receipt) {
        setLastReceipt(res.receipt);
        setReceipts((prev) => [res.receipt, ...prev]);
        setBonusDays(res.extensionDays);
        notify(`Extended membership by +${extensionDays} days for ${selectedMemberName}!`);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTrainerSubstitution() {
    setBusy(true);
    try {
      const res = await api<{ success: boolean; receipt: ActionReceipt }>(
        '/api/momence/actions',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'substitute_trainer',
            sessionId: sessionId || '2201',
            sessionName: classFormat || 'Barre 57 (Kemps)',
            substituteTrainer: subTrainer,
            originalTrainer: trainer || 'Lead Trainer',
            studio: studio || 'Kwality House, Kemps Corner',
          }),
        }
      );
      if (res.receipt) {
        setLastReceipt(res.receipt);
        setReceipts((prev) => [res.receipt, ...prev]);
        notify(`Substituted trainer with ${subTrainer} on Momence roster!`);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Pre-fill personalized WhatsApp message
  const whatsappText = useMemo(() => {
    const s = studio ? studio.split(',')[0] : 'Kwality House, Kemps Corner';
    const c = classFormat || 'your recent session';
    const refCode = lastReceipt ? lastReceipt.momenceRef : 'MOM-829104';

    if (category === 'Facility, Maintenance & IT' || issueSummary?.toLowerCase().includes('ac')) {
      return `Hi ${selectedMemberName}! ✧\n\nWe are sincerely sorry about the air conditioning issue during ${c} at our ${s} studio today. Our facilities engineering team has resolved the temperature regulation.\n\nAs a courtesy for the disruption, we have credited your Momence account with a complimentary session pass (Ref: ${refCode}). We can't wait to welcome you back at the barre!\n\nWarmly,\nPhysique 57 India Care Team`;
    }

    if (category === 'Class & Schedule' || trainer) {
      return `Hi ${selectedMemberName}! ✧\n\nThank you for sharing your feedback regarding ${c} at ${s}. We appreciate you taking the time to let us know. We've added 1 complimentary class credit to your Momence account (Ref: ${refCode}).\n\nLooking forward to seeing you in class soon!\n\nWarmly,\nPhysique 57 India Care Team`;
    }

    return `Hi ${selectedMemberName}! ✧\n\nThank you for reaching out to the Physique 57 India team. Regarding your experience at ${s}, we've logged this directly with our Studio Duty Manager and updated your Momence profile (Ref: ${refCode}).\n\nPlease let us know if we can assist you with booking your upcoming classes!\n\nWarmly,\nPhysique 57 India Care Team`;
  }, [selectedMemberName, studio, classFormat, category, trainer, issueSummary, lastReceipt]);

  function copyWhatsApp() {
    void navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    notify('Copied WhatsApp message to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  const cleanPhone = '919820157571';

  return (
    <div className="momence-action-center">
      {/* 1. MEMBER INTELLIGENCE & CONTEXT CARD */}
      <section className="mac-card member-identity-card">
        <div className="member-identity-header">
          <div className="avatar-wrap">
            <Avatar name={selectedMemberName} tone="purple" />
            <span className="online-indicator" title="Active member" />
          </div>
          <div className="identity-text">
            <div className="name-status-row">
              <strong className="member-name">{selectedMemberName}</strong>
              <span className="tier-badge">VERIFIED MEMBER</span>
            </div>
            <div className="identity-sub">
              <span><Mail size={10} /> {memberEmail || `${selectedMemberName.toLowerCase().replace(' ', '.')}@example.com`}</span>
              <span className="sub-divider">·</span>
              <span><Building2 size={10} /> {studio ? studio.split(',')[0] : 'Kwality House (Kemps)'}</span>
            </div>
          </div>
        </div>

        {/* 2x2 Clean Balanced Metric Grid */}
        <div className="member-metrics-grid">
          <div className="metric-cell">
            <span className="m-label">MEMBERSHIP</span>
            <span className="m-val">Unlimited 50 Pass</span>
          </div>
          <div className="metric-cell highlight">
            <span className="m-label">AVAILABLE CREDITS</span>
            <div className="credits-display">
              <span className="m-val main-credits">{12 + bonusCredits}</span>
              {bonusCredits > 0 && <span className="m-bonus">+{bonusCredits} comp</span>}
            </div>
          </div>
          <div className="metric-cell">
            <span className="m-label">TOTAL VISITS</span>
            <span className="m-val">48 classes</span>
          </div>
          <div className="metric-cell">
            <span className="m-label">EXPIRY DATE</span>
            <div className="credits-display">
              <span className="m-val">28 Nov 2026</span>
              {bonusDays > 0 && <span className="m-bonus">+{bonusDays}d</span>}
            </div>
          </div>
        </div>
      </section>

      {/* 2. RECENT CONFIRMED EXECUTION RECEIPT (IF ANY) */}
      {lastReceipt && (
        <div className="action-success-receipt">
          <div className="receipt-banner-head">
            <CheckCircle2 size={13} className="receipt-check-icon" />
            <strong>MOMENCE ACTION EXECUTED</strong>
            <span className="receipt-tag">{lastReceipt.momenceRef}</span>
          </div>
          <p className="receipt-text">{lastReceipt.summary}</p>
        </div>
      )}

      {/* 3. STRUCTURED OPERATIONAL ACTION CARDS */}
      <div className="action-suite-container">
        {/* CARD A: GRANT COMPLIMENTARY CLASS CREDIT */}
        <div className={`action-card-box ${expandedAction === 'credit' ? 'expanded' : ''}`}>
          <button
            type="button"
            className="action-card-trigger"
            onClick={() => setExpandedAction(expandedAction === 'credit' ? 'whatsapp' : 'credit')}
          >
            <div className="trigger-left">
              <span className="icon-pill-avatar purple">
                <Gift size={13} />
              </span>
              <div className="trigger-titles">
                <strong>Grant Free Class Credit</strong>
                <span>1-click compensation deposit to Momence</span>
              </div>
            </div>
            <div className="trigger-right">
              <span className="quick-action-tag">COMPENSATION</span>
              {expandedAction === 'credit' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expandedAction === 'credit' && (
            <div className="action-card-drawer">
              <div className="form-group">
                <label className="input-label">Reason for Courtesy Credit</label>
                <select
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="ops-select"
                >
                  <option value="AC / Facility Disruption">AC / Facility Disruption (Kemps/Bandra)</option>
                  <option value="Trainer Substitution Goodwill">Trainer Substitution Goodwill</option>
                  <option value="Class Delay / Sound Disruption">Class Delay / Sound Disruption</option>
                  <option value="Late Cancellation Courtesy">Late Cancellation Courtesy</option>
                  <option value="VIP Member Service Recovery">VIP Member Service Recovery</option>
                </select>
              </div>

              <div className="form-group">
                <label className="input-label">Credit Quantity</label>
                <div className="qty-selector-row">
                  {[1, 2, 3].map((num) => (
                    <button
                      type="button"
                      key={num}
                      className={`qty-btn ${creditCount === num ? 'active' : ''}`}
                      onClick={() => setCreditCount(num)}
                    >
                      <Ticket size={11} />
                      +{num} {num === 1 ? 'Credit' : 'Credits'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary-action"
                disabled={busy}
                onClick={() => void handleGrantCredit()}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                <span>Grant +{creditCount} Credit to {selectedMemberName}</span>
              </button>
            </div>
          )}
        </div>

        {/* CARD B: EXTEND MEMBERSHIP EXPIRY */}
        <div className={`action-card-box ${expandedAction === 'extension' ? 'expanded' : ''}`}>
          <button
            type="button"
            className="action-card-trigger"
            onClick={() => setExpandedAction(expandedAction === 'extension' ? 'credit' : 'extension')}
          >
            <div className="trigger-left">
              <span className="icon-pill-avatar amber">
                <CalendarPlus size={13} />
              </span>
              <div className="trigger-titles">
                <strong>Extend Membership Expiry</strong>
                <span>Add validity days for medical freeze or courtesy</span>
              </div>
            </div>
            <div className="trigger-right">
              <span className="quick-action-tag">VALIDITY</span>
              {expandedAction === 'extension' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expandedAction === 'extension' && (
            <div className="action-card-drawer">
              <div className="form-group">
                <label className="input-label">Extension Duration</label>
                <div className="qty-selector-row">
                  {[7, 14, 30].map((days) => (
                    <button
                      type="button"
                      key={days}
                      className={`qty-btn ${extensionDays === days ? 'active' : ''}`}
                      onClick={() => setExtensionDays(days)}
                    >
                      +{days} Days
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">Extension Reason</label>
                <select
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  className="ops-select"
                >
                  <option value="Medical / Injury Freeze Courtesy">Medical / Injury Freeze Courtesy</option>
                  <option value="Travel / Vacation Request">Travel / Vacation Request</option>
                  <option value="Facility Closure / Disruption">Facility Closure / Disruption Extension</option>
                  <option value="Management Discretion">Management Discretion</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-secondary-action"
                disabled={busy}
                onClick={() => void handleExtendMembership()}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                <span>Extend Package Expiry by +{extensionDays} Days</span>
              </button>
            </div>
          )}
        </div>

        {/* CARD C: WHATSAPP MEMBER CARE CONCIERGE */}
        <div className={`action-card-box ${expandedAction === 'whatsapp' ? 'expanded' : ''}`}>
          <button
            type="button"
            className="action-card-trigger"
            onClick={() => setExpandedAction(expandedAction === 'whatsapp' ? 'credit' : 'whatsapp')}
          >
            <div className="trigger-left">
              <span className="icon-pill-avatar green">
                <MessageSquare size={13} />
              </span>
              <div className="trigger-titles">
                <strong>WhatsApp Care Response</strong>
                <span>Personalized Physique 57 concierge message</span>
              </div>
            </div>
            <div className="trigger-right">
              <span className="quick-action-tag green">CONCIERGE</span>
              {expandedAction === 'whatsapp' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expandedAction === 'whatsapp' && (
            <div className="action-card-drawer">
              <div className="whatsapp-preview-card">
                <div className="wa-bubble">
                  <p className="wa-body-text">{whatsappText}</p>
                  <span className="wa-foot-meta">Just now · Prepared by IRIS Care</span>
                </div>
              </div>

              <div className="wa-buttons-row">
                <button type="button" className="wa-btn-copy" onClick={copyWhatsApp}>
                  <Copy size={12} />
                  <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                </button>
                <a
                  href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-btn-send"
                >
                  <Send size={12} />
                  <span>Open WhatsApp Web</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* CARD D: EMERGENCY TRAINER SUBSTITUTION */}
        <div className={`action-card-box ${expandedAction === 'substitute' ? 'expanded' : ''}`}>
          <button
            type="button"
            className="action-card-trigger"
            onClick={() => setExpandedAction(expandedAction === 'substitute' ? 'credit' : 'substitute')}
          >
            <div className="trigger-left">
              <span className="icon-pill-avatar purple">
                <UserCheck size={13} />
              </span>
              <div className="trigger-titles">
                <strong>Trainer Substitution</strong>
                <span>Swap instructor on live Momence roster</span>
              </div>
            </div>
            <div className="trigger-right">
              <span className="quick-action-tag">ROSTER</span>
              {expandedAction === 'substitute' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expandedAction === 'substitute' && (
            <div className="action-card-drawer">
              <div className="form-group">
                <label className="input-label">Affected Session</label>
                <input
                  type="text"
                  readOnly
                  value={`${classFormat || 'Barre 57'} · ${studio ? studio.split(',')[0] : 'Kwality House'}`}
                  className="ops-input readonly"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Select Substitute Trainer</label>
                <select
                  value={subTrainer}
                  onChange={(e) => setSubTrainer(e.target.value)}
                  className="ops-select"
                >
                  {TRAINERS.map((t) => (
                    <option key={t} value={t}>
                      {t} (Available Sub)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sub-notice-pill">
                <AlertCircle size={11} />
                <span>Assigning {subTrainer} updates the class roster and alerts booked members.</span>
              </div>

              <button
                type="button"
                className="btn-primary-action"
                disabled={busy}
                onClick={() => void handleTrainerSubstitution()}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                <span>Confirm {subTrainer} on Momence</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. MOMENCE AUDIT RECEIPTS LIST */}
      <section className="mac-card receipts-section">
        <div className="receipts-head">
          <div className="head-left">
            <Clock size={12} className="accent" />
            <strong>Momence Audit Trail</strong>
          </div>
          <span className="receipts-count-tag">{receipts.length} logged</span>
        </div>

        {receipts.length === 0 ? (
          <p className="receipts-empty-text">No compensation actions logged yet for this session.</p>
        ) : (
          <div className="receipts-timeline">
            {receipts.slice(0, 4).map((rcpt) => (
              <div key={rcpt.id} className="timeline-item">
                <div className="timeline-top">
                  <span className="status-indicator-tag">
                    <ShieldCheck size={9} />
                    SYNCED
                  </span>
                  <span className="timeline-ref">{rcpt.momenceRef}</span>
                </div>
                <p className="timeline-summary">{rcpt.summary}</p>
                <div className="timeline-footer">
                  <span>By {rcpt.performedBy}</span>
                  <span>{new Date(rcpt.performedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
