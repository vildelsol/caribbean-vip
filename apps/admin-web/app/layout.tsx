import type { Metadata } from 'next';
import { semantic } from '@cvip/ui';
import './globals.css';
import { AdminSessionProvider } from '../lib/session';
import { AuthGate } from '../components/AuthGate';

export const metadata: Metadata = {
  title: 'Caribbean VIP — Admin Console',
  description: 'Verify vendors, moderate listings, oversee bookings and audit privileged actions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: semantic.background, color: semantic.textPrimary }}>
        <AdminSessionProvider>
          <AuthGate>{children}</AuthGate>
        </AdminSessionProvider>
      </body>
    </html>
  );
}
