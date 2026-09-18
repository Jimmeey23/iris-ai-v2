/**
 * Brand illustration set — hand-built SVG line art on a shared visual grammar:
 * thin 1.5px strokes, rounded joins, a single accent hue via `currentColor`, and a
 * soft radial "stage" behind each subject. No raster assets, themes automatically,
 * and each piece is a few hundred bytes instead of a few hundred kilobytes.
 */
export type ArtVariant =
  | 'inbox' | 'search' | 'chart' | 'people' | 'link' | 'shield' | 'spark' | 'calendar' | 'clipboard';

function Stage({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="empty-art" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="66" rx="58" ry="44" fill={`url(#${id}-glow)`} />
      {/* ground line */}
      <path d="M34 100h92" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 7" />
      <g
        stroke={`url(#${id}-fade)`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="empty-art-subject"
      >
        {children}
      </g>
    </svg>
  );
}

export function EmptyArt({ variant = 'inbox' }: { variant?: ArtVariant }) {
  switch (variant) {
    case 'search':
      return (
        <Stage id="a-search">
          <circle cx="72" cy="54" r="22" />
          <path d="M88 70l16 16" />
          <path d="M64 50a10 10 0 018-6" strokeOpacity="0.55" />
          <path d="M110 34l3-7 3 7 7 3-7 3-3 7-3-7-7-3z" strokeOpacity="0.5" />
        </Stage>
      );
    case 'chart':
      return (
        <Stage id="a-chart">
          <path d="M44 84V58M62 84V44M80 84V66M98 84V36M116 84V54" strokeWidth="4" strokeOpacity="0.8" />
          <path d="M38 84h84" strokeOpacity="0.35" />
          <path d="M44 46l18-14 18 16 18-22 18 12" strokeOpacity="0.45" strokeDasharray="3 4" />
        </Stage>
      );
    case 'people':
      return (
        <Stage id="a-people">
          <circle cx="66" cy="48" r="12" />
          <path d="M44 88c0-12 10-20 22-20s22 8 22 20" />
          <circle cx="100" cy="54" r="9" strokeOpacity="0.5" />
          <path d="M84 88c0-9 7-15 16-15s16 6 16 15" strokeOpacity="0.5" />
        </Stage>
      );
    case 'link':
      return (
        <Stage id="a-link">
          <path d="M68 66l24-24" />
          <path d="M60 74a14 14 0 010-20l8-8a14 14 0 0120 0" />
          <path d="M100 46a14 14 0 010 20l-8 8a14 14 0 01-20 0" />
        </Stage>
      );
    case 'shield':
      return (
        <Stage id="a-shield">
          <path d="M80 28l26 10v20c0 16-11 27-26 32-15-5-26-16-26-32V38z" />
          <path d="M70 62l8 8 14-16" strokeOpacity="0.7" />
        </Stage>
      );
    case 'spark':
      return (
        <Stage id="a-spark">
          <path d="M80 30l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" />
          <path d="M112 38l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" strokeOpacity="0.5" />
          <path d="M46 64l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" strokeOpacity="0.4" />
        </Stage>
      );
    case 'calendar':
      return (
        <Stage id="a-calendar">
          <rect x="46" y="36" width="68" height="54" rx="6" />
          <path d="M46 52h68M62 30v10M98 30v10" />
          <circle cx="66" cy="66" r="3" strokeOpacity="0.6" />
          <circle cx="80" cy="66" r="3" strokeOpacity="0.6" />
          <circle cx="94" cy="66" r="3" strokeOpacity="0.35" />
          <circle cx="66" cy="78" r="3" strokeOpacity="0.35" />
        </Stage>
      );
    case 'clipboard':
      return (
        <Stage id="a-clipboard">
          <rect x="52" y="32" width="56" height="62" rx="6" />
          <rect x="68" y="24" width="24" height="14" rx="4" />
          <path d="M64 56h32M64 68h32M64 80h20" strokeOpacity="0.6" />
        </Stage>
      );
    default:
      return (
        <Stage id="a-inbox">
          <path d="M40 58l10-24h60l10 24" />
          <path d="M40 58v24a6 6 0 006 6h68a6 6 0 006-6V58" />
          <path d="M40 58h22l5 10h26l5-10h22" />
        </Stage>
      );
  }
}

/** Decorative dot-grid backdrop for section headers and hero panels. */

/** Thin concentric "radar" rings — used behind stat blocks and the Iris orb. */
export function RadarRings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      {[30, 52, 74, 96].map((r, i) => (
        <circle key={r} cx="100" cy="100" r={r} stroke="currentColor" strokeOpacity={0.22 - i * 0.04} strokeWidth="1" strokeDasharray={i % 2 ? '2 6' : undefined} />
      ))}
      <path d="M100 4v192M4 100h192" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
    </svg>
  );
}
