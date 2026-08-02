import type { Metadata } from 'next';
import { semantic } from '@cvip/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Caribbean VIP — Vendor Portal',
  description: 'Manage your experiences, availability, bookings and voucher redemption.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: semantic.background, color: semantic.textPrimary }}>
        {children}
      </body>
    </html>
  );
}
