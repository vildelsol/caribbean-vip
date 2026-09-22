import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { useStore } from './state/store';
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
import { Ticket } from './screens/Ticket';
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

  if (!state.onboarded) return <Welcome />;

  // A new screen starts at the top. Without this, navigating from the foot of Explore into a
  // listing opens the listing already scrolled halfway down it.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

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
        <Route path="/ticket/:bookingId" element={<Ticket />} />
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
