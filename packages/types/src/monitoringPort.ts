/**
 * Monitoring port: the one shape any alerting tool must fit.
 *
 * No monitoring provider is chosen (OD-05 territory), and production needs alerts before one is.
 * So the rules live here as data, the transport lives behind this port, and the default adapter
 * sends nowhere. Picking Sentry, Better Stack or a webhook later should touch one adapter file.
 *
 * **The privacy rule this file enforces.** An alert leaves our systems and lands in a third party's
 * inbox, chat and retention. So an alert carries counts and opaque references, never personal data.
 * "Booking stuck in pending_payment" names the booking, never the guest's email. The check is not
 * advisory: `emitAlert` refuses a signal that fails it, so an adapter can never be handed personal
 * data by a careless caller. A monitoring provider must also have a row in
 * `docs/privacy/processor-record.md` before it receives anything.
 *
 * Pure: no I/O here. An adapter does the I/O.
 */

export type AlertSeverity = 'page' | 'warn';

export interface AlertRule {
  /** Stable key, lower-case. Used as the alert's identity in whatever tool receives it. */
  readonly id: string;
  /** Fixed wording. Never interpolate anything from a row into this. */
  readonly title: string;
  readonly severity: AlertSeverity;
  /** The condition, in words an operator can check by hand. */
  readonly condition: string;
  /** Where the signal is observed: which log, table or endpoint. */
  readonly source: string;
}

/**
 * The production alert set — `docs/production-provisioning.md` §8.
 *
 * `monitoringPort.test.ts` fails when this list and the runbook section disagree, so neither can
 * drift into being the stale one.
 */
export const ALERT_RULES: readonly AlertRule[] = [
  {
    id: 'edge-function-failures',
    title: 'Edge Function runs are failing',
    severity: 'page',
    condition: 'any non-2xx from a deployed function over a 5 minute window',
    source: 'Supabase Edge Function logs',
  },
  {
    id: 'stripe-webhook-errors',
    title: 'Stripe webhook is not returning 2xx',
    severity: 'page',
    condition: 'any non-2xx response from stripe-webhook; Stripe retries, then gives up and the booking never confirms',
    source: 'stripe-webhook logs and the Stripe dashboard delivery view',
  },
  {
    id: 'bookings-stuck-pending',
    title: 'Bookings are stuck awaiting payment',
    severity: 'page',
    condition: 'a booking in pending_payment for more than 30 minutes — the guest may have been charged',
    source: 'bookings table',
  },
  {
    id: 'retention-purge-missed',
    title: 'The retention purge has not run',
    severity: 'warn',
    condition: 'no audit_logs row matching retention.% for 8 days — the weekly pg_cron job is dead or pg_cron is not enabled',
    source: "audit_logs where action like 'retention.%'",
  },
];

export function alertRule(id: string): AlertRule {
  const rule = ALERT_RULES.find((r) => r.id === id);
  if (!rule) throw new MonitoringError(`no alert rule "${id}"`);
  return rule;
}

/**
 * What an alert is allowed to carry.
 *
 * `facts` are counts and flags. `refs` are opaque identifiers an operator pastes into the admin
 * console: a uuid, a booking reference, a function name. Deliberately no free-text field — one
 * would be filled with a guest's name within a month.
 */
export interface AlertSignal {
  readonly ruleId: string;
  /** ISO 8601. Passed in, never read from the clock here, so callers and tests stay deterministic. */
  readonly observedAt: string;
  readonly facts: Readonly<Record<string, number | boolean>>;
  readonly refs?: readonly string[];
}

export class MonitoringError extends Error {}

/** uuid, booking reference (VIPJ-94HF-2RHM), or a kebab-case slug such as a function name. */
const REF_SHAPES = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[A-Z]{3,4}(-[A-Z0-9]{4})+$/,
  /^[a-z][a-z0-9-]{0,40}$/,
];

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Refuses a signal that could carry personal data.
 *
 * Allow-list, not block-list: a ref must match a known opaque shape. An email, a name, a phone
 * number and a free-text note all fail because none of them look like a uuid, a booking reference
 * or a slug — not because this function knows what an email looks like. A block-list would pass
 * the first identifier shape nobody thought of.
 */
export function assertEmittable(signal: AlertSignal): void {
  alertRule(signal.ruleId); // unknown rule: an alert nobody has agreed the wording of
  if (!ISO_8601.test(signal.observedAt)) {
    throw new MonitoringError(`observedAt must be an ISO 8601 instant, got "${signal.observedAt}"`);
  }
  for (const [key, value] of Object.entries(signal.facts)) {
    if (!/^[a-z][A-Za-z0-9]{0,30}$/.test(key)) {
      throw new MonitoringError(`fact name "${key}" must be a short camelCase word`);
    }
    if (typeof value === 'boolean') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new MonitoringError(`fact "${key}" must be a finite number or a boolean — alerts carry counts, not content`);
    }
  }
  for (const ref of signal.refs ?? []) {
    if (!REF_SHAPES.some((shape) => shape.test(ref))) {
      throw new MonitoringError(
        `ref "${ref}" is not an opaque identifier (uuid, booking reference or slug). Alerts never carry personal data.`,
      );
    }
  }
}

export interface MonitoringPort {
  /** Stable key, lower-case. Matches a row in `docs/privacy/processor-record.md`. */
  readonly id: string;
  readonly displayName: string;
  /** Where the tool stores alerts. Needed for transfer rules, same as a processor port. */
  readonly region: string;
  deliver(signal: AlertSignal, rule: AlertRule): Promise<void>;
}

/**
 * Send one alert. Never throws for a delivery failure — monitoring that takes the caller down with
 * it is worse than no monitoring. Throws only when the signal itself is not fit to leave, which is
 * a programming error and must be caught in tests, not at three in the morning.
 */
export async function emitAlert(port: MonitoringPort, signal: AlertSignal): Promise<boolean> {
  assertEmittable(signal);
  try {
    await port.deliver(signal, alertRule(signal.ruleId));
    return true;
  } catch {
    return false;
  }
}

export interface RecordingMonitoringPort extends MonitoringPort {
  readonly sent: readonly AlertSignal[];
}

/**
 * The default adapter: records in memory, sends nowhere.
 *
 * Deliberately not a console logger. Logs on a hosting provider are a disclosure to that provider,
 * and this port exists to keep that decision deliberate. Until a monitoring provider has a row in
 * the processor record, alerts go nowhere.
 */
export function createNullMonitoringPort(): RecordingMonitoringPort {
  const sent: AlertSignal[] = [];
  return {
    id: 'none',
    displayName: 'No monitoring provider chosen',
    region: 'n/a (nothing leaves)',
    sent,
    async deliver(signal) {
      sent.push(signal);
    },
  };
}
