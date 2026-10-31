import { cn } from "@/lib/utils";

/**
 * IRIS brand mark.
 *
 * The mark is drawn, not photographed. The previous asset was a 512px
 * AI-generated bitmap of an eye with circuitry baked into a dark square: at
 * the 30px the rail renders it at, the detail collapsed into noise, and the
 * baked-in background fought every surface in the product (it was visibly a
 * dark tile in the light theme).
 *
 * What is here instead is a geometric iris: an aperture whose left half is
 * organic (a filled iris) and whose right half is a technical grid, split by
 * the same vertical rule the bitmap used. It is inline SVG, so it inherits
 * `currentColor`, stays crisp at any size, weighs nothing, and is the same
 * mark in both themes.
 *
 * `palette` is kept in the signature so existing call sites keep compiling —
 * the mark no longer needs two colourways.
 */
export type IrisPalette = "blue" | "gold";

export function IrisEyeMark({
  size = 30,
  className,
  title,
  /** Kept for API compatibility; the mark is theme-neutral by design. */
  palette: _palette,
  glow: _glow,
  badge: _badge,
}: {
  size?: number;
  palette?: IrisPalette;
  className?: string;
  glow?: boolean;
  badge?: boolean;
  title?: string;
}) {
  return (
    <span
      className={cn("iris-mark", className)}
      style={{ width: size, height: size }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" aria-hidden="true">
        {/* Lens barrel */}
        <circle cx="16" cy="16" r="14.25" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
        {/* Organic half: the iris itself */}
        <path
          d="M16 5.75a10.25 10.25 0 0 0 0 20.5V5.75Z"
          fill="currentColor"
          opacity="0.16"
        />
        <path
          d="M16 8.5a7.5 7.5 0 0 0 0 15V8.5Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* Technical half: the aperture grid */}
        <g stroke="currentColor" strokeWidth="1.1" opacity="0.85">
          <path d="M16 5.75v20.5" />
          <path d="M16 11h4.4M16 14.5h6.6M16 18h6.6M16 21.5h4.4" opacity="0.55" />
        </g>
        {/* Core */}
        <circle cx="16" cy="16" r="3.1" fill="currentColor" />
        <circle cx="16" cy="16" r="1.15" fill="var(--surface, #fff)" />
      </svg>
    </span>
  );
}

/**
 * Lockup: mark + wordmark. The wordmark is set in the display face so the
 * product's own type identity carries the brand, rather than a second artwork.
 */
export function IrisLockup({
  size = 28,
  subtitle = "Physique 57 India",
  palette,
  compact = false,
}: {
  size?: number;
  palette?: IrisPalette;
  subtitle?: string;
  /** Mark only — for the collapsed rail and tight headers. */
  compact?: boolean;
}) {
  return (
    <span className="iris-lockup" title="IRIS Ai">
      <IrisEyeMark size={size} palette={palette} />
      {!compact && (
        <span className="iris-lockup-text">
          <span className="iris-lockup-name">
            IRIS<span className="iris-lockup-ai">ai</span>
          </span>
          {subtitle && <small>{subtitle}</small>}
        </span>
      )}
    </span>
  );
}
