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
  memberPhone?: string;
  studio?: string;
  category?: string;
  subcategory?: string;
  sessionId?: string;
  classFormat?: string;
  trainer?: string;
  issueSummary?: string;
}

interface MomenceProfile {
  email: string;
  phone: string;
  homeLocation: string;
  membershipName: string;
  credits: number | null;
  totalVisits: number | null;
  expiresAt: string;
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
  memberPhone,
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
  
  // No invented member: if the ticket carries no Momence member, the panel says so rather
  // than offering to credit somebody who does not exist.
  const [selectedMemberName, setSelectedMemberName] = useState(memberName || '');
  const [selectedMemberId, setSelectedMemberId] = useState(memberId || '');
  const [creditReason, setCreditReason] = useState('AC / Facility Disruption');
  const [creditCount, setCreditCount] = useState(1);
  const [extensionDays, setExtensionDays] = useState(7);
  const [extensionReason, setExtensionReason] = useState('Medical / Injury Freeze Courtesy');
  const [subTrainer, setSubTrainer] = useState<string>(TRAINERS[0] || '');
  const [live, setLive] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<MomenceProfile | null>(null);
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
          live: boolean;
          history: ActionReceipt[];
          bonusCredits: number;
          extensionDays: number;
        }>(`/api/momence/actions${query}`);
        if (!cancelled) {
          setLive(Boolean(res.live));
          setReceipts(res.history || []);
          setBonusCredits(res.bonusCredits || 0);
          setBonusDays(res.extensionDays || 0);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedMemberId]);

  // The member card shows Momence's own record or nothing at all. It used to show a fixed
  // "Unlimited 50 Pass · 12 credits · 48 classes", which looked authoritative and was invented.
  useEffect(() => {
    let cancelled = false;
    if (!selectedMemberId) {
      const clear = setTimeout(() => setProfile(null), 0);
      return () => clearTimeout(clear);
    }
    void (async () => {
      try {
        const res = await api<{
          item: { raw: Record<string, unknown> };
          related?: { memberships?: Array<Record<string, unknown>> };
          source: string;
        }>(`/api/momence?module=members&id=${encodeURIComponent(selectedMemberId)}`);
        if (cancelled) return;
        if (res.source !== 'live') {
          setProfile(null);
          return;
        }
        const raw = res.item?.raw || {};
        const visits = (raw.visits || {}) as Record<string, unknown>;
        const membership = res.related?.memberships?.[0];
        const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
        setProfile({
          email: typeof raw.email === 'string' ? raw.email : '',
          phone: typeof raw.phoneNumber === 'string' ? raw.phoneNumber : '',
          homeLocation: typeof raw.homeLocation === 'string' ? raw.homeLocation : '',
          membershipName: membership ? String(membership.name || (membership.membership as Record<string, unknown> | undefined)?.name || '') : '',
          credits: membership ? num(membership.creditsRemaining ?? membership.remainingCredits ?? membership.credits) : null,
          totalVisits: num(visits.totalVisits),
          expiresAt: membership && typeof membership.endDate === 'string' ? membership.endDate : '',
        });
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMemberId, live]);

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
    const s = studio ? studio.split(',')[0] : profile?.homeLocation || 'our studio';
    const c = classFormat || 'your recent session';
    const refCode = lastReceipt?.momenceRef || '';

    if (category === 'Facility, Maintenance & IT' || issueSummary?.toLowerCase().includes('ac')) {
      return `Hi ${selectedMemberName}! ✧\n\nWe are sincerely sorry about the air conditioning issue during ${c} at our ${s} studio today. Our facilities engineering team has resolved the temperature regulation.\n\nAs a courtesy for the disruption, we have credited your Momence account with a complimentary session pass ${refCode ? ` (Ref: ${refCode})` : ''}. We can't wait to welcome you back at the barre!\n\nWarmly,\nPhysique 57 India Care Team`;
    }

    if (category === 'Class & Schedule' || trainer) {
      return `Hi ${selectedMemberName}! ✧\n\nThank you for sharing your feedback regarding ${c} at ${s}. We appreciate you taking the time to let us know. We've added 1 complimentary class credit to your Momence account ${refCode ? ` (Ref: ${refCode})` : ''}.\n\nLooking forward to seeing you in class soon!\n\nWarmly,\nPhysique 57 India Care Team`;
    }

    return `Hi ${selectedMemberName}! ✧\n\nThank you for reaching out to the Physique 57 India team. Regarding your experience at ${s}, we've logged this directly with our Studio Duty Manager and updated your Momence profile ${refCode ? ` (Ref: ${refCode})` : ''}.\n\nPlease let us know if we can assist you with booking your upcoming classes!\n\nWarmly,\nPhysique 57 India Care Team`;
  }, [selectedMemberName, studio, classFormat, category, trainer, issueSummary, lastReceipt, profile]);

  function copyWhatsApp() {
    void navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    notify('Copied WhatsApp message to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  // A fixed number here meant every "Open WhatsApp" sent the member's message to the same
  // person. With no number on file the link is not offered at all.
  const cleanPhone = (memberPhone || profile?.phone || '').replace(/[^\d]/g, '');

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
              <strong className="member-name">{selectedMemberName || 'No Momence member linked'}</strong>
              {profile && <span className="tier-badge">MOMENCE MEMBER</span>}
            </div>
            <div className="identity-sub">
              {(memberEmail || profile?.email) && (
                <>
                  <span><Mail size={10} /> {memberEmail || profile?.email}</span>
                  <span className="sub-divider">·</span>
                </>
              )}
              <span><Building2 size={10} /> {studio ? studio.split(',')[0] : profile?.homeLocation || '—'}</span>
            </div>
          </div>
        </div>

        {/* 2x2 Clean Balanced Metric Grid */}
        <div className="member-metrics-grid">
          <div className="metric-cell">
            <span className="m-label">MEMBERSHIP</span>
            <span className="m-val">{profile?.membershipName || '—'}</span>
          </div>
          <div className="metric-cell highlight">
            <span className="m-label">AVAILABLE CREDITS</span>
            <div className="credits-display">
              <span className="m-val main-credits">{profile?.credits === null || profile === null ? '—' : profile.credits + bonusCredits}</span>
              {bonusCredits > 0 && <span className="m-bonus">+{bonusCredits} comp</span>}
            </div>
          </div>
          <div className="metric-cell">
            <span className="m-label">TOTAL VISITS</span>
            <span className="m-val">{profile?.totalVisits === null || profile === null ? '—' : `${profile.totalVisits} classes`}</span>
          </div>
          <div className="metric-cell">
            <span className="m-label">EXPIRY DATE</span>
            <div className="credits-display">
              <span className="m-val">{profile?.expiresAt ? new Date(profile.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
              {bonusDays > 0 && <span className="m-bonus">+{bonusDays}d</span>}
            </div>
          </div>
        </div>
        {live === false && (
          <p className="mac-disconnected">
            <AlertCircle size={12} /> Momence isn&apos;t connected, so no member record can be read and no action here will reach Momence. Connect it under Integrations.
          </p>
        )}
        {live === true && selectedMemberId && !profile && (
          <p className="mac-disconnected">
            <AlertCircle size={12} /> Momence returned no record for this member, so their membership and credits can&apos;t be shown.
          </p>
        )}
        {live === true && !selectedMemberId && (
          <p className="mac-disconnected">
            <AlertCircle size={12} /> This ticket has no Momence member attached, so member actions are unavailable.
          </p>
        )}
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
                disabled={busy || live !== true || !selectedMemberId}
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
                disabled={busy || live !== true || !selectedMemberId}
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
                {cleanPhone ? (
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
                ) : (
                  <span className="wa-btn-send is-disabled" title="No phone number on this member's Momence record">
                    <Send size={12} />
                    <span>No number on file</span>
                  </span>
                )}
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
                disabled={busy || live !== true || !selectedMemberId}
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
