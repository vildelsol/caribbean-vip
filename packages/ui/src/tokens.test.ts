import { describe, expect, it } from 'vitest';
import { contrastRatio, palette, semantic, typography } from './tokens';

/**
 * PRD §16 requires the mobile interface to stay readable outdoors. These assertions hold the
 * palette to WCAG AA (4.5:1 for body text, 3:1 for large text and UI boundaries) so a future
 * palette tweak cannot quietly break legibility in sunlight.
 *
 * They matter more since the Caribbean VIP Journey design landed than they did before. That design
 * is a web prototype rendered on a desktop display, and seven of its thirteen text pairings failed
 * AA when measured — ocean teal at 4.40:1, muted gold at 2.82:1, its faintest grey at 2.74:1. The
 * fill/text token split exists because of this suite, and this suite is what stops the split being
 * quietly collapsed back later by someone reaching for the "real" design colour.
 */
describe('outdoor readability', () => {
  it('body text on the ivory background clears AA comfortably', () => {
    expect(contrastRatio(semantic.textPrimary, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text on ivory and on a card clears AA', () => {
    expect(contrastRatio(semantic.textMuted, semantic.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semantic.textMuted, semantic.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('the faintest ink still clears AA, because it carries the demo labels', () => {
    // "DEMO INVENTORY · SAMPLE PRICING" is the one line that must survive being photographed in
    // sunlight: it is what stops a screenshot being mistaken for live pricing. The source design
    // sets it in #8A9A93 at 2.74:1, which is the largest readability defect in it.
    expect(contrastRatio(semantic.textFaint, semantic.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semantic.textFaint, semantic.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the deep green brand surface clears AA', () => {
    expect(contrastRatio(semantic.textOnDark, semantic.brand)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semantic.textOnDark, semantic.surfaceDeep)).toBeGreaterThanOrEqual(4.5);
  });

  it('the bright gold reads on dark green, where the design uses it', () => {
    expect(contrastRatio(semantic.premiumOnDark, semantic.surfaceDeep)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semantic.premiumOnDark, semantic.brand)).toBeGreaterThanOrEqual(4.5);
  });

  describe('the fill/text split', () => {
    /**
     * Each of these three roles keeps the design's colour for fills and decoration, and darkens it
     * for copy. Both halves are asserted: the fill is allowed to fail AA (it carries no text), and
     * the text sibling must pass — but the fill must still clear 3:1 as a UI boundary, or the pin
     * and ring shapes disappear against the ivory.
     */
    it('ocean teal: the fill is decorative, the text sibling carries copy', () => {
      expect(contrastRatio(semantic.locator, semantic.background)).toBeLessThan(4.5);
      expect(contrastRatio(semantic.locator, semantic.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(semantic.locatorText, semantic.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(semantic.locatorText, semantic.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('gold: the fill is decorative, the text sibling carries copy', () => {
      expect(contrastRatio(semantic.premium, semantic.background)).toBeLessThan(4.5);
      expect(contrastRatio(semantic.premiumText, semantic.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(semantic.premiumText, semantic.premiumTint)).toBeGreaterThanOrEqual(4.5);
    });

    it('coral: the fill is decorative, the text sibling carries copy', () => {
      expect(contrastRatio(semantic.urgent, semantic.background)).toBeLessThan(4.5);
      expect(contrastRatio(semantic.urgent, semantic.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(semantic.urgentText, semantic.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(semantic.urgentText, semantic.surface)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('every tinted chip carries its own accent at AA', () => {
    const pairs: [string, string, string][] = [
      ['aqua chip', semantic.brand, semantic.locatorTint],
      ['soft aqua chip', semantic.brand, semantic.locatorTintSoft],
      ['sand chip', semantic.premiumText, semantic.premiumTint],
      ['sunken chip', semantic.textMuted, semantic.surfaceSunken],
      ['ticket stock', semantic.textPrimary, semantic.surfaceTicket],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(contrastRatio(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the price colour reads against every surface it sits on', () => {
    for (const surface of [semantic.background, semantic.surface, semantic.surfaceTicket]) {
      expect(contrastRatio(semantic.price, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('inactive nav items remain visible against the nav background', () => {
    expect(contrastRatio(semantic.navActive, semantic.navBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semantic.navInactive, semantic.navBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('body type is never smaller than 16pt, and nothing is smaller than 11', () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.bodyStrong.fontSize).toBeGreaterThanOrEqual(16);
    // The source design goes down to 8.5px for chip labels. Reproducing that literally would fail
    // PRD §16 regardless of contrast, so the scale is kept and the floor is not.
    for (const [name, style] of Object.entries(typography)) {
      expect(style.fontSize, `${name}.fontSize`).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('typography tokens are real style props', () => {
  /**
   * Regression guard. These objects are spread straight into React Native `Text` styles, and the
   * first version of them used `size`/`weight` — keys React Native ignores in silence, so no font
   * size or weight in the app was ever applied and every screen rendered at the platform default.
   * Nothing surfaced it, because a spread of unknown keys is not an error.
   */
  it('every text style sets fontSize, lineHeight and a family', () => {
    for (const [name, style] of Object.entries(typography)) {
      expect(typeof style.fontSize, `${name}.fontSize`).toBe('number');
      expect(typeof style.lineHeight, `${name}.lineHeight`).toBe('number');
      expect(typeof style.fontFamily, `${name}.fontFamily`).toBe('string');
    }
  });

  it('no text style carries the ignored legacy keys', () => {
    for (const [name, style] of Object.entries(typography)) {
      expect(style, name).not.toHaveProperty('size');
      expect(style, name).not.toHaveProperty('weight');
    }
  });

  it('line height always leaves room for the glyphs', () => {
    for (const [name, style] of Object.entries(typography)) {
      expect(style.lineHeight, `${name}.lineHeight`).toBeGreaterThanOrEqual(style.fontSize);
    }
  });
});

describe('palette integrity', () => {
  it('every token is a 6-digit hex value', () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, name).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
