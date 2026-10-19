import { describe, expect, it } from 'vitest';
import { LISTING_LIMITS, listingTextSchema } from './listing.ts';

describe('listing text limits', () => {
  it('accepts a listing at exactly the limit', () => {
    const parsed = listingTextSchema.parse({
      title: 'a'.repeat(LISTING_LIMITS.title),
      summary: 'b'.repeat(LISTING_LIMITS.summary),
      description: 'c'.repeat(LISTING_LIMITS.description),
      pickupInfo: 'd'.repeat(LISTING_LIMITS.pickupInfo),
    });
    expect(parsed.title).toHaveLength(LISTING_LIMITS.title);
  });

  it('rejects one character past it', () => {
    const over = listingTextSchema.safeParse({
      title: 'a'.repeat(LISTING_LIMITS.title + 1),
      summary: null,
      description: null,
      pickupInfo: null,
    });
    expect(over.success).toBe(false);
  });

  /* The three nullable columns really are nullable — see the note on `DemoExperience`. */
  it('accepts nulls for every column Postgres allows null in', () => {
    const parsed = listingTextSchema.parse({
      title: 'Dunn’s River Falls Climb',
      summary: null,
      description: null,
      pickupInfo: null,
    });
    expect(parsed.summary).toBeNull();
  });

  it('rejects a title that is only whitespace', () => {
    const blank = listingTextSchema.safeParse({
      title: '   ',
      summary: null,
      description: null,
      pickupInfo: null,
    });
    expect(blank.success).toBe(false);
  });

  /*
   * The pick() the vendor form uses must keep the title rule. If `title` ever stops being required
   * by the schema, the form's only remaining guard is a disabled button.
   */
  it('keeps the title rule when picked down to the two fields a form edits', () => {
    const formOnly = listingTextSchema.pick({ title: true, summary: true });
    expect(formOnly.safeParse({ title: '   ', summary: 'Fine' }).success).toBe(false);
    expect(formOnly.safeParse({ title: 'Fine', summary: null }).success).toBe(true);
  });

  /* Trailing whitespace must not be what fails a save. */
  it('trims before measuring', () => {
    const parsed = listingTextSchema.parse({
      title: `${'a'.repeat(LISTING_LIMITS.title)}   `,
      summary: null,
      description: null,
      pickupInfo: null,
    });
    expect(parsed.title).toHaveLength(LISTING_LIMITS.title);
  });
});
