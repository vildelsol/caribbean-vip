import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { Explore } from './screens/Explore';
import { Nearby } from './screens/Nearby';
import { Irie } from './screens/Irie';
import { Trips } from './screens/Trips';
import { Profile } from './screens/Profile';

/**
 * Routes and the app frame.
 *
 * The frame is a fixed phone-width column: every screen in the source design is composed for
 * 390pt, so a desktop letterboxes around it rather than stretching a layout that was never drawn
 * at that width.
 */
export function App() {
  const { pathname } = useLocation();

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
        <Route path="/irie" element={<Irie />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/profile" element={<Profile />} />
        {/* An unknown hash route lands on Explore rather than a blank frame. */}
        <Route path="*" element={<Explore />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
