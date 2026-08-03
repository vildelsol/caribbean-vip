/**
 * Caribbean VIP design tokens.
 *
 * PRD §16: "clean, bright, premium but inclusive, warm neutral backgrounds, deep Caribbean green,
 * turquoise and restrained coral/gold accents. Keep the mobile interface readable outdoors."
 *
 * Every value below is sampled from the VIP Cayman customer-journey mockup, which HANDOVER §4
 * records as the governing aesthetic. Sampling was done per-region on the 2760px capture, taking
 * the modal (most frequent) colour of a flat area rather than an average, because averaging across
 * a card edge or a glyph returns a colour that appears nowhere in the image. The earlier palette
 * was averaged, and that is why it read muddy and too dark.
 *
 * The correction that matters most: the mockup's chrome is **ivory, not green**. The bottom
 * navigation, the status bar and the surface behind every screen are all `#FCF9F4`. Deep green
 * appears only on primary buttons, the crest and small badges. Reading the green as chrome
 * inverted the value structure of the whole design.
 *
 * Outdoor readability is a hard constraint, so the pairings that carry text are contrast-tested in
 * `tokens.test.ts` rather than eyeballed.
 */

export const palette = {
  /**
   * Warm ivory — the app background, the bottom navigation and the status bar.
   *
   * Sampled at `#FCF9F4` in five independent flat regions (the nav bar on three screens, the sheet
   * behind the detail page, the voucher modal). It is much lighter than the `#FBF1E3` sand it
   * replaces: the mockup's warmth comes from a faint cream cast, not from a tan background.
   */
  ivory: '#FCF9F4',
  /** One step down — category tiles, stat tiles, the strip behind a screen title. `#FAF5EC`. */
  ivorySunken: '#FAF5EC',
  /** Cards sit fractionally above the background; the separation is carried by the hairline. */
  ivoryRaised: '#FFFDF9',

  /**
   * The accent green — prices, "View All", the selected nav item, the location pin.
   *
   * Lighter and far more saturated than the brand green, because in the mockup green is not only
   * chrome: it is the colour that *carries* information on an ivory card. "from $25 USD" is green,
   * not ink. At 5.0:1 on ivory it clears AA for text, which the near-black brand green does too but
   * without reading as an accent at all — a price in `green900` is indistinguishable from the title
   * above it, and the card loses its hierarchy.
   */
  greenAccent: '#1F7A5C',

  /**
   * Deep green — the crest, and the darkest value in the design.
   *
   * Not black. Sampled off the crest's opaque upper arc at `#0C2B25`.
   */
  green950: '#0C2B25',
  /**
   * Primary buttons. Sampled at `#193B33` (Check Availability), `#183830` (View Ticket) and
   * `#173730` (the Upcoming pill) — one colour used consistently, so this is their centre.
   */
  green900: '#173A31',
  green700: '#215247',
  green500: '#2E6A5D',

  turquoise: '#10828A',
  turquoiseLight: '#97CFE4',

  /**
   * Gold.
   *
   * The mockup's gold buttons are a vertical gradient, sampled `#E2BC70` at the top and `#BB9347`
   * at the bottom; `gold` is that gradient's midpoint and `goldTop`/`goldBottom` reproduce it.
   * `goldLight` is the brighter metallic of the crest ring and the rating stars. `goldDeep` is the
   * only gold that may carry text on ivory — the others fail contrast, and the token test asserts
   * exactly that so the distinction cannot be quietly collapsed.
   */
  gold: '#C9A257',
  goldTop: '#E2BC70',
  goldBottom: '#BB9347',
  goldLight: '#E4C173',
  /**
   * The only gold that may carry text — on ivory *and* on the gold tints.
   *
   * Darkened from `#8A6D24` when the tint contrast test went red: the old value cleared ivory but
   * sat at 3.9:1 on the sand "Top Rated" badge and 4.3:1 inside an Irie Tip, both of which are
   * 11–13pt and therefore need the full 4.5. Lightening the tints instead was tried and rejected —
   * it walked the mockup's sand up to a pale yellow. It is the ink that was wrong, not the wash.
   */
  goldDeep: '#7E6118',

  /**
   * The rating star, sampled at `#FFA100`.
   *
   * True amber rather than the brand gold — the mockup's stars are noticeably brighter and warmer
   * than its metallic gold, and at card size the two are not interchangeable. It is 1.9:1 on ivory
   * and therefore decorative only: the numeric rating sits beside it in ink and carries the meaning,
   * which is what keeps the pairing accessible.
   */
  ratingStar: '#FFA100',

  /** chosen, not sampled — restrained accent for expiry, alerts, destructive actions. */
  coral: '#C2543A',

  /** Near-black warm neutral for headings and body copy. */
  ink: '#1C1F1D',
  inkMuted: '#5E6360',
  /** The hairline that separates a card from the ivory behind it. Warm, and very close in value. */
  border: '#EDE3D3',

  /**
   * Tints — the pale washes behind badges, callouts and the "Use My Location" card.
   *
   * These are the colours a screen is most tempted to write inline, because each one is used once
   * or twice and reads as incidental. They are not: five different hand-mixed pale greens across
   * five screens is exactly how a palette comes apart, and the vendor portal is about to need the
   * same set. Each is its accent desaturated onto ivory, and each carries only the accent's own
   * text colour — the pairings are contrast-tested in `tokens.test.ts`.
   */
  tintGreen: '#F1F6F2',
  tintSuccess: '#E8F4ED',
  tintGold: '#F7EFDD',
  tintOffer: '#F5E4BE',
  tintWarning: '#F7EADA',

  success: '#1F7A5C',
  /** Darkened alongside `goldDeep` so the "pending" badge clears AA on its own tint. */
  warning: '#905E0C',
  danger: '#A83A26',
} as const;

