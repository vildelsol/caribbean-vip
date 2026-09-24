import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useStore } from '../state/store';
import './BottomNav.css';

/**
 * The five-tab bar, with Irie AI raised in the centre.
 *
 * The bar is **ivory**, not green — the same value as the screen above it, separated by a hairline.
 * Putting the darkest value in the design along the bottom edge of every screen inverts its value
 * structure, and doing that was once the single largest reason the app did not look like its
 * design. The one heavy element is the centre badge, which is the point.
 *
 * Irie is gold-on-green, always, never the reverse: a green disc carrying a gold sparkle. Built the
 * other way round it throws away the motif the concierge is recognised by across the journey.
 */

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Routes that should light this tab even though they are not it. */
  matches?: string[];
}

const TABS: Tab[] = [
  { to: '/', label: 'Explore', icon: 'home', matches: ['/experience', '/search', '/checkout', '/interests'] },
  { to: '/nearby', label: 'Nearby', icon: 'pin', matches: ['/offer'] },
  { to: '/irie', label: 'Irie AI', icon: 'sparkle' },
  { to: '/trips', label: 'Trips', icon: 'calendar', matches: ['/ticket', '/confirmation'] },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const { state } = useStore();

  /*
   * Planned-but-unpaid stops, counted on the tab that can finish them.
   *
   * Irie plans a day; planning is not paying, and the concierge screen says so. But it said so by
   * swapping its own button to "See it on Trips" — a state change in place, on a screen the guest
   * is still reading, which is the weakest signal in the interface. A guest who looked away at
   * that moment has a planned day, no booking, and nothing anywhere telling them so.
   *
   * The count sits on Trips because Trips is where the day is actually completed, and where the
   * clash resolver runs — a guest who books straight from a suggestion would skip the one check
   * that stops them holding two things at once.
   */
  const unpaid = state.plannedExperienceIds.length;

  if (pathname.startsWith('/staff')) return null;

  const isActive = (tab: Tab) =>
    pathname === tab.to || (tab.matches ?? []).some((m) => pathname.startsWith(m));

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((tab) => {
        const active = isActive(tab);
        if (tab.icon === 'sparkle') {
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="bottom-nav__item bottom-nav__item--centre"
              aria-current={active ? 'page' : undefined}
            >
              <span className={`irie-badge ${active ? 'irie-badge--on' : ''}`}>
                <Icon name="sparkle" size={24} color="var(--gold-light)" />
              </span>
              <span className={`bottom-nav__label ${active ? 'is-active' : ''}`}>{tab.label}</span>
            </NavLink>
          );
        }
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="bottom-nav__item"
            aria-current={active ? 'page' : undefined}
          >
            <span className={`bottom-nav__icon ${active ? 'is-active' : ''}`}>
              <Icon name={tab.icon} size={21} strokeWidth={1.9} />
              {tab.to === '/trips' && unpaid > 0 ? (
                <span className="bottom-nav__count" aria-hidden="true">
                  {unpaid > 9 ? '9+' : unpaid}
                </span>
              ) : null}
            </span>
            <span className={`bottom-nav__label ${active ? 'is-active' : ''}`}>{tab.label}</span>
            {tab.to === '/trips' && unpaid > 0 ? (
              <span className="sr-only">{`${unpaid} planned, not yet booked`}</span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
