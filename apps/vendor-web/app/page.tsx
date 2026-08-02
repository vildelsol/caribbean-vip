import { semantic, spacing, radius } from '@cvip/ui';

/**
 * M0 shell. The vendor portal is a separate web experience, not a section of the tourist app
 * (PRD §6), and must stay usable in a phone browser because that is where QR scanning happens.
 */
const milestones = [
  { id: 'V-01', text: 'Submit an onboarding application with documents', milestone: 'M4' },
  { id: 'V-02', text: 'Publish listings once approved', milestone: 'M4' },
  { id: 'V-03', text: 'Define capacity and availability by date and time', milestone: 'M4' },
  { id: 'V-04', text: 'Scan and validate a QR voucher from this browser', milestone: 'M4' },
  { id: 'V-05', text: 'Reject a second scan, showing the original redemption time', milestone: 'M4' },
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
      <p style={{ color: semantic.textMuted, marginTop: 0 }}>
        Onboarding, listings, availability, bookings, promotions and voucher redemption.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: spacing.sm }}>
        {milestones.map((m) => (
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
            <strong style={{ color: semantic.accent, minWidth: 44 }}>{m.id}</strong>
            <span style={{ flex: 1 }}>{m.text}</span>
            <span style={{ color: semantic.textAccent, fontSize: 14 }}>{m.milestone}</span>
          </li>
        ))}
      </ul>

      <p style={{ color: semantic.alert, fontSize: 14 }}>
        Demo build — not connected to a live payment account or verified vendor records.
      </p>
    </main>
  );
}
