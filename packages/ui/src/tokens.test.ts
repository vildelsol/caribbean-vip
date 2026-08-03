import { describe, expect, it } from 'vitest';
import { contrastRatio, palette, semantic, typography } from './tokens';

/**
 * PRD §16 requires the mobile interface to stay readable outdoors. These assertions hold the
 * palette to WCAG AA (4.5:1 for body text, 3:1 for large text and UI boundaries) so a future
 * palette tweak cannot quietly break legibility in sunlight.
 */
describe('outdoor readability', () => {
  it('body text on the ivory background clears AA comfortably', () => {
    expect(contrastRatio(semantic.textPrimary, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text on ivory still clears AA', () => {
    expect(contrastRatio(semantic.textMuted, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the deep green brand surface clears AA', () => {
    expect(contrastRatio(semantic.textOnDark, semantic.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('the selected nav item reads against the ivory nav bar', () => {
    // The nav bar is ivory in the mockup, so the active item is deep green rather than gold.
    expect(contrastRatio(semantic.navActive, semantic.navBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('inactive nav items remain visible against the nav background', () => {
    expect(contrastRatio(semantic.navInactive, semantic.navBackground)).toBeGreaterThanOrEqual(3);
  });

  it('accent gold on ivory uses goldDeep, because plain gold fails on light backgrounds', () => {
    // The guard rail: this documents *why* semantic.textAccent is goldDeep and not gold.
    expect(contrastRatio(palette.gold, palette.ivory)).toBeLessThan(4.5);
    expect(contrastRatio(semantic.textAccent, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('a gold button carries deep green text, not white', () => {
    // The mockup's gold buttons are letterspaced deep-green caps, and that is also the only
    // pairing that passes: white on this gold is 2.4:1 and unreadable in sun.
    expect(contrastRatio(semantic.brand, palette.gold)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', palette.gold)).toBeLessThan(3);
  });

  it('the crest ring reads against the crest field', () => {
    expect(contrastRatio(palette.goldLight, palette.green950)).toBeGreaterThanOrEqual(4.5);
  });

  it('the coral alert accent is distinguishable on ivory', () => {
    expect(contrastRatio(semantic.alert, semantic.background)).toBeGreaterThanOrEqual(3);
  });

  it('every tinted surface carries its own accent at AA', () => {
    // Tints are the colours a screen is most tempted to hand-mix inline, and a pale wash that is
    // half a step too dark takes its text below AA without looking wrong on a desk monitor. Each
    // pairing here is one that actually ships: the badge tones, the Irie Tip, the location card.
    const pairs: [string, string, string][] = [
      ['success badge', palette.success, semantic.tintSuccess],
      ['offer badge', palette.goldDeep, semantic.tintOffer],
      ['pending badge', palette.warning, semantic.tintWarning],
      ['Irie Tip', palette.goldDeep, semantic.tintPremium],
      ['Use My Location', semantic.accent, semantic.tintBrand],
    ];
    for (const [name, fg, bg] of pairs) {
      expect(contrastRatio(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('body type is never smaller than 16pt', () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.bodyStrong.fontSize).toBeGreaterThanOrEqual(16);
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
});

describe('palette integrity', () => {
  it('every token is a 6-digit hex value', () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, name).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
