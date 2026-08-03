/**
 * Caribbean VIP design tokens.
 *
 * PRD §16: "clean, bright, premium but inclusive, warm neutral backgrounds, deep Caribbean green,
 * turquoise and restrained coral/gold accents. Keep the mobile interface readable outdoors."
 *
 * ---------------------------------------------------------------------------
 * Source: the "Caribbean VIP Journey" design (2026-08-03)
 * ---------------------------------------------------------------------------
 *
 * Every value below is taken from `docs/design-source/Screen.dc.html`, the nine-screen prototype
 * exported from Claude Design. That design **supersedes the VIP Cayman mockup** which governed
 * until now; HANDOVER §4 records the change and what it overturned.
 *
 * Two of its rulings reverse earlier ones, deliberately:
 *
 *  - **Turquoise is back, as ocean teal.** The previous pass removed it on the grounds that it
 *    appeared nowhere in the VIP Cayman mockup's interface. The new design gives it a specific job
 *    — location, distance and discovery — which is exactly the role PRD §16 always implied. It is
 *    not decoration here; it is the colour that means "where".
 *  - **Green is darker and colder.** `#0C4A3F` against the old `#173A31`.
 *
 * ---------------------------------------------------------------------------
 * Why some tokens have a `…Text` sibling
 * ---------------------------------------------------------------------------
 *
 * The design is a web prototype rendered on a desktop display, and several of its colours are used
 * for 9–12px text at ratios that fail WCAG AA on the ivory background:
 *
 *      ocean teal on ivory   4.40:1        muted #6C7F78   4.18:1
 *      muted gold on ivory   2.82:1        muted #7A8B85   3.52:1
 *      soft coral on ivory   3.65:1        muted #8A9A93   2.74:1
 *
 * PRD §16 makes outdoor readability a hard constraint and none of these sizes qualify for the 3:1
 * large-text allowance, so the raw values cannot carry text. Rather than repaint the design, each
 * role keeps the design's colour for **fills, icons, rings and decoration** and gains a darkened
 * sibling for **text**. The two read as the same hue at a glance; the difference only shows up
 * where it has to. `tokens.test.ts` asserts every text pairing, so this cannot quietly collapse.
 */

/**
 * ---------------------------------------------------------------------------
 * MIGRATION SHIM — delete an entry as each screen stops using it
 * ---------------------------------------------------------------------------
 *
 * The Caribbean VIP Journey design replaces the VIP Cayman palette wholesale, and the React Native
 * screens drawn to the old one are being migrated a screen at a time. These aliases keep the app
 * compiling in between, and they map each retired token onto whichever new role it actually played
 * — so an unmigrated screen picks up the new palette rather than sitting at a stale colour.
 *
 * They are not a compatibility layer to keep. The migration is finished when this object is empty
 * and the spread below is gone; until then, `grep -rn 'goldDeep\|goldTop\|ratingStar'` is the list.
 */
const deprecated = {
  /** → `goldText`. Same role: the only gold that may carry text on ivory. */
  goldDeep: '#7A6420',
  /** → `goldLight` / `gold`. The old gold button gradient; the new design has no gold gradient. */
  goldTop: '#E3C271',
  goldBottom: '#B98D2F',
  /** → `green900`. The success badge's foreground. */
  success: '#0C4A3F',
  /** → `goldText`. The pending badge's foreground. */
  warning: '#7A6420',
  /** → `gold`. The new design's rating star is the muted gold, not a separate amber. */
  ratingStar: '#B98D2F',
} as const;

