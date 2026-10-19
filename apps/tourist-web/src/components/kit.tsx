import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './kit.css';

/**
 * The reusable pieces the design repeats.
 *
 * Everything the nine screens share lives here rather than being re-typed per screen — the card
 * surface, both button weights, chips, badges, the rating row, the photo frame with its credit, the
 * money formatters and the skeletons. Six screens each growing their own card
 * style is the exact failure the design's own notes call out.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * "US$89" — as the design sets it, never a bare "$89".
 *
 * Minor units in, string out. Whole amounts drop the decimals because every price in the catalogue
 * is a whole dollar and "US$89.00" on a card is noise; a total that has cents keeps them.
 */
export function formatUsd(minor: number, opts: { withCode?: boolean; forceCents?: boolean } = {}): string {
  const major = minor / 100;
  const hasCents = minor % 100 !== 0;
  const body = major.toLocaleString('en-US', {
    minimumFractionDigits: hasCents || opts.forceCents ? 2 : 0,
    maximumFractionDigits: hasCents || opts.forceCents ? 2 : 0,
  });
  return `US$${body}`;
}

/**
 * A count and its noun, agreeing.
 *
 * `${n} reviews` is correct for every number this app had in its demo catalogue and wrong for the
 * one every new listing starts at. "1 reviews" appeared under every rating, "1 places left" on the
 * last seat of a departure, and "1 experiences" in the island picker a guest sees before they have
 * seen anything else — the first sentence the product says about itself, ungrammatical.
 *
 * `Intl.PluralRules` rather than `n === 1`, because the rule is the locale's to know, and this app
 * is for a region where English is one of four languages in daily use.
 *
 * Every noun here happens to be regular, so `many` is usually left to default.
 */
const PLURAL_RULES = new Intl.PluralRules('en-US');

