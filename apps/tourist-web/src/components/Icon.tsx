/**
 * The icon set, taken from the source design's own SVG paths.
 *
 * They are inlined rather than pulled from an icon package for two reasons: the design draws
 * several of them itself (the voucher/ticket glyph, the Irie sparkle, the proximity pin) and no
 * library has those; and an inline `currentColor` path takes the brand colour, scales crisply and
 * adds nothing to the dependency tree.
 *
 * All strokes are 1.9–2.2 at a 24-unit viewBox, which is the weight the design uses throughout.
 */

export type IconName =
  | 'home'
  | 'pin'
  | 'calendar'
  | 'user'
  | 'sparkle'
  | 'search'
  | 'filter'
  | 'heart'
  | 'heart-filled'
  | 'share'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-right'
  | 'close'
  | 'check'
  | 'shield-check'
  | 'ticket'
  | 'bell'
  | 'clock'
  | 'car'
  | 'walk'
  | 'lock'
  | 'star'
  | 'bookmark'
  | 'refresh'
  | 'minus'
  | 'plus';

const STROKE: Partial<Record<IconName, string>> = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  calendar: 'M3.5 10.5h17M8.5 3.5v4M15.5 3.5v4',
  user: 'M5 20c1.2-3.5 3.8-5.2 7-5.2s5.8 1.7 7 5.2',
  search: 'm16 16 4.5 4.5',
  filter: 'M4 7h16M7 12h10M10 17h4',
  heart: 'M12 20s-7-4.6-7-9.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7 3.1c0 4.7-7 9.3-7 9.3z',
  share: 'M12 16V4M8 8l4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5',
  'chevron-left': 'M14 6l-6 6 6 6',
  'chevron-right': 'M10 6l6 6-6 6',
  'chevron-down': 'M5 9l7 7 7-7',
  'arrow-right': 'M4 12h14M12 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.6 9.6 17.2 19 7.8',
  bell: 'M18 15.5V10a6 6 0 1 0-12 0v5.5L4.5 18h15zM10 20.5h4',
  clock: 'M12 7.5V12l3 2',
  car: 'M5 17.5h14M7.5 17.5V12l2-4h5l2 4v5.5',
  walk: 'M9 20l6-16M6 9h13M5 15h13',
  lock: 'M8 10.5V8a4 4 0 0 1 8 0v2.5',
  bookmark: 'M6.5 3.5h11v17l-5.5-4-5.5 4z',
  refresh: 'M4 5.5v5h5M4.6 10.5a8 8 0 1 1 2.2 7.6',
  minus: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z',
  'shield-check': 'M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6zM9 12l2.2 2.2L15.5 10',
  ticket: 'M3.5 12.5h17M12 8.5v12',
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Defaults to `currentColor`, so an icon inherits the colour of the text beside it. */
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.9, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    // Decorative by default: the label beside an icon carries the meaning, and a duplicated
    // announcement is noise for a screen reader. Anything that is the *only* label wraps itself in
    // an element with an accessible name instead.
    'aria-hidden': true,
    focusable: false,
  } as const;

  // The handful that need a fill or extra geometry rather than a single stroked path.
  switch (name) {
    case 'sparkle':
      return (
        <svg {...common} fill={color}>
          <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" />
          <path d="M18.6 15.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" opacity="0.85" />
        </svg>
      );
    case 'heart-filled':
      return (
        <svg {...common} fill={color}>
          <path d="M12 20.5s-7.5-4.9-7.5-10A4.5 4.5 0 0 1 12 7.3a4.5 4.5 0 0 1 7.5 3.2c0 5.1-7.5 10-7.5 10z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common} fill={color}>
          <path d="M12 3.6l2.6 5.7 6.2.7-4.6 4.2 1.2 6.1-5.4-3-5.4 3 1.2-6.1L3.2 10l6.2-.7z" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <path d={STROKE.pin} />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d={STROKE.search} />
        </svg>
      );
    case 'user':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.6" />
          <path d={STROKE.user} />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
          <path d={STROKE.calendar} />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d={STROKE.clock} />
        </svg>
      );
    case 'car':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <path d={STROKE.car} />
          <circle cx="8.5" cy="19.5" r="1.4" />
          <circle cx="15.5" cy="19.5" r="1.4" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
          <path d={STROKE.lock} />
        </svg>
      );
    case 'ticket':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <rect x="3.5" y="8.5" width="17" height="12" rx="2" />
          <path d={STROKE.ticket} />
        </svg>
      );
    default: {
      const d = STROKE[name];
      if (!d) return null;
      return (
        <svg
          {...common}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={d} />
        </svg>
      );
    }
  }
}
