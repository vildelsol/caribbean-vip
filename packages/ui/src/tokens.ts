/**
 * Caribbean VIP design tokens.
 *
 * PRD §16: "clean, bright, premium but inclusive, warm neutral backgrounds, deep Caribbean green,
 * turquoise and restrained coral/gold accents. Keep the mobile interface readable outdoors."
 *
 * Greens, turquoises, gold and the sand background are sampled from the supplied brand mockup,
 * which is a colour reference only — none of its layout, branding or navigation is a requirement.
 * Coral is not present in the mockup; it is chosen to harmonize and marked `chosen` below.
 *
 * Outdoor readability is a hard constraint, so the pairings that carry text are contrast-tested
 * in `tokens.test.ts` rather than eyeballed.
 */

export const palette = {
  /** Warm neutral app background. */
  sand: '#FBF1E3',
  sandDeep: '#F3E6D2',
  sandRaised: '#FFFFFF',

  /**
   * Deep Caribbean green — primary brand, headers, bottom navigation.
   *
   * Darkened from the first sampling to match the customer-journey mockups, whose crest and header
   * green is nearly black. The luxe reading depends on that depth: at the original #073A32 the gold
   * sat too close in value and the whole thing read tropical rather than premium.
   */
  green950: '#04211C',
  green900: '#052D27',
  green700: '#0B4E46',
  green500: '#1F5C54',

  turquoise: '#10828A',
  turquoiseLight: '#97CFE4',

  /**
   * Gold — premium accent. Only on dark surfaces; use `goldDeep` for text on sand.
   *
   * A classic metallic gold rather than the softer sand-gold, again to match the mockups' crest.
   * `goldDeep` stays darker because gold on a light background is the one pairing that fails
   * contrast, and `tokens.test.ts` asserts it rather than trusting the eye.
   */
  gold: '#D4AF37',
  goldDeep: '#8F7628',

  /** chosen, not sampled — restrained accent for expiry, alerts, destructive actions. */
  coral: '#D9694F',

  /** Warm ivory, closer to the mockups' card and voucher surfaces than pure white. */
  ivory: '#FBF7EE',

  ink: '#12211D',
  inkMuted: '#4A5A55',
  border: '#E2D6C2',

  success: '#1F7A5C',
  warning: '#B8791F',
  danger: '#B23A26',
} as const;

export type PaletteToken = keyof typeof palette;

/** Semantic roles. Components reference these, not raw palette entries. */
export const semantic = {
  background: palette.sand,
  surface: palette.sandRaised,
  surfaceSunken: palette.sandDeep,
  border: palette.border,

  textPrimary: palette.ink,
  textMuted: palette.inkMuted,
  textOnDark: palette.sand,
  textAccent: palette.goldDeep,

  brand: palette.green900,
  brandDeep: palette.green950,
  brandActive: palette.green700,
  accent: palette.turquoise,
  premium: palette.gold,
  alert: palette.coral,

  navBackground: palette.green950,
  navActive: palette.gold,
  navInactive: '#8FB0A8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Minimum body size is 16 — smaller text is not reliably readable on a beach in direct sun,
 * which PRD §16 calls out explicitly.
 */
export const typography = {
  display: { size: 32, weight: '700', lineHeight: 38 },
  title: { size: 24, weight: '700', lineHeight: 30 },
  heading: { size: 20, weight: '600', lineHeight: 26 },
  body: { size: 16, weight: '400', lineHeight: 24 },
  bodyStrong: { size: 16, weight: '600', lineHeight: 24 },
  caption: { size: 14, weight: '400', lineHeight: 20 },
} as const;

export const elevation = {
  card: {
    shadowColor: palette.green900,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

// ---------------------------------------------------------------------------
// Contrast utilities — used by the token test, and available to components.
// ---------------------------------------------------------------------------

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
