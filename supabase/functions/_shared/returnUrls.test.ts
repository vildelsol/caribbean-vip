import { describe, expect, it } from 'vitest';
import { cancelUrl, successUrl } from './returnUrls';

/**
 * Written after the return URL was found pointing at a path the app cannot route.
 *
 * The tourist app is a `HashRouter`, and its catch-all route renders Explore. So a success URL
 * without a `#` does not fail loudly — the guest pays, lands on the home screen, and sees no
 * booking and no error. Nothing else in the repo can catch this: the Edge Function needs Deno and
 * a live Stripe key, and neither is present on a dev machine.
 */

describe('the URL Stripe returns a paying guest to', () => {
  it('routes through the hash, because the app is a HashRouter', () => {
    expect(successUrl('https://app.example')).toBe(
      'https://app.example/#/booking-return?session_id={CHECKOUT_SESSION_ID}',
    );
  });

  it('keeps Stripe\'s placeholder intact — Stripe substitutes it, we must not', () => {
    expect(successUrl('https://app.example')).toContain('{CHECKOUT_SESSION_ID}');
  });

  it('names the query parameter BookingReturn actually reads', () => {
    expect(successUrl('https://app.example')).toContain('session_id=');
  });

  it('survives a trailing slash on APP_URL', () => {
    expect(successUrl('http://localhost:5173/')).toBe(
      'http://localhost:5173/#/booking-return?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(successUrl('http://localhost:5173///')).not.toContain('//#');
  });

  it('works for the local dev origin the first test card will use', () => {
    expect(successUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/#/booking-return?session_id={CHECKOUT_SESSION_ID}',
    );
  });
});

describe('the URL Stripe returns a guest who backed out to', () => {
  it('goes back to the checkout screen they came from, through the hash', () => {
    expect(cancelUrl('https://app.example', 'exp-123')).toBe(
      'https://app.example/#/checkout/exp-123',
    );
  });

  it('falls back to the home route when the experience is unknown', () => {
    expect(cancelUrl('https://app.example', '')).toBe('https://app.example/#/');
  });

  it('never returns a path the router cannot reach', () => {
    for (const url of [cancelUrl('https://a', 'x'), cancelUrl('https://a', ''), successUrl('https://a')]) {
      expect(url).toContain('/#/');
    }
  });
});
