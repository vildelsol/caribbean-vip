/**
 * Notification port: the one shape any email or push sender must fit.
 *
 * No notification provider is chosen (OD-05). The rules about who may be messaged, and with what
 * words, live here as data. The transport lives behind this port, and the default adapter sends
 * nowhere. Picking Expo, an email API or both later should touch one adapter file.
 *
 * **Two rules this file enforces, not advises.**
 *
 * 1. Consent. A marketing message (`nearby_offer`) is sent only when the guest's
 *    `notification_consent` is true. A service message (a booking they made, a voucher about to
 *    expire) needs no consent, because it is part of the contract. `sendNotification` suppresses a
 *    marketing message without consent instead of trusting each caller to check.
 * 2. Wording. A provider stores and may read every message. So the words are fixed per kind, and the
 *    only variable is an opaque reference (booking reference, uuid). There is no free-text field:
 *    one would be filled with a guest's name within a month.
 *
 * The destination (an email address or push token) is personal data. It goes to `deliver` and
 * nowhere else: it is not logged, not recorded by the null adapter, and not part of any result.
 * A notification provider also needs a row in `docs/privacy/processor-record.md` before it receives
 * anything.
 *
 * Pure: no I/O here. An adapter does the I/O.
 */

/** Matches the `notification_kind` enum in the database; `notificationPort.test.ts` checks both ways. */
export const NOTIFICATION_KINDS = [
  'booking_confirmed',
  'booking_cancelled',
  'nearby_offer',
  'voucher_expiring',
  'vendor_status_changed',
  'listing_status_changed',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationChannel = 'push' | 'email';

/** `service` needs no consent. `marketing` needs `notification_consent`. */
export type NotificationCategory = 'service' | 'marketing';

export interface NotificationTemplate {
  readonly category: NotificationCategory;
  /** Fixed. Never interpolate anything from a row into this. */
  readonly title: string;
  /** Fixed, with one `{ref}` slot filled by an opaque reference. */
  readonly body: string;
}

export const NOTIFICATION_TEMPLATES: Readonly<Record<NotificationKind, NotificationTemplate>> = {
  booking_confirmed: { category: 'service', title: 'Booking confirmed', body: 'Your booking {ref} is confirmed. Open the app for your ticket.' },
  booking_cancelled: { category: 'service', title: 'Booking cancelled', body: 'Your booking {ref} was cancelled. Open the app for details.' },
  voucher_expiring: { category: 'service', title: 'Your voucher expires soon', body: 'Voucher {ref} expires soon. Open the app to use it.' },
  vendor_status_changed: { category: 'service', title: 'Your vendor account changed', body: 'The status of vendor account {ref} changed. Open the portal for details.' },
  listing_status_changed: { category: 'service', title: 'Your listing changed', body: 'The status of listing {ref} changed. Open the portal for details.' },
  nearby_offer: { category: 'marketing', title: 'An offer near you', body: 'There is a new offer near you. Open the app to see it.' },
};

export class NotificationError extends Error {}

/** uuid, booking reference (VIPJ-94HF-2RHM), or a kebab-case slug. Same allow-list as alerts. */
const REF_SHAPES = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[A-Z]{3,4}(-[A-Z0-9]{4})+$/,
  /^[a-z][a-z0-9-]{0,40}$/,
];

export interface NotificationRequest {
  readonly kind: NotificationKind;
  /** Opaque user id. Lets an operator trace a message without the address. */
  readonly userId: string;
  readonly channel: NotificationChannel;
  /** Email address or push token. Personal data: only `deliver` ever sees it. */
  readonly destination: string;
  /** Fills the `{ref}` slot. Required for every kind whose body has one. */
  readonly ref?: string | undefined;
}

/** What an adapter receives. The words are already final. */
export interface RenderedNotification {
  readonly kind: NotificationKind;
  readonly category: NotificationCategory;
  readonly userId: string;
  readonly channel: NotificationChannel;
  readonly destination: string;
  readonly title: string;
  readonly body: string;
}

