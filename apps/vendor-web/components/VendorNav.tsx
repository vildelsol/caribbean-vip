'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Portal navigation.
 *
 * Scan sits last and styled as the accent action rather than first in the row, because it is the
 * one thing done standing in front of a guest — it needs to be reachable in one tap from anywhere,
 * but the rest of the portal is what a vendor opens when they sit down at the end of a shift.
 */
const LINKS = [
  { href: '/', label: 'Today' },
  { href: '/listings', label: 'Listings' },
  { href: '/availability', label: 'Availability' },
  { href: '/earnings', label: 'Earnings' },
];

export function VendorNav() {
  const pathname = usePathname();
  // Onboarding and billing are a linear signup flow, not places to navigate around inside.
  if (pathname === '/onboarding' || pathname === '/billing') return null;

  return (
    <nav className="vnav" aria-label="Portal sections">
      <div className="vnav__inner">
        <div className="vnav__links">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`vnav__link ${active ? 'vnav__link--on' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/scan"
          className={`vnav__scan ${pathname.startsWith('/scan') ? 'vnav__scan--on' : ''}`}
        >
          Scan a code
        </Link>
      </div>
    </nav>
  );
}
