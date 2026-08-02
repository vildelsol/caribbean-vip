import { describe, expect, it } from 'vitest';
import { contrastRatio, palette, semantic, typography } from './tokens';

/**
 * PRD §16 requires the mobile interface to stay readable outdoors. These assertions hold the
 * palette to WCAG AA (4.5:1 for body text, 3:1 for large text and UI boundaries) so a future
 * palette tweak cannot quietly break legibility in sunlight.
 */
describe('outdoor readability', () => {
  it('body text on the sand background clears AA comfortably', () => {
    expect(contrastRatio(semantic.textPrimary, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text on sand still clears AA', () => {
    expect(contrastRatio(semantic.textMuted, semantic.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the deep green brand surface clears AA', () => {
    expect(contrastRatio(semantic.textOnDark, semantic.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it('gold is legible on the dark nav, which is the only place it carries text', () => {
    expect(contrastRatio(semantic.navActive, semantic.navBackground)).toBeGreaterThanOrEqual(3);
  });

  it('accent gold on sand uses goldDeep, because plain gold fails on light backgrounds', () => {
    // The guard rail: this documents *why* semantic.textAccent is goldDeep and not gold.
    expect(contrastRatio(palette.gold, palette.sand)).toBeLessThan(4.5);
    expect(contrastRatio(semantic.textAccent, semantic.background)).toBeGreaterThanOrEqual(3);
  });

  it('the coral alert accent is distinguishable on sand', () => {
    expect(contrastRatio(semantic.alert, semantic.background)).toBeGreaterThanOrEqual(3);
  });

  it('inactive nav items remain visible against the nav background', () => {
    expect(contrastRatio(semantic.navInactive, semantic.navBackground)).toBeGreaterThanOrEqual(3);
  });

  it('body type is never smaller than 16pt', () => {
    expect(typography.body.size).toBeGreaterThanOrEqual(16);
    expect(typography.bodyStrong.size).toBeGreaterThanOrEqual(16);
  });
});

describe('palette integrity', () => {
  it('every token is a 6-digit hex value', () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, name).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
