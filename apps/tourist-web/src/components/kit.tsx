import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { creditFor } from '../data/catalogue';
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
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tone?: 'plain' | 'aqua' | 'sand' | 'sunken';
}) {
  const cls = `chip chip--${tone} ${selected ? 'chip--on' : ''}`;
  if (!onClick) return <span className={cls}>{children}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
      {children}
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
    <span className="rating" aria-label={`Rated ${average} out of 5${count ? ` from ${count} reviews` : ''}`}>
      <Icon name="star" size={compact ? 12 : 13} color="var(--gold)" />
      <span className={`rating__score ${compact ? 't-micro-strong' : 't-caption-strong'}`}>{average.toFixed(1)}</span>
      {count !== undefined && !compact ? (
        <span className="t-caption c-muted">· {count.toLocaleString('en-US')} reviews</span>
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
 * A photograph in a fixed ratio frame, with its attribution.
 *
 * Most of this photography is CC BY or CC BY-SA, which require credit *wherever the work appears*.
 * `credit` renders it over the image; the subject line is included because several listings are
 * illustrated with a representative photograph of the right island rather than of that exact
 * operator, and saying so is what keeps the demonstration honest.
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
  const c = credit ? creditFor(mediaKey) : undefined;
  return (
    <div className={`photo ${className}`} style={{ aspectRatio: ratio, borderRadius: radius, ...style }}>
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        /**
         * A file that 404s hides itself and leaves the frame's warm tint behind, rather than
         * rendering the browser's broken-image glyph. The frame keeps its ratio either way, so the
         * layout does not move. Two mood tiles pointed at keys that did not exist and this is the
         * guard that makes that class of mistake cosmetic instead of conspicuous.
         */
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden';
        }}
      />
      {children}
      {c ? (
        <span className="photo__credit" title={`${c.subject} — ${c.author}, ${c.licence}`}>
          {c.author} · {c.licence}
        </span>
      ) : null}
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