export type PaletteToken = keyof typeof palette;

/** Semantic roles. Components reference these, not raw palette entries. */
export const semantic = {
  background: palette.ivory,
  surface: palette.ivoryRaised,
  surfaceSunken: palette.ivorySunken,
  border: palette.border,

  textPrimary: palette.ink,
  textMuted: palette.inkMuted,
  textOnDark: '#FFFFFF',
  textAccent: palette.goldDeep,

  brand: palette.green900,
  brandDeep: palette.green950,
  brandActive: palette.green700,
  /**
   * The interactive accent — inline links, steppers, "Try again".
   *
   * Deep green, not turquoise. PRD §16 lists turquoise as a brand colour and it was wired up here
   * as the accent, but the mockup uses **no turquoise anywhere in the interface**: it lives in the
   * photography, which is where a sea colour belongs. Every link rendering turquoise on ivory read
   * as a different product's UI dropped into this one. `palette.turquoise` stays available for
   * illustration and charts.
   */
  accent: palette.greenAccent,
  /** Prices and other figures a guest scans for. Green in the mockup, not ink. */
  price: palette.greenAccent,
  premium: palette.gold,
  alert: palette.coral,

  /** Tinted surfaces. Paired with their accent's text colour, never with muted ink. */
  tintBrand: palette.tintGreen,
  tintSuccess: palette.tintSuccess,
  tintPremium: palette.tintGold,
  tintOffer: palette.tintOffer,
  tintWarning: palette.tintWarning,

  /**
   * The bottom navigation is ivory, matching the mockup, with a hairline above it and ink icons.
   * It was deep green here, which is the single largest reason the app did not look like the
   * design: it put the heaviest value in the composition along the bottom edge of every screen.
   */
  navBackground: palette.ivory,
  navBorder: palette.border,
  navActive: palette.green900,
  navInactive: '#8C918D',
  /** The filled disc behind the selected tab's icon. */
  navActiveBadge: palette.greenAccent,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Corner radii, measured off the mockup at its rendered phone width.
 *
 * The mockup is consistently rounder than the previous scale allowed: cards are 16, photo panels
 * and modals 24, and both button weights on the welcome screen are full pills.
 */
export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type families.
 *
 * The mockup sets display copy — "Cayman Islands", "Free Rum Punch Included", the crest's "VIP" —
 * in a high-contrast didone serif, and everything else in a geometric sans. Playfair Display and
 * DM Sans are the closest freely licensed matches and are bundled via `expo-font`, so the demo does
 * not depend on what happens to be installed on the viewing machine.
 *
 * Screens reference `typography`, not these names directly.
 */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayMedium: 'PlayfairDisplay_600SemiBold',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansBold: 'DMSans_700Bold',
} as const;

/**
 * Text styles.
 *
 * These are spread directly into React Native `Text` styles in ~180 places, so the keys have to be
 * real style props. They were `size`/`weight`/`lineHeight`, and React Native silently ignores the
 * first two — which meant that until now **no font size or weight in the app was ever applied**.
 * Every screen rendered at the platform default. That single defect accounts for most of the
 * distance between the build and the mockup, and it is why the hierarchy read flat.
 *
 * Minimum body size is 16 — smaller text is not reliably readable on a beach in direct sun, which
 * PRD §16 calls out explicitly, and the token test holds the line.
 */
export const typography = {
  /** The serif display face. Screen titles, the crest, the voucher headline. */
  display: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 38,
    letterSpacing: -0.2,
  },
  displaySmall: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fonts.sansBold,
    fontSize: 19,
    fontWeight: '700' as const,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  captionStrong: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  /** Small letterspaced caps — button labels, badges, "TODAY ONLY!", the nav labels. */
  overline: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
    letterSpacing: 1.4,
  },
} as const;

export const elevation = {
  /**
   * The mockup's cards cast a soft, wide, almost colourless shadow — they read as lifted off the
   * ivory rather than outlined on it. Paired with the hairline, not instead of it.
   */
  card: {
    shadowColor: '#3A2E1C',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  /** Primary buttons and the raised Irie badge sit higher. */
  raised: {
    shadowColor: '#1B2C22',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
