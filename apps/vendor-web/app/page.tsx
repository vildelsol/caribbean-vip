import { semantic, spacing, radius } from '@cvip/ui';
import { Scanner } from '../components/Scanner';

/**
 * Vendor portal home.
 *
 * The scanner is the landing page rather than a section inside a dashboard, because the moment a
 * vendor opens this on their phone they are standing in front of a guest holding up a QR code
 * (PRD §6). Everything else can wait a tap.
 */
const remaining = [
  { id: 'V-01', text: 'Submit an onboarding application with documents', milestone: 'M4' },
  { id: 'V-02', text: 'Publish listings once approved', milestone: 'M4' },
  { id: 'V-03', text: 'Define capacity and availability by date and time', milestone: 'M4' },
  { id: 'V-06', text: 'Create a geofenced promotion with expiry and rules', milestone: 'M6' },
  { id: 'V-07', text: 'See gross, platform fee and estimated net separately', milestone: 'M4' },
];

export default function VendorHome() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: spacing.xl }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>Caribbean VIP</p>
      <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>
        Vendor Portal
      </h1>

      <h2 style={{ color: semantic.textPrimary, marginTop: spacing.lg }}>Redeem a voucher</h2>
      <p style={{ color: semantic.textMuted, marginTop: 0 }}>
        Scan the guest&rsquo;s QR code, or type the code they read out. A voucher can only be
        redeemed once.
      </p>

      <Scanner />

      <h2 style={{ color: semantic.textPrimary, marginTop: spacing.xxl }}>Still to come</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: spacing.sm }}>
        {remaining.map((m) => (
          <li
            key={m.id}
            style={{
              background: semantic.surface,
              border: `1px solid ${semantic.border}`,
              borderRadius: radius.md,
              padding: spacing.md,
              display: 'flex',
              gap: spacing.md,
              alignItems: 'baseline',
            }}
          >
            <strong style={{ color: semantic.locatorText, minWidth: 44 }}>{m.id}</strong>
            <span style={{ flex: 1 }}>{m.text}</span>
            <span style={{ color: semantic.premiumText, fontSize: 14 }}>{m.milestone}</span>
          </li>
        ))}
      </ul>

      <p style={{ color: semantic.urgentText, fontSize: 14 }}>
        Demo build — not connected to a live payment account or verified vendor records.
      </p>
    </main>
  );
}
