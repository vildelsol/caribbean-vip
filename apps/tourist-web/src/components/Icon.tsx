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
  | 'plus'
  // Explore's twelve categories. Drawn here rather than pulled from an icon package so the row
  // matches the weight of every other glyph in the app; they replaced emoji, which rendered as a
  // different set on every platform and broke apart entirely for the family group.
  | 'compass'
  | 'mountain'
  | 'beach'
  | 'snorkel'
  | 'waterfall'
  | 'food'
  | 'drum'
  | 'lotus'
  | 'moon'
  | 'bus'
  | 'family'
  | 'bag'
  // --- The concierge's own suggestion glyphs --------------------------------------
  // Drawn for the Irie rows, where the icon is the only colour on the row and so has to
  // carry the suggestion on its silhouette alone.
  | 'sun'
  | 'wine'
  | 'price-tag'
  | 'umbrella';

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
  // Wide and low. The first version was 5 units tall through a narrow cabin with a steep roof,
  // which at badge size read as a bell rather than a car — a car is recognised by its proportions
  // long before its detail, so the silhouette matters more than the stroke count.
  car: 'M4 16.4h16M6.4 16.4v-3l1.8-3.4h7.6l1.8 3.4v3',
  // A walking figure. The first attempt was three crossing strokes, which at 13px read as "≠".
  walk: 'M10 21l1.3-5.6L9 13l1-4.6 3.3 1.9 2.4 1.5M12.9 15.4L15.2 21',
  lock: 'M8 10.5V8a4 4 0 0 1 8 0v2.5',
  bookmark: 'M6.5 3.5h11v17l-5.5-4-5.5 4z',
  refresh: 'M4 5.5v5h5M4.6 10.5a8 8 0 1 1 2.2 7.6',
  minus: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z',
  'shield-check': 'M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6zM9 12l2.2 2.2L15.5 10',
  ticket: 'M3.5 12.5h17M12 8.5v12',

  // --- Suggestion glyphs ------------------------------------------------------------
  // A disc and eight rays. Six read as a flower and twelve as a cog, so the count is the
  // whole design; the rays stop short of the edge so the glyph keeps its optical margin
  // beside a label rather than filling the box.
  sun: 'M12 7.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4',
  // A stemmed glass. The bowl is a shallow V rather than a U: at 17px a U-bowl on a stem
  // reads as a lightbulb, and the straight taper is what says wine.
  wine: 'M7.8 3.5h8.4l-.7 5.1a3.6 3.6 0 0 1-7 0zM12 12.2v6.5M8.6 20.5h6.8',
  // A tag with its eyelet. The eyelet is a separate dot below, drawn in the switch, because
  // a hole small enough to be right is a fill and not a stroke at this size.
  'price-tag': 'M12.4 3.2H20a.8.8 0 0 1 .8.8v7.6a1 1 0 0 1-.3.7l-8.3 8.3a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4l8.3-8.3a1 1 0 0 1 .7-.3z',
  // Canopy and hook. The scalloped underside of the canopy is what separates an umbrella
  // from a mushroom at small sizes.
  umbrella: 'M3 12.4a9 9 0 0 1 18 0c-1.5-1.2-3-1.2-4.5 0s-3 1.2-4.5 0-3-1.2-4.5 0-3 1.2-4.5 0zM12 12.4v6.2a2.2 2.2 0 0 0 4.4 0',

  // --- Categories -----------------------------------------------------------------
  // Each is a silhouette first. At 13px in a chip the outline is all that survives, so these are
  // drawn to be told apart by shape alone, the way the car glyph above had to be.
  compass: 'M15.4 8.6l-2.4 6.8-6.8 2.4 2.4-6.8z',
  mountain: 'M3 19h18L14.4 7.6l-3.3 5.6-2-2.7z',
  // Three falls over a ledge, landing in water. The ledge is what stops it reading as a barcode.
  waterfall: 'M3.5 5h17M7.5 6.5v7M12 6.5v7M16.5 6.5v7M3.5 17.6c2-1.5 3.5-1.5 5.5 0s3.5 1.5 5.5 0 3.5-1.5 5.5 0',
  food: 'M7.6 3.5v4.6a2.3 2.3 0 0 0 4.6 0V3.5M9.9 3.5v4.6M9.9 10.4v10.1M16.6 20.5V3.5c2.1 1.7 2.8 4.5 2.8 6.7s-1.1 3.3-2.8 3.5',
  lotus: 'M12 20.6c0-5.1 3.1-9.7 8.1-11.2-.6 6.1-3.6 10.2-8.1 11.2zM12 20.6c0-5.1-3.1-9.7-8.1-11.2.6 6.1 3.6 10.2 8.1 11.2z',
  moon: 'M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z',
  bag: 'M5.6 8.4h12.8l-1 12.1H6.6zM9 8.4V6.3a3 3 0 0 1 6 0v2.1',
  // A snorkelling mask, tube on the right. Tried goggles first; two lenses at chip size merged
  // into one blur, and the tube is what makes the shape unambiguous anyway.
  snorkel: 'M4.8 8.6h13.4v3.6a4.2 4.2 0 0 1-4.2 4.2h-1.3L12 14.2l-.7 2.2H10a4.2 4.2 0 0 1-4.2-4.2zM18.2 8.6V5.4',
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
    /*
     * The tag's eyelet.
     *
     * Drawn as a filled circle rather than as part of the path: a hole small enough to be
     * in proportion at 17px has a diameter of about 2.4 units, and a stroked circle that
     * small closes up into a dot anyway — so it is a dot, deliberately, at a size that
     * survives instead of one that muddies.
     */
    case 'price-tag':
      return (
        <svg
          {...common}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={STROKE['price-tag']} />
          <circle cx="16.4" cy="7.6" r="1.35" fill={color} stroke="none" />
        </svg>
      );

    /*
     * Three stars, each on its own class so a caller can twinkle them independently.
     *
     * The transform-origin on each is set here rather than in CSS because an SVG child's default
     * origin is the viewBox corner, not the shape — scaling without it slides the star across the
     * icon instead of pulsing it in place.
     */
    case 'sparkle':
      return (
        <svg {...common} fill={color}>
          <path
            className="spark spark--1"
            style={{ transformOrigin: '12px 9.7px' }}
            d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"
          />
          <path
            className="spark spark--2"
            style={{ transformOrigin: '18.6px 18.5px' }}
            d="M18.6 15.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"
            opacity="0.85"
          />
          <path
            className="spark spark--3"
            style={{ transformOrigin: '5.6px 17.4px' }}
            d="M5.6 14.9l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"
            opacity="0.7"
          />
          {/* The outer two are deliberately the smallest: at chip size the whole mark is 13px, and
              five equal stars there would read as a smudge rather than as a constellation. */}
          <path
            className="spark spark--4"
            style={{ transformOrigin: '20px 4.8px' }}
            d="M20 2.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"
            opacity="0.6"
          />
          <path
            className="spark spark--5"
            style={{ transformOrigin: '3.5px 7.5px' }}
            d="M3.5 5.6l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"
            opacity="0.5"
          />
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
          <circle cx="8.2" cy="18.3" r="1.5" />
          <circle cx="15.8" cy="18.3" r="1.5" />
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
    case 'walk':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12.6" cy="4.2" r="1.9" />
          <path d={STROKE.walk} />
        </svg>
      );
    /* A steel pan. The Caribbean instrument reads as culture here in a way a paint palette does
       not, and it survives being drawn at 13px because it is a circle with two dents in it. */
    /* The needle alone reads as a leaf. The bezel is what makes it a compass, which is the whole
       reason it stands for "All" rather than for a category. */
    case 'compass':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.6" />
          <path d={STROKE.compass} />
        </svg>
      );
    case 'drum':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.6" />
          <circle cx="9.2" cy="10" r="2" />
          <circle cx="15" cy="13.6" r="2.4" />
        </svg>
      );
    case 'beach':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="12" cy="7.4" r="3.6" />
          <path d="M3.2 16.4c1.8-1.5 3.2-1.5 5 0s3.2 1.5 5 0 3.2-1.5 5 0M3.2 20.3c1.8-1.5 3.2-1.5 5 0s3.2 1.5 5 0 3.2-1.5 5 0" />
        </svg>
      );
    case 'bus':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <rect x="4.4" y="4.6" width="15.2" height="12" rx="2.2" />
          <path d="M4.4 11h15.2M8.6 4.6v6.4M15.4 4.6v6.4M7 16.6v1.8M17 16.6v1.8" />
        </svg>
      );
    /* An adult and a child, not three equal heads: the size difference is what carries "family"
       at this scale. */
    case 'family':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
          <circle cx="8" cy="6.9" r="2.8" />
          <circle cx="16.6" cy="10.4" r="2.2" />
          <path d="M3.6 20.4c.9-3.5 2.6-5.2 4.4-5.2s3.5 1.7 4.4 5.2M12.9 20.4c.7-2.6 2-3.9 3.7-3.9s3 1.3 3.7 3.9" />
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
