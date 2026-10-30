'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { semantic, spacing, radius } from '@cvip/ui';
import { formatMoney, type Currency } from '@cvip/types';
import { loadDashboard, type DashboardData } from '../../lib/dashboard';

/**
 * Admin dashboard — PRD §7. The top row is what needs a person (it links to the queue that clears
 * it); below is how the marketplace is doing. Redemption anomalies are not shown: nothing defines
 * an anomaly yet, and a tile with a guessed rule would look like a check that is not running.
 */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const todo = data
    ? [
        { label: 'Vendors waiting', n: data.vendorsWaiting, href: '/vendors' },
        { label: 'Vendors needing attention', n: data.vendorsNeedingAttention, href: '/vendors' },
        { label: 'Listings waiting', n: data.listingsWaiting, href: '/listings' },
        { label: 'Promotions waiting', n: data.promotionsWaiting, href: undefined },
      ]
    : [];

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: spacing.lg }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>
        <Link href="/" style={{ color: 'inherit' }}>
          Caribbean VIP
        </Link>{' '}
        · Admin
      </p>
      <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 ${spacing.md}px` }}>Dashboard</h1>

      {error ? (
        <p style={{ color: semantic.urgentText, fontSize: 14 }} role="alert">
          {error}
        </p>
      ) : null}
      {data === null && !error ? <p style={{ color: semantic.textMuted }}>Loading…</p> : null}

      {data ? (
        <>
          {!data.live ? (
            <p style={{ color: semantic.premiumText, fontSize: 14 }}>
              Demo data — the demo has no bookings, payments or promotions, so those figures are blank rather than invented.
            </p>
          ) : null}

          <h2 style={h2}>Needs a person</h2>
          <div style={grid}>
            {todo.map((t) => (
              <Tile key={t.label} label={t.label} value={t.n} href={t.href} urgent={(t.n ?? 0) > 0} />
            ))}
          </div>

          <h2 style={h2}>Marketplace</h2>
          <div style={grid}>
            <Tile label="Approved vendors" value={data.vendorsApproved} />
            <Tile label="Live listings" value={data.listingsLive} />
            <Tile label="Active promotions" value={data.promotionsActive} />
          </div>

          <h2 style={h2}>Last {data.windowDays} days</h2>
          {data.bookings === null || data.failedPayments === null ? (
            <p style={{ color: semantic.textMuted, fontSize: 15 }}>No booking data in demo.</p>
          ) : (
            <div style={grid}>
              <Tile label="Bookings" value={data.bookings.count} />
              <article style={card}>
                <p style={tileLabel}>Gross value</p>
                {Object.keys(data.bookings.grossByCurrency).length === 0 ? (
                  <p style={{ ...tileValue, color: semantic.textFaint }}>—</p>
                ) : (
                  Object.entries(data.bookings.grossByCurrency).map(([cur, amt]) => (
                    <p key={cur} style={{ ...tileValue, fontSize: 22 }}>
                      {formatMoney({ amountMinor: amt, currency: cur as Currency })}
                    </p>
                  ))
                )}
                <p style={tileHint}>Confirmed and completed, per currency</p>
              </article>
              <article style={card}>
                <p style={tileLabel}>Failed payments</p>
                <p style={{ ...tileValue, color: data.failedPayments.count > 0 ? semantic.urgentText : semantic.brand }}>
                  {data.failedPayments.count}
                </p>
                {Object.entries(data.failedPayments.reasons).map(([why, n]) => (
                  <p key={why} style={tileHint}>
                    {n} × {why}
                  </p>
                ))}
              </article>
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

const h2 = { color: semantic.textPrimary, fontSize: 18, margin: `${spacing.lg}px 0 ${spacing.sm}px` } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm } as const;
const card = {
  background: semantic.surface,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.md,
  padding: spacing.md,
} as const;
const tileLabel = { margin: 0, fontSize: 15, fontWeight: 600, color: semantic.textPrimary } as const;
const tileValue = { margin: '4px 0 0', fontSize: 32, fontWeight: 700, lineHeight: 1.1, color: semantic.brand, fontVariantNumeric: 'tabular-nums' } as const;
const tileHint = { margin: '4px 0 0', fontSize: 13, color: semantic.textMuted } as const;

function Tile({ label, value, href, urgent }: { label: string; value: number | null; href?: string; urgent?: boolean }) {
  const body = (
    <>
      <p style={tileLabel}>{label}</p>
      <p style={{ ...tileValue, color: value === null ? semantic.textFaint : urgent ? semantic.urgentText : semantic.brand }}>
        {value ?? '—'}
      </p>
    </>
  );
  return href && value !== null && value > 0 ? (
    <Link href={href} style={{ ...card, textDecoration: 'none', display: 'block' }}>
      {body}
      <p style={{ ...tileHint, textDecoration: 'underline' }}>Open queue</p>
    </Link>
  ) : (
    <article style={card}>{body}</article>
  );
}