export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${PLURAL_RULES.select(count) === 'one' ? one : many}`;
}

/**
 * How long a listing takes, as the listing advertises it.
 *
 * A band, not a figure: a 90-minute tour that depends on the group, the road and the weather is
 * honestly "1–2 hours" and dishonestly "1 hr 30 min". Four screens used to answer this question
 * and all four answered it differently — Search said "1h 30m", Trips said "2 hr" (`Math.round`,
 * which advertised a 90-minute tour as two hours in the itinerary a guest plans their day around),
 * the detail screen said "1–2 hours". A guest comparing a card against the page it opens has to
 * see one number, so there is now one function.
 *
 * For a gap or a shortfall — a quantity, not a claim — use `exactDuration`.
 */
export function listingDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const upper = h + (m > 0 ? 1 : 0);
  return m > 0 ? `${h}–${upper} hours` : `${h} hour${h === 1 ? '' : 's'}`;
}

/**
 * An exact span of time. "45 min" / "2 hr 10 min".
 *
 * For the itinerary's shortfalls, where the number is a measurement rather than a description and
 * rounding it would misstate whether a day actually fits. A shortfall of 374 minutes means nothing
 * read as a number of minutes.
 */
export function exactDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function Price({ minor, className = '', size = 'md' }: { minor: number; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 't-amount' : size === 'sm' ? 't-amount-sm' : 't-amount-sm';
  return <span className={`${cls} c-brand ${className}`}>{formatUsd(minor)}</span>;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Deep green, full width, 52pt tall. The one primary action on a screen. */
export function PrimaryButton({ children, full = true, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--primary ${full ? 'btn--full' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, full = true, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--secondary ${full ? 'btn--full' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Gold-outlined — "Save Offer" on the voucher, and nothing else. */
export function GoldButton({ children, full = true, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--gold ${full ? 'btn--full' : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function TextButton({ children, className = '', ...rest }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--text ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** A circular control floating over a photograph — back, save, share. */
export function RoundButton({
  icon,
  label,
  onClick,
  active = false,
  tone = 'light',
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  tone?: 'light' | 'dark';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={onClick ? active : undefined}
      className={`round-btn round-btn--${tone}`}
    >
      <Icon
        name={active ? 'heart-filled' : icon}
        size={17}
        color={active ? 'var(--coral)' : undefined}
        strokeWidth={2}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chips, badges, ratings
// ---------------------------------------------------------------------------

export function Chip({
  children,
  selected = false,
  onClick,
  tone = 'plain',
  dotColor,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tone?: 'plain' | 'aqua' | 'sand' | 'sunken';
  /**
   * A category hue, shown as a dot before the label.
   *
   * Optional, and decorative: the label carries the meaning, so the dot is
   * `aria-hidden`. It exists so a filter bar can speak the same colour language
   * as Explore's category tiles without becoming a second row of tiles.
   */
  dotColor?: string;
}) {
  const cls = `chip chip--${tone} ${selected ? 'chip--on' : ''}`;
  const body = (
    <>
      {dotColor ? (
        <span className="chip__dot" style={{ background: dotColor }} aria-hidden="true" />
      ) : null}
      {children}
    </>
  );
  if (!onClick) return <span className={cls}>{body}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  );
}

export type BadgeTone =
  | 'brand'
  | 'aqua'
  | 'sand'
  | 'coral'
  | 'plain'
  | 'muted'
  | 'gold-glass'
  | 'travel';

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** "★ 4.8 · 1,240 reviews". Star and score both gold — the score is the thing being rated. */
export function Rating({ average, count, compact = false }: { average: number; count?: number; compact?: boolean }) {
  return (
    <span
      className="rating"
      aria-label={`Rated ${average} out of 5${count !== undefined ? ` from ${plural(count, 'review')}` : ''}`}
    >
      <Icon name="star" size={compact ? 12 : 13} color="var(--gold)" />
      <span className={`rating__score ${compact ? 't-micro-strong' : 't-caption-strong'}`}>{average.toFixed(1)}</span>
      {count !== undefined && !compact ? (
        <span className="t-caption c-muted">· {plural(count, 'review')}</span>
      ) : null}
    </span>
  );
}

/** Five filled stars above a guest quote. Review blocks, not the inline score row. */
export function StarRow({ count = 5 }: { count?: number }) {
  return (
    <span className="star-row" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }, (_, i) => (
        <Icon key={i} name="star" size={14} color="var(--gold)" />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Photography
// ---------------------------------------------------------------------------

/**
 * A photograph in a fixed ratio frame.
 *
 * ## Where the attribution went
 *
 * 51 of the 57 photographs are CC BY or CC BY-SA, and both require the author to be named. They do
 * **not** require it to be written across the picture: the wording is "in any reasonable manner",
 * and a credits screen is the ordinary reading of that — it is how Wikipedia's own apps do it.
 *
 * So the caption came off the image, and `/credits` now lists every photograph with its subject,
 * author, licence and source page, reachable from Profile. Attribution is discharged there.
 *
 * `credit` is kept as a prop and does nothing, so that nothing silently starts painting a caption
 * over a hero again. Deleting the images' licences is not an option: without attribution the app
 * has no right to use them at all.
 *
 * `loading="lazy"` plus an explicit aspect ratio means the layout never jumps as images arrive —
 * the frame is the right size before the file is.
 */
export function Photo({
  src,
  mediaKey,
  alt,
  ratio = '16 / 10',
  radius = 'var(--r-lg)',
  credit = false,
  priority = false,
  className = '',
  children,
  style,
}: {
  src: string;
  mediaKey?: string;
  alt: string;
  ratio?: string;
  radius?: string;
  credit?: boolean;
  /**
   * Set on the one image that is already on screen when a route paints — the island hero on
   * Explore, the listing hero on the detail screen. That image is the Largest Contentful Paint,
   * and `loading="lazy"` on it does the opposite of what it is for: the browser defers the
   * fetch until layout has settled, so the measurement it feeds is the one it delays.
   */
  priority?: boolean;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  void credit;
  void mediaKey;
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`photo ${failed ? 'photo--failed' : ''} ${className}`}
      style={{ aspectRatio: ratio, borderRadius: radius, ...style }}
    >
      {failed ? (
        /*
         * A listing whose photograph is missing still has to look like a listing.
         *
         * Hiding the broken `<img>` was the right instinct — the browser's broken-image glyph is
         * worse than nothing — but it left a featureless slab in a row where every sibling carries
         * a photograph, which reads as a load that failed rather than a listing without a picture.
         * A mark in the middle of the frame says the second thing, which is the true one, and says
         * it quietly enough not to compete with the cards that did load.
         *
         * `aria-hidden` because the frame is decorative here: the listing's name is already next
         * to it, and "image placeholder" announced on every such row is noise.
         */
        <span className="photo__fallback" aria-hidden>
          <Icon name="compass" size={22} color="var(--ink-faint)" strokeWidth={1.5} />
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding={priority ? 'sync' : 'async'}
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export function Card({
  children,
  onClick,
  className = '',
  as = 'div',
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  as?: 'div' | 'article';
  label?: string;
}) {
  if (onClick) {
    return (
      <button type="button" className={`card card--tappable ${className}`} onClick={onClick} aria-label={label}>
        {children}
      </button>
    );
  }
  const Tag = as;
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function SectionHeader({
  title,
  action,
  onAction,
  note,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  note?: string;
}) {
  return (
    <div className="section-head">
      <h2 className="t-section">{title}</h2>
      {note ? <span className="t-micro c-premium section-head__note">{note}</span> : null}
      {action ? (
        <button type="button" className="t-micro-strong c-locator section-head__action" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ height, width = '100%', radius = 'var(--r-md)' }: { height: number; width?: string; radius?: string }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden />;
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="col" style={{ gap: 12 }} aria-busy="true" aria-label="Loading experiences">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="row" style={{ gap: 12 }}>
          <Skeleton height={92} width="92px" radius="var(--r-md)" />
          <div className="col grow" style={{ gap: 8 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="45%" />
            <Skeleton height={16} width="30%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** An empty list gets an icon, a reason and one action. An empty list that says nothing reads as a bug. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={22} color="var(--green-900)" />
      </span>
      <h3 className="t-heading">{title}</h3>
      <p className="t-caption c-muted">{body}</p>
      {action ? <SecondaryButton full={false} onClick={onAction}>{action}</SecondaryButton> : null}
    </div>
  );
}

/** The stepper used for party size. */
export function Stepper({
  label,
  sub,
  value,
  onChange,
  min = 0,
  max = 12,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper">
      <div className="grow">
        <div className="t-caption-strong">{label}</div>
        {sub ? <div className="t-micro c-muted">{sub}</div> : null}
      </div>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Fewer ${label}`}
      >
        <Icon name="minus" size={16} strokeWidth={2.4} />
      </button>
      <span className="stepper__value t-body-strong" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`More ${label}`}
      >
        <Icon name="plus" size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
