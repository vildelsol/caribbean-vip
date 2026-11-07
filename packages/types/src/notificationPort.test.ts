import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createNullNotificationPort,
  NOTIFICATION_KINDS,
  NOTIFICATION_TEMPLATES,
  NotificationError,
  renderNotification,
  sendNotification,
  type NotificationPort,
  type NotificationRequest,
} from './notificationPort.ts';

const ROOT = join(__dirname, '..', '..', '..');
const USER = '3f2b8a52-6c1e-4a77-9b0e-1d2c3e4f5a6b';
const req = (over: Partial<NotificationRequest> = {}): NotificationRequest => ({
  kind: 'booking_confirmed',
  userId: USER,
  channel: 'email',
  destination: 'guest@example.com',
  ref: 'VIPJ-94HF-2RHM',
  ...over,
});

describe('kinds', () => {
  it('match the database enum exactly, in both directions', () => {
    const dir = join(ROOT, 'supabase', 'migrations');
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const block = /create type notification_kind as enum \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const values = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...values].sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it('every kind has a template, and the only marketing kind is nearby_offer', () => {
    for (const k of NOTIFICATION_KINDS) expect(NOTIFICATION_TEMPLATES[k].title.length).toBeGreaterThan(5);
    const marketing = NOTIFICATION_KINDS.filter((k) => NOTIFICATION_TEMPLATES[k].category === 'marketing');
    expect(marketing).toEqual(['nearby_offer']);
  });
});

describe('rendering', () => {
  it('fills the slot with an opaque reference', () => {
    expect(renderNotification(req()).body).toContain('VIPJ-94HF-2RHM');
  });

  it('refuses free text, an email or a name as the reference', () => {
    for (const ref of ['Sarah Miller', 'sarah@example.com', '+1 876 555 0100', 'Your table is ready!']) {
      expect(() => renderNotification(req({ ref }))).toThrow(NotificationError);
    }
  });

  it('refuses a missing reference where the body needs one, and an extra one where it does not', () => {
    expect(() => renderNotification(req({ ref: undefined }))).toThrow(NotificationError);
    expect(() => renderNotification(req({ kind: 'nearby_offer' }))).toThrow(NotificationError);
    expect(renderNotification(req({ kind: 'nearby_offer', ref: undefined })).title).toBe('An offer near you');
  });

  it('refuses a user id that is not opaque', () => {
    expect(() => renderNotification(req({ userId: 'sarah@example.com' }))).toThrow(NotificationError);
  });
});

describe('sending', () => {
  it('suppresses a marketing message without consent and sends it with consent', async () => {
    const port = createNullNotificationPort();
    const marketing = req({ kind: 'nearby_offer', ref: undefined, channel: 'push', destination: 'token-1' });
    await expect(sendNotification(port, marketing, { marketing: false })).resolves.toEqual({ status: 'suppressed', reason: 'no_consent' });
    expect(port.sent).toHaveLength(0);
    await expect(sendNotification(port, marketing, { marketing: true })).resolves.toEqual({ status: 'sent' });
    expect(port.sent).toHaveLength(1);
  });

  it('sends a service message without marketing consent', async () => {
    const port = createNullNotificationPort();
    await expect(sendNotification(port, req(), { marketing: false })).resolves.toEqual({ status: 'sent' });
  });

  it('suppresses a channel the provider does not offer', async () => {
    const pushOnly: NotificationPort = { ...createNullNotificationPort(), channels: ['push'] };
    await expect(sendNotification(pushOnly, req({ channel: 'email' }), { marketing: false })).resolves.toEqual({
      status: 'suppressed',
      reason: 'channel_unsupported',
    });
  });

  it('reports a delivery failure and never throws it', async () => {
    const broken: NotificationPort = {
      ...createNullNotificationPort(),
      async deliver() {
        throw new Error('provider down');
      },
    };
    await expect(sendNotification(broken, req(), { marketing: false })).resolves.toEqual({ status: 'failed' });
  });

  it('throws for a request that is not fit to leave, so a caller bug is loud', async () => {
    await expect(sendNotification(createNullNotificationPort(), req({ ref: 'free text here' }), { marketing: true })).rejects.toThrow(NotificationError);
  });

  it('the null adapter never keeps the address', async () => {
    const port = createNullNotificationPort();
    await sendNotification(port, req(), { marketing: false });
    expect(JSON.stringify(port.sent)).not.toContain('guest@example.com');
  });
});
