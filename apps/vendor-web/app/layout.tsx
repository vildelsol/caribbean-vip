import type { Metadata } from 'next';
import './globals.css';
import './vendor.css';
import { VendorSessionProvider } from '../lib/session';
import { AuthGate } from '../components/AuthGate';
import { VendorNav } from '../components/VendorNav';

export const metadata: Metadata = {
  title: 'Caribbean VIP — Vendor Portal',
  description: 'Manage your experiences, availability, bookings and voucher redemption.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The same two faces the tourist app loads. The portal rendered in the platform default
            until now, which is most of why it read as a different product to the one a vendor is
            being asked to trust. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      {/* Colours come from `globals.css`, which imports the shared token mirror. */}
      <body>
        <VendorSessionProvider>
          <AuthGate>
            <VendorNav />
            {children}
          </AuthGate>
        </VendorSessionProvider>
      </body>
    </html>
  );
}