export interface NotificationConsent {
  /** `profiles.notification_consent` for this user, read by the caller from the database. */
  readonly marketing: boolean;
}

export type NotificationOutcome =
  | { status: 'sent' }
  | { status: 'suppressed'; reason: 'no_consent' | 'channel_unsupported' }
  | { status: 'failed' };

export interface NotificationPort {
  /** Stable key, lower-case. Matches a row in `docs/privacy/processor-record.md`. */
  readonly id: string;
  readonly displayName: string;
  /** Where the tool stores messages. Needed for transfer rules, same as a processor port. */
  readonly region: string;
  readonly channels: readonly NotificationChannel[];
  deliver(message: RenderedNotification): Promise<void>;
}

/** Builds the final words. Throws when the request is not fit to leave. */
export function renderNotification(request: NotificationRequest): RenderedNotification {
  const template = NOTIFICATION_TEMPLATES[request.kind];
  if (!template) throw new NotificationError(`unknown notification kind "${request.kind}"`);
  if (!request.destination) throw new NotificationError('a notification needs a destination');
  if (!REF_SHAPES.some((shape) => shape.test(request.userId))) {
    throw new NotificationError('userId must be an opaque identifier');
  }
  let body = template.body;
  if (body.includes('{ref}')) {
    if (!request.ref || !REF_SHAPES.some((shape) => shape.test(request.ref as string))) {
      throw new NotificationError(
        `ref "${request.ref ?? ''}" is not an opaque identifier (uuid, booking reference or slug). Notifications never carry free text.`,
      );
    }
    body = body.replace('{ref}', request.ref);
  } else if (request.ref !== undefined) {
    throw new NotificationError(`kind "${request.kind}" takes no ref`);
  }
  return {
    kind: request.kind,
    category: template.category,
    userId: request.userId,
    channel: request.channel,
    destination: request.destination,
    title: template.title,
    body,
  };
}

/**
 * Send one notification. Never throws for a delivery failure: a provider outage must not fail the
 * booking that triggered the message. Throws only when the request itself is not fit to leave, which
 * is a programming error and must be caught in tests.
 */
export async function sendNotification(
  port: NotificationPort,
  request: NotificationRequest,
  consent: NotificationConsent,
): Promise<NotificationOutcome> {
  const message = renderNotification(request);
  if (message.category === 'marketing' && !consent.marketing) {
    return { status: 'suppressed', reason: 'no_consent' };
  }
  if (!port.channels.includes(message.channel)) {
    return { status: 'suppressed', reason: 'channel_unsupported' };
  }
  try {
    await port.deliver(message);
    return { status: 'sent' };
  } catch {
    return { status: 'failed' };
  }
}

/** What the null adapter keeps. Deliberately has no destination. */
export interface RecordedNotification {
  readonly kind: NotificationKind;
  readonly userId: string;
  readonly channel: NotificationChannel;
  readonly title: string;
  readonly body: string;
}

export interface RecordingNotificationPort extends NotificationPort {
  readonly sent: readonly RecordedNotification[];
}

/**
 * The default adapter: records in memory, sends nowhere, keeps no address.
 *
 * Deliberately not a console logger. Logs on a hosting provider are a disclosure to that provider,
 * and this port exists to keep that decision deliberate. Production refuses to start on it
 * (`assertProductionReady`).
 */
export function createNullNotificationPort(): RecordingNotificationPort {
  const sent: RecordedNotification[] = [];
  return {
    id: 'none',
    displayName: 'No notification provider chosen',
    region: 'n/a (nothing leaves)',
    channels: ['push', 'email'],
    sent,
    async deliver(message) {
      sent.push({ kind: message.kind, userId: message.userId, channel: message.channel, title: message.title, body: message.body });
    },
  };
}
