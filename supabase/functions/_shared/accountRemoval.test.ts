import { describe, expect, it } from 'vitest';
import { removalRefusal } from './accountRemoval';

describe('removalRefusal', () => {
  it('names each reason the gate can give (positive control)', () => {
    for (const a of ['disabled', 'not_erased', 'has_bookings', 'not_tourist']) {
      const r = removalRefusal(a);
      expect(r.status).toBe(409);
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
  it('treats an answer it does not know as an error, never as permission', () => {
    for (const a of ['ok', 'OK', '', null, undefined, true, 1, 'maybe']) {
      expect(removalRefusal(a).status).toBe(500);
    }
  });
});
