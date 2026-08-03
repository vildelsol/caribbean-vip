import { semantic, spacing, radius } from '@cvip/ui';

/**
 * M0 shell. Admin console surfaces per PRD §7. Every privileged action listed here must write an
 * `audit_logs` row when it is implemented in M5.
 */
const areas = [
  {
    name: 'Dashboard',
    milestone: 'M5',
    detail: 'Pending reviews, booking volume, gross value, active promotions, failed payments, redemption anomalies.',
  },
  {
    name: 'Vendor review',
    milestone: 'M5',
    detail: 'Approve, reject, request changes, suspend — each with a recorded reason.',
  },
  {
    name: 'Listing moderation',
    milestone: 'M5',
    detail: 'Approve, reject, unpublish and edit platform-controlled metadata.',
  },
  {
    name: 'Booking operations',
    milestone: 'M5',
    detail: 'Payment, customer, vendor, voucher, cancellation and refund state.',
  },
  {
    name: 'Content management',
    milestone: 'M5',
    detail: 'Islands, destinations, categories, featured sections, FAQs and editorial content.',
  },
  {
    name: 'Promotion oversight',
    milestone: 'M6',
    detail: 'Approve or disable offers; investigate suspicious redemption patterns.',
  },
  {
    name: 'Audit log',
    milestone: 'M5',
    detail: 'Privileged changes, approvals, suspensions, refunds and role changes.',
  },
];

export default function AdminHome() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: spacing.xl }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>Caribbean VIP</p>
      <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>
        Admin Console
      </h1>
      <p style={{ color: semantic.textMuted, marginTop: 0 }}>
        Vendor verification, listing moderation, booking operations and the audit trail.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: spacing.sm }}>
        {areas.map((a) => (
          <li
            key={a.name}
            style={{
              background: semantic.surface,
              border: `1px solid ${semantic.border}`,
              borderRadius: radius.md,
              padding: spacing.md,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.md }}>
              <strong style={{ color: semantic.brand }}>{a.name}</strong>
              <span style={{ color: semantic.premiumText, fontSize: 14 }}>{a.milestone}</span>
            </div>
            <p style={{ margin: `${spacing.xs}px 0 0`, color: semantic.textMuted, fontSize: 14 }}>
              {a.detail}
            </p>
          </li>
        ))}
      </ul>

      <p style={{ color: semantic.urgentText, fontSize: 14 }}>
        Demo build — seeded content only, no live vendor verification.
      </p>
    </main>
  );
}
