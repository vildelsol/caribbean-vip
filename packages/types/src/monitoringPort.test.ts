import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALERT_RULES,
  alertRule,
  assertEmittable,
  createNullMonitoringPort,
  emitAlert,
  MonitoringError,
  type AlertSignal,
  type MonitoringPort,
} from './monitoringPort.ts';

const RUNBOOK = join(__dirname, '..', '..', '..', 'docs', 'production-provisioning.md');
const AT = '2026-11-05T03:30:00Z';

const signal = (over: Partial<AlertSignal> = {}): AlertSignal => ({
  ruleId: 'bookings-stuck-pending',
  observedAt: AT,
  facts: { count: 3 },
  ...over,
});

describe('alert rules', () => {
  it('every rule has a stable id, fixed wording and a source', () => {
    for (const r of ALERT_RULES) {
      expect(r.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(r.title.length).toBeGreaterThan(8);
      expect(r.condition.length).toBeGreaterThan(8);
      expect(r.source.length).toBeGreaterThan(3);
    }
  });

  it('ids are unique', () => {
    expect(new Set(ALERT_RULES.map((r) => r.id)).size).toBe(ALERT_RULES.length);
  });

  it('matches the runbook section exactly, in both directions', () => {
    const section = readFileSync(RUNBOOK, 'utf8').split(/^## 8\. Monitoring/m)[1] ?? '';
    expect(section, 'runbook has no section 8').not.toBe('');
    const inRunbook = [...section.matchAll(/^- \[ \] `([a-z][a-z0-9-]*)`/gm)].map((m) => m[1]);
    expect(inRunbook.slice().sort()).toEqual(ALERT_RULES.map((r) => r.id).sort());
  });

  it('a payment-affecting rule pages rather than warns', () => {
    for (const id of ['stripe-webhook-errors', 'bookings-stuck-pending']) {
      expect(alertRule(id).severity).toBe('page');
    }
  });

  it('refuses to look up a rule nobody agreed the wording of', () => {
    expect(() => alertRule('made-up')).toThrow(MonitoringError);
  });
});

describe('a signal may not carry personal data', () => {
  it('accepts counts, flags and opaque references', () => {
    expect(() =>
      assertEmittable(
        signal({
          facts: { count: 3, oldestMinutes: 94, degraded: true },
          refs: ['VIPJ-94HF-2RHM', '6f1b7e02-3c44-4a9f-8f0e-2b1d9c7a5e31', 'stripe-webhook'],
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['an email address', 'guest@example.com'],
    ['a name', 'Marcia Campbell'],
    ['a phone number', '+1 876 555 0134'],
    ['a free-text note', 'guest called about the Dunn’s River booking'],
    ['a URL carrying a query', 'https://x.test/u?email=guest@example.com'],
  ])('refuses %s in refs', (_what, ref) => {
    expect(() => assertEmittable(signal({ refs: [ref] }))).toThrow(MonitoringError);
  });

  it('refuses a string fact, which is where free text would arrive', () => {
    const bad = { ruleId: 'bookings-stuck-pending', observedAt: AT, facts: { note: 'guest@example.com' } };
    expect(() => assertEmittable(bad as unknown as AlertSignal)).toThrow(MonitoringError);
  });

  it('refuses an unknown rule and a non-ISO timestamp', () => {
    expect(() => assertEmittable(signal({ ruleId: 'nope' }))).toThrow(MonitoringError);
    expect(() => assertEmittable(signal({ observedAt: 'just now' }))).toThrow(MonitoringError);
  });
});

describe('emitAlert', () => {
  it('delivers a clean signal with its rule', async () => {
    const port = createNullMonitoringPort();
    await expect(emitAlert(port, signal())).resolves.toBe(true);
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0]!.ruleId).toBe('bookings-stuck-pending');
  });

  it('checks before delivering, so a bad signal never reaches the adapter', async () => {
    const seen: AlertSignal[] = [];
    const port: MonitoringPort = {
      id: 'spy',
      displayName: 'spy',
      region: 'test',
      async deliver(s) {
        seen.push(s);
      },
    };
    await expect(emitAlert(port, signal({ refs: ['guest@example.com'] }))).rejects.toThrow(MonitoringError);
    expect(seen, 'personal data reached the adapter').toEqual([]);
  });

  it('reports a delivery failure instead of throwing — monitoring never takes the caller down', async () => {
    const port: MonitoringPort = {
      id: 'broken',
      displayName: 'broken',
      region: 'test',
      async deliver() {
        throw new Error('503 from the provider');
      },
    };
    await expect(emitAlert(port, signal())).resolves.toBe(false);
  });

  it('the default adapter sends nowhere and names no provider', () => {
    const port = createNullMonitoringPort();
    expect(port.id).toBe('none');
    expect(port.region).toMatch(/nothing leaves/);
  });
});