export const palette = {
  // -------------------------------------------------------------------------
  // Surfaces
  // -------------------------------------------------------------------------

  /** Warm ivory — the app background and the surface behind every screen. */
  ivory: '#FBF6EC',
  /** Cards and the bottom navigation. Fractionally above the background. */
  ivoryRaised: '#FFFDF7',
  /** Sunken strips, disabled chips, the "suggested" state. */
  ivorySunken: '#F4EFE4',
  /** The checkout sheet, which is deliberately the calmest surface in the app. */
  ivoryCalm: '#FFFDFA',
  /** The voucher and ticket stock — a shade warmer than a card, as printed stock is. */
  ivoryTicket: '#FDFAF1',

  // -------------------------------------------------------------------------
  // Green — brand and primary action
  // -------------------------------------------------------------------------

  /** Deep Caribbean green. Brand, primary action, the raised Irie disc. 9.4:1 on ivory. */
  green900: '#0C4A3F',
  /** The darkest value in the design — full-bleed backgrounds for Offer, Ticket and Irie. */
  green950: '#073229',
  /** The phone bezel in the prototype, and the darkest ink. */
  green980: '#101E1A',
  /** Pressed and hover states for a green surface. */
  green700: '#0F5F58',

  // -------------------------------------------------------------------------
  // Ocean teal — location, distance, discovery
  // -------------------------------------------------------------------------

  /**
   * The design's teal. Position markers, proximity rings, the "you are here" dot, inline links.
   *
   * 4.40:1 on ivory — just under AA, so `tealText` carries the copy.
   */
  teal: '#1E7F86',
  /** Darkened for text: distances, "See all", "4 MIN AWAY", availability lines. 5.1:1 on ivory. */
  tealText: '#1A6E74',
  /** Pale aqua — selected and informational chip fills. Carries `green900` at 8.4:1. */
  aqua: '#DDEDE8',
  /** The softer aqua of a "Confirmed" chip. */
  aquaSoft: '#EAF3EF',

  // -------------------------------------------------------------------------
  // Gold — offers, ratings, rewards
  // -------------------------------------------------------------------------

  /** Muted gold. Fills, the rating star, the voucher icon tile, rings. Decorative only: 2.8:1. */
  gold: '#B98D2F',
  /** The brighter gold used on dark green — headings, sparkles, "BOOKING CONFIRMED". */
  goldLight: '#E3C271',
  /** The only gold that may carry text on ivory. 5.1:1 on the sand chip, 5.3:1 on ivory. */
  goldText: '#7A6420',
  /** Sand — the offer chip and voucher-applied strip. */
  sand: '#FBF1DA',
  /** The sand card's hairline. */
  sandBorder: '#EBDFC0',

  // -------------------------------------------------------------------------
  // Coral — scarcity and urgency, never anything else
  // -------------------------------------------------------------------------

  /** Soft coral. Dots, badges, the notification pip. 3.65:1 — decorative. */
  coral: '#CE5F44',
  /** Darkened for text: "Nearly full · 6 spots left", "Leave by 8:25 AM". 4.9:1 on ivory. */
  coralText: '#B04227',

  // -------------------------------------------------------------------------
  // Ink
  // -------------------------------------------------------------------------

  /** Headings and body copy. 13.1:1 on ivory. */
  ink: '#16302A',
  /** Secondary copy. Darkened from the design's #3C534C-and-lighter set to clear AA. */
  inkMuted: '#4A5F58',
  /**
   * The quietest ink that may still carry text — demo labels, field captions.
   *
   * The design uses #8A9A93 here (2.74:1). That is the single largest readability problem in it:
   * the "DEMO INVENTORY · SAMPLE PRICING" line is the one piece of copy that must survive being
   * photographed in sunlight, because it is what stops a screenshot being mistaken for live
   * pricing. Darkened to clear AA.
   */
  inkFaint: '#5E7269',

  /** Hairlines. */
  border: '#EFE7D6',
  borderStrong: '#E2D9C4',
  borderCool: '#CFDCD6',

  // -------------------------------------------------------------------------
  // Map
  // -------------------------------------------------------------------------

  /**
   * The stylised map's land, water and roads.
   *
   * The design draws the map as abstract shapes rather than tiles, which is what makes the Nearby
   * screen buildable while OD-05 is still open — no provider, no API key, no attribution. It is
   * also why it must never be presented as a real map: it shows relative position, not geography.
   */
  mapLand: '#E6EFEA',
  mapLandAlt: '#DEEBE5',
  mapWater: '#CFE4E4',
  mapWaterAlt: '#D3E6E4',
  mapGreen: '#DCE9E1',
  mapRoad: '#F3EBDA',

  // Retired tokens, mapped onto their new roles. See the note above `deprecated`.
  ...deprecated,
} as const;

export type PaletteToken = keyof typeof palette;

