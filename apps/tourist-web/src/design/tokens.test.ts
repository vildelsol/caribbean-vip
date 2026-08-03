import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette } from '@cvip/ui';

/**
 * The CSS mirror must not drift from the TypeScript tokens.
 *
 * `tokens.css` exists because the web app styles in CSS rather than in style objects, but the
 * authority is `packages/ui/src/tokens.ts` — the same file the React Native app reads, and the one
 * whose contrast assertions guarantee outdoor readability. Two representations of one palette is a
 * standing invitation for them to disagree, and a colour that is right in TypeScript and stale in
 * CSS is invisible until someone photographs a screen.
 *
 * This test is the join between them: every custom property that names a palette token must carry
 * that token's exact value.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

function cssVar(name: string): string | null {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** CSS custom property → the `palette` key it mirrors. */
const MIRRORED: Record<string, keyof typeof palette> = {
  ivory: 'ivory',
  'ivory-raised': 'ivoryRaised',
  'ivory-sunken': 'ivorySunken',
  'ivory-calm': 'ivoryCalm',
  'ivory-ticket': 'ivoryTicket',
  'green-900': 'green900',
  'green-950': 'green950',
  'green-980': 'green980',
  'green-700': 'green700',
  teal: 'teal',
  'teal-text': 'tealText',
  aqua: 'aqua',
  'aqua-soft': 'aquaSoft',
  gold: 'gold',
  'gold-light': 'goldLight',
  'gold-text': 'goldText',
  sand: 'sand',
  'sand-border': 'sandBorder',
  coral: 'coral',
  'coral-text': 'coralText',
  ink: 'ink',
  'ink-muted': 'inkMuted',
  'ink-faint': 'inkFaint',
  border: 'border',
  'border-strong': 'borderStrong',
  'border-cool': 'borderCool',
  'map-land': 'mapLand',
  'map-land-alt': 'mapLandAlt',
  'map-water': 'mapWater',
  'map-water-alt': 'mapWaterAlt',
  'map-green': 'mapGreen',
  'map-road': 'mapRoad',
};

describe('CSS tokens mirror the TypeScript palette', () => {
  it.each(Object.entries(MIRRORED))('--%s matches palette.%s', (cssName, tsName) => {
    expect(cssVar(cssName), `--${cssName} is missing from tokens.css`).not.toBeNull();
    expect(cssVar(cssName)).toBe(palette[tsName].toLowerCase());
  });

  it('covers every colour token that the palette exposes', () => {
    // Retired tokens kept alive by the migration shim in tokens.ts are deliberately not mirrored:
    // the web app never used them, so mirroring them would import dead colour into a new codebase.
    const shim = ['goldDeep', 'goldTop', 'goldBottom', 'success', 'warning', 'ratingStar'];
    const mirrored = new Set(Object.values(MIRRORED));
    const missing = Object.keys(palette).filter(
      (k) => !mirrored.has(k as keyof typeof palette) && !shim.includes(k),
    );
    expect(missing, `add these to tokens.css and to MIRRORED: ${missing.join(', ')}`).toEqual([]);
  });
});
