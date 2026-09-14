/**
 * IRIS Ai brand mark — the split-eye artwork: organic iris (left) meeting
 * circuitry (right) around an "Ai" core. Two palettes match the brand artwork:
 *   blue  → light mode (deep blue iris + silver circuitry on navy)
 *   gold  → dark mode  (gold iris fibres + gold circuitry on black)
 *
 * The mark ships as two cropped WebP files rather than inline SVG. When no
 * `palette` is given, BOTH are rendered and CSS picks one off `data-theme`, so
 * callers that don't know the theme (the workspace sidebar, for instance) still
 * follow the theme toggle without a hydration mismatch.
 */
export type IrisPalette = 'blue' | 'gold';

const SRC: Record<IrisPalette, string> = {
  blue: '/images/iris-mark-light.webp',
  gold: '/images/iris-mark-dark.webp',
};

/** Accent used for the optional glow, per palette. */
const GLOW: Record<IrisPalette, string> = {
  blue: 'rgba(53,200,255,.45)',
  gold: 'rgba(232,182,79,.45)',
};

export function IrisEyeMark({
  size = 30,
  palette,
  className,
  glow = false,
  badge = false,
  title,
}: {
  size?: number;
  /** Force a palette. Omit to follow the active theme. */
  palette?: IrisPalette;
  className?: string;
  glow?: boolean;
  /** Softer, card-like corners for use as a standalone badge. */
  badge?: boolean;
  title?: string;
}) {
  const cls = ['iris-mark', badge ? 'iris-mark-badge' : '', className].filter(Boolean).join(' ');
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.max(3, Math.round(size * (badge ? 0.2 : 0.16))),
  };

  const img = (p: IrisPalette, themeClass?: string) => (
    <img
      src={SRC[p]}
      alt={title ?? ''}
      width={size}
      height={size}
      className={['iris-mark-img', themeClass].filter(Boolean).join(' ')}
      style={glow ? { filter: `drop-shadow(0 0 10px ${GLOW[p]})` } : undefined}
      draggable={false}
      aria-hidden={title ? undefined : 'true'}
    />
  );

  return (
    <span className={cls} style={style} role={title ? 'img' : undefined} aria-label={title}>
      {palette
        ? img(palette)
        : (
          <>
            {img('gold', 'iris-mark-dark')}
            {img('blue', 'iris-mark-light')}
          </>
        )}
    </span>
  );
}

/** Lockup: eye mark + wordmark, for headers and the landing page. */
export function IrisLockup({ size = 30, palette, subtitle = 'Physique 57 India' }: { size?: number; palette?: IrisPalette; subtitle?: string }) {
  return (
    <span className="iris-lockup">
      <IrisEyeMark size={size} palette={palette} glow title="IRIS Ai" />
      <span className="iris-lockup-text">
        <span className="iris-lockup-name">
          <b>IRIS</b> <i>Ai</i>
        </span>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </span>
  );
}
