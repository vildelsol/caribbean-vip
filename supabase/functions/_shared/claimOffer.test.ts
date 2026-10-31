import { describe, expect, it } from 'vitest';
import { CLAIM_WINDOW_MS, isClaimOutcome, parseClaimRequest, refusal, wasShownRecently } from './claimOffer';

const ID = '3f2b8a52-6c1e-4b1c-9d57-0a1b2c3d4e5f';

describe('what claim-offer accepts', () => {
  it('takes a promotion id, lower-cased', () => {
    expect(parseClaimRequest({ promotionId: ID.toUpperCase() })).toEqual({ ok: true, promotionId: ID });
  });

  it.each([
    ['no body', null],
    ['a string body', 'x'],
    ['no id', {}],
    ['a number id', { promotionId: 5 }],
    ['a non-uuid id', { promotionId: 'not-a-uuid' }],
    ['an id with trailing junk', { promotionId: `${ID}'; drop table x` }],
  ])('refuses %s', (_n, body) => {
    expect(parseClaimRequest(body).ok).toBe(false);
  });

  it('ignores any user id the client sends', () => {
    expect(parseClaimRequest({ promotionId: ID, userId: 'someone-else' })).toEqual({ ok: true, promotionId: ID });
  });
});

describe('was the offer really shown', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('accepts an impression inside the window', () => {
    expect(wasShownRecently([{ promotion_id: ID, shown_at: at(60_000) }], ID, now)).toBe(true);
    expect(wasShownRecently([{ promotion_id: ID, shown_at: at(CLAIM_WINDOW_MS) }], ID, now)).toBe(true);
  });

  it('refuses no impression, an old one, another promotion, a future one, or a bad date', () => {
    expect(wasShownRecently([], ID, now)).toBe(false);
    expect(wasShownRecently([{ promotion_id: ID, shown_at: at(CLAIM_WINDOW_MS + 1) }], ID, now)).toBe(false);
    expect(wasShownRecently([{ promotion_id: 'other', shown_at: at(1000) }], ID, now)).toBe(false);
    expect(wasShownRecently([{ promotion_id: ID, shown_at: at(-1000) }], ID, now)).toBe(false);
    expect(wasShownRecently([{ promotion_id: ID, shown_at: 'garbage' }], ID, now)).toBe(false);
  });

  it('finds the fresh impression among stale ones', () => {
    expect(wasShownRecently([
      { promotion_id: ID, shown_at: at(CLAIM_WINDOW_MS * 5) },
      { promotion_id: ID, shown_at: at(1000) },
    ], ID, now)).toBe(true);
  });
});

describe('outcomes', () => {
  it('recognises the four the database returns and nothing else', () => {
    for (const o of ['claimed', 'already_claimed', 'sold_out', 'not_available']) expect(isClaimOutcome(o)).toBe(true);
    expect(isClaimOutcome('ok')).toBe(false);
    expect(isClaimOutcome(null)).toBe(false);
  });

  it('gives each refusal a status and a message', () => {
    expect(refusal('already_claimed').status).toBe(409);
    expect(refusal('sold_out').status).toBe(409);
    expect(refusal('not_available').status).toBe(410);
    expect(new Set(['already_claimed', 'sold_out', 'not_available'].map((o) => refusal(o as never).message)).size).toBe(3);
  });
});
