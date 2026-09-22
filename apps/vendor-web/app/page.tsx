import Link from 'next/link';
import { Crest } from '../components/Crest';
import { activeVendor, earningsFor, formatUsd, todaysBookings, vendorListings } from '../lib/vendorData';

/**
 * Today — the operating picture.
 *
 * The portal used to open on the scanner, on the reasoning that a vendor opens it standing in front
 * of a guest. That is true of one moment in the day and not of the rest of it, and it left the
 * operator with no answer to "how is today going". Scan is now one tap away from every screen
 * instead of being the only screen.
 */
export default function Today() {
  const vendor = activeVendor();
  const bookings = todaysBookings();
  const earnings = earningsFor(bookings);
  const listings = vendorListings();
  const now = new Date();

  const upcoming = bookings.filter((b) => b.status === 'confirmed');
  const next = upcoming[0];

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">{vendor.tradingName}</p>
            <h1 className="masthead__title">Today</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <p className="vdate">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        <section className="stat-grid">
          <div className="stat">
            <p className="stat__label">Guests today</p>
            <p className="stat__value">{earnings.guests}</p>
          </div>
          <div className="stat">
            <p className="stat__label">Bookings</p>
            <p className="stat__value">{earnings.bookings}</p>
          </div>
          <div className="stat">
            <p className="stat__label">Net today</p>
            <p className="stat__value">{formatUsd(earnings.netMinor)}</p>
          </div>
        </section>

        {next ? (
          <section className="card next-card">
            <div className="next-card__body">
              <p className="next-card__label">NEXT DEPARTURE</p>
              <h2 className="next-card__title">
                {next.experienceTitle} · {next.time}
              </h2>
              <p className="next-card__meta">
                {next.guests} {next.guests === 1 ? 'guest' : 'guests'} · {next.guestName} ·{' '}
                {next.reference}
              </p>
            </div>
            <Link href="/scan" className="btn btn--primary next-card__cta">
              Check in
            </Link>
          </section>
        ) : null}

        <section className="card">
          <div className="card__head">
            <h2>Today&rsquo;s manifest</h2>
            <p className="card__note">
              Everyone booked across your {listings.length}{' '}
              {listings.length === 1 ? 'listing' : 'listings'}, in departure order.
            </p>
          </div>

          {bookings.length === 0 ? (
            <p className="empty-line">Nothing booked for today yet.</p>
          ) : (
            <ul className="manifest">
              {bookings.map((b) => (
                <li key={b.id} className="manifest__row">
                  <span className="manifest__time">{b.time}</span>
                  <span className="manifest__body">
                    <span className="manifest__title">{b.experienceTitle}</span>
                    <span className="manifest__meta">
                      {b.guestName} · {b.guests} {b.guests === 1 ? 'guest' : 'guests'} ·{' '}
                      {b.reference}
                    </span>
                  </span>
                  <span
                    className={`pill ${b.status === 'checked-in' ? 'pill--done' : 'pill--due'}`}
                  >
                    {b.status === 'checked-in' ? 'Checked in' : 'Expected'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
