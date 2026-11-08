import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { BottomNav } from './components/BottomNav';
import { useStore } from './state/store';
import { useLiveSync } from './state/useLiveSync';
import { useLocationConsentSync } from './state/useConsent';
import { Welcome } from './screens/Welcome';
import { Explore } from './screens/Explore';
import { Nearby } from './screens/Nearby';
import { Search } from './screens/Search';
import { Irie } from './screens/Irie';
import { Trips } from './screens/Trips';
import { Profile } from './screens/Profile';
import { ExperienceDetail } from './screens/ExperienceDetail';
import { Checkout } from './screens/Checkout';
import { Confirmation } from './screens/Confirmation';
import { Credits } from './screens/Credits';
import { Ticket } from './screens/Ticket';
import { WriteReview } from './screens/WriteReview';
import { Offer } from './screens/Offer';
import { Redeem } from './screens/Redeem';
import { BookingReturn } from './screens/BookingReturn';

/**
 * Routes and the app frame.
 *
 * The frame is a fixed phone-width column: every screen in the source design is composed for
 * 390pt, so a desktop letterboxes around it rather than stretching a layout nobody drew.
 */
export function App() {
  const { state } = useStore();
  const { pathname } = useLocation();

  // A new screen starts at the top. Without this, navigating from the foot of Explore into a
  // listing opens the listing already scrolled halfway down it.
  //
  // This must sit ABOVE the onboarding early return, not below it. It used to sit below, which
  // meant the component called three hooks while onboarding and four afterwards — so the moment a
  // guest finished setup, React hit a changed hook order and threw "Internal React error: Expected
  // static flag was missing" into the console on the single most important transition in the app.
  //
  // It also moves keyboard and screen-reader focus to the new screen's heading. Without that, focus
  // fell back to the page body after every navigation, so paying gave a keyboard user no sign that
  // anything had happened and the next Tab started from an arbitrary place. Not on first load.
  const firstRender = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      // A screen that put focus somewhere itself (Search focuses its field) keeps it.
      const held = document.activeElement;
      if (held && held !== document.body && held.closest('main')) return;
      const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // Live mode only: recover the guest's bookings from the server. A no-op in demo. Above the
  // early return for the same hook-order reason as the effect above.
  useLiveSync();

  // Live mode only: record the location answer where the server reads it. A no-op in demo.
  useLocationConsentSync();

  if (!state.onboarded) return <Welcome />;

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/nearby" element={<Nearby />} />
        <Route path="/search" element={<Search />} />
        <Route path="/irie" element={<Irie />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/experience/:id" element={<ExperienceDetail />} />
        <Route path="/checkout/:id" element={<Checkout />} />
        <Route path="/confirmation/:bookingId" element={<Confirmation />} />
        {/* Where the photography's attribution lives now that it is off the images. See Credits. */}
        <Route path="/credits" element={<Credits />} />
        <Route path="/ticket/:bookingId" element={<Ticket />} />
        <Route path="/review/:bookingId" element={<WriteReview />} />
        <Route path="/offer" element={<Offer />} />
        <Route path="/staff/redeem" element={<Redeem />} />
        <Route path="/booking-return" element={<BookingReturn />} />

        {/* An unknown hash route lands on Explore rather than a blank frame. */}
        <Route path="*" element={<Explore />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