/** Semantic roles. Components reference these, not raw palette entries. */
export const semantic = {
  background: palette.ivory,
  surface: palette.ivoryRaised,
  surfaceSunken: palette.ivorySunken,
  surfaceCalm: palette.ivoryCalm,
  surfaceTicket: palette.ivoryTicket,
  /** Full-bleed dark screens: the offer, the ticket, Irie. */
  surfaceDeep: palette.green950,

  border: palette.border,
  borderStrong: palette.borderStrong,

  textPrimary: palette.ink,
  textMuted: palette.inkMuted,
  textFaint: palette.inkFaint,
  textOnDark: '#FFFDF7',

  brand: palette.green900,
  brandDeep: palette.green950,
  brandActive: palette.green700,

  /**
   * Location, distance and discovery — the teal role.
   *
   * `locator` is the fill (pins, rings, dots); `locatorText` is the copy. They are different
   * values only because the design's teal is 4.40:1 on ivory and the copy it carries is 10–12px.
   */
  locator: palette.teal,
  locatorText: palette.tealText,
  locatorTint: palette.aqua,
  locatorTintSoft: palette.aquaSoft,

  /** Offers, ratings and rewards — the gold role. Same fill/text split, same reason. */
  premium: palette.gold,
  premiumOnDark: palette.goldLight,
  premiumText: palette.goldText,
  premiumTint: palette.sand,
  premiumTintBorder: palette.sandBorder,

  /** Scarcity and urgency only. Never a general alert colour. */
  urgent: palette.coral,
  urgentText: palette.coralText,

  /** Prices are deep green in this design, not teal and not ink. */
  price: palette.green900,

  /** The bottom navigation is raised ivory with a hairline above it. */
  navBackground: palette.ivoryRaised,
  navBorder: '#EAE1CE',
  navActive: palette.green900,
  navInactive: palette.inkFaint,

  // --- MIGRATION SHIM. See `deprecated` above; delete each as its screens are redrawn. ---
  /** → `locatorText`. Inline links and steppers are teal in the new design, not green. */
  accent: palette.tealText,
  /** → `urgentText`. */
  alert: palette.coralText,
  /** → `premiumText`. */
  textAccent: palette.goldText,
  /** → `locatorTintSoft`. */
  tintBrand: palette.aquaSoft,
  /** → `locatorTint`. */
  tintSuccess: palette.aqua,
  /** → `premiumTint`. */
  tintPremium: palette.sand,
  tintOffer: palette.sand,
  tintWarning: palette.sand,
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
 * Corner radii, measured off the design at its 390pt phone width.
 *
 * Rounder than the previous scale throughout: chips are pills, cards 18–22, sheets and modals 26.
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  pill: 999,
} as const;

/**
 * Type families.
 *
 * Cormorant Garamond carries the editorial voice — destination titles, experience names, the
 * celebration on the confirmation screen, "Wah Gwaan!". Manrope carries the interface: cards,
 * prices, navigation, every number a guest acts on.
 *
 * This replaces Playfair Display and DM Sans. Cormorant is a lighter, higher-contrast garalde and
 * it is why the new screens read editorial rather than luxe-hotel; Manrope is squarer and more
 * legible at 10–12px than DM Sans, which matters because this design puts a great deal of meaning
 * into small type.
 *
 * Bundled via `expo-font` so the demo renders identically wherever it is opened.
 */
export const fonts = {
  display: 'CormorantGaramond_600SemiBold',
  displayLight: 'CormorantGaramond_500Medium',
  sans: 'Manrope_500Medium',
  sansRegular: 'Manrope_400Regular',
  sansMedium: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  sansHeavy: 'Manrope_800ExtraBold',
} as const;

/**
 * Text styles.
 *
 * These are spread directly into React Native `Text` styles, so every key has to be a real style
 * prop. They were once `size`/`weight`/`lineHeight` — keys React Native ignores in silence, which
 * meant no font size or weight in the app was ever applied. `tokens.test.ts` guards both halves.
 *
 * The design uses type as small as 8.5px for chip labels. Those are **not** reproduced literally:
 * `micro` floors at 11 and `overline` at 12. PRD §16 requires this to be usable one-handed,
 * outdoors, in sun, and a 9px letterspaced cap fails that regardless of its contrast ratio. The
 * design's proportions are kept; its floor is not.
 */
export const typography = {
  /** The editorial serif. Destination titles, experience names, celebration copy. */
  display: {
    fontFamily: fonts.display,
    fontSize: 33,
    fontWeight: '600' as const,
    lineHeight: 36,
    letterSpacing: -0.2,
  },
  displayMedium: {
    fontFamily: fonts.display,
    fontSize: 27,
    fontWeight: '600' as const,
    lineHeight: 30,
  },
  displaySmall: {
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '600' as const,
    lineHeight: 26,
  },
  /** Section headers — "Experience of the Day", "Hidden Gems", "Day timeline". */
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '600' as const,
    lineHeight: 25,
  },

  title: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  /** Prices and totals — the heaviest weight in the interface, as the design sets them. */
  amount: {
    fontFamily: fonts.sansHeavy,
    fontSize: 22,
    fontWeight: '800' as const,
    lineHeight: 26,
  },
  amountSmall: {
    fontFamily: fonts.sansHeavy,
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 20,
  },

  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: '500' as const,
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
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  captionStrong: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  /** The smallest type in the app. Chip labels, timeline times, card meta. */
  micro: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 15,
  },
  microStrong: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 15,
  },
  /** Letterspaced caps — "CARIBBEAN VIP", "NEXT UP", "DEMO INVENTORY", nav labels. */
  overline: {
    fontFamily: fonts.sansHeavy,
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 15,
    letterSpacing: 1.5,
  },
} as const;

export const elevation = {
  /** Cards — soft, wide and nearly colourless, so they lift off the ivory rather than outline. */
  card: {
    shadowColor: '#072821',
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  /** Sheets that float over content: the selected map card, the search pill, the nav badge. */
  raised: {
    shadowColor: '#072821',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  /** Modals over a dark screen — the offer voucher. */
  modal: {
    shadowColor: '#031410',
    shadowOpacity: 0.5,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
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
