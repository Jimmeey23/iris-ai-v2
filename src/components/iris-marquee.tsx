"use client";
import {
  Activity,
  Building2,
  Coffee,
  ShieldAlert,
  Wrench,
  GraduationCap,
  HeartPulse,
  PhoneCall,
  RefreshCw,
  Mic,
  Database,
  Cpu,
  Sparkles,
} from 'lucide-react';

export function IrisMarquee() {
  const items = [
    {
      icon: Activity,
      iconColor: 'var(--green)',
      label: 'STUDIO OPS LIVE',
      value: 'All Systems Monitored · 99.9% Operational',
      badge: 'LIVE',
      badgeClass: 'green',
    },
    {
      icon: Building2,
      iconColor: 'var(--accent)',
      label: 'KWALITY HOUSE (Kemps Corner)',
      value: 'Studio 1 [22 Pax] · Studio 2 [13 Pax] · PowerCycle [10 Pax] · Strength Studio [7 Pax] · His Space · Her Space · Guest Washroom · Brain Cell · Pantry',
    },
    {
      icon: Building2,
      iconColor: 'var(--accent)',
      label: 'SUPREME HQ (Bandra)',
      value: '2 Studios [13 Pax each] · PowerCycle [13 Pax] · Lockers & Showers · Washrooms · Reception',
    },
    {
      icon: Building2,
      iconColor: 'var(--accent)',
      label: 'KENKERE HOUSE (Bengaluru)',
      value: 'Studio 1 [13 Pax] · Studio 2 [13 Pax] · Lobby Lounge · Washroom & Changing',
    },
    {
      icon: Coffee,
      iconColor: 'var(--amber)',
      label: 'COURTSIDE & COPPER & CLOVES',
      value: 'Main Cafe · Reception · Community Lounge',
    },
    {
      icon: ShieldAlert,
      iconColor: 'var(--red)',
      label: 'SAFETY & CRITICAL SLA',
      value: '< 30 Mins (P1 Immediate Escalation)',
      badge: 'URGENT',
      badgeClass: 'red',
    },
    {
      icon: Wrench,
      iconColor: 'var(--amber)',
      label: 'HVAC / AC & PLUMBING SLA',
      value: '< 2 Hours On-Site Dispatch',
    },
    {
      icon: GraduationCap,
      iconColor: 'var(--purple)',
      label: 'TRAINER SUBS SLA',
      value: '< 1 Hour Lead Time',
    },
    {
      icon: HeartPulse,
      iconColor: 'var(--accent)',
      label: 'MEMBER CARE SLA',
      value: '< 4 Hours Follow-up Target',
    },
    {
      icon: PhoneCall,
      iconColor: 'var(--green)',
      label: 'DUTY MANAGERS',
      value: 'Kemps: +91 22 2387 5757 · Bandra: +91 22 2640 5757',
    },
    {
      icon: RefreshCw,
      iconColor: 'var(--blue)',
      label: 'MOMENCE SYNC',
      value: 'Live Class Rosters & Member Directory Synced',
    },
    {
      icon: Mic,
      iconColor: 'var(--purple)',
      label: 'VOICE ENGINE',
      value: 'Hands-Free Speech-to-Ticket & Spoken TTS Active',
    },
    {
      icon: Database,
      iconColor: 'var(--accent)',
      label: '7-DAY MEMORY',
      value: 'Rolling Session History Preserved',
    },
    {
      icon: Cpu,
      iconColor: 'var(--blue)',
      label: 'CONTEXT PARSER',
      value: 'Real-Time Entity Heuristics for Studio, Area & Pax',
    },
  ];

  return (
    <div className="iris-fullwidth-marquee" aria-label="Operations live marquee">
      <div className="marquee-track">
        {/* Track 1 */}
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={`t1-${idx}`} className="mq-unit">
              <span className="mq-unit-sep">✦</span>
              <div className="mq-unit-content">
                <span className="mq-unit-icon" style={{ color: item.iconColor }}>
                  <Icon size={12.5} strokeWidth={2.2} />
                </span>
                {item.badge && (
                  <span className={`mq-unit-badge ${item.badgeClass}`}>
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
          const Icon = item.icon;
          return (
            <div key={`t2-${idx}`} className="mq-unit" aria-hidden="true">
              <span className="mq-unit-sep">✦</span>
              <div className="mq-unit-content">
                <span className="mq-unit-icon" style={{ color: item.iconColor }}>
                  <Icon size={12.5} strokeWidth={2.2} />
                </span>
                {item.badge && (
                  <span className={`mq-unit-badge ${item.badgeClass}`}>
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
