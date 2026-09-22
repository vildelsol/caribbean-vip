import { Crest } from '../../components/Crest';
import {
  COMMISSION_RATE,
  earningsFor,
  formatUsd,
  todaysBookings,
  vendorListings,
} from '../../lib/vendorData';

/**
 * Earnings — V-07, "see gross, platform fee and estimated net separately".
 *
 * Three figures, not one. A vendor deciding whether this channel earns its place cannot do that
 * from a net number, and a portal that shows only what lands in the bank looks like it is hiding
 * the rate. The rate is therefore stated as a percentage as well as an amount.
 */
export default function Earnings() {
  const bookings = todaysBookings();
  const today = earningsFor(bookings);

  // A settled week behind today, derived from the same manifest so the two screens agree.
  const weekMultiplier = 5.4;
  const week = {
    grossMinor: Math.round(today.grossMinor * weekMultiplier),
    commissionMinor: Math.round(today.commissionMinor * weekMultiplier),
    netMinor: Math.round(today.netMinor * weekMultiplier),
  };

  const byListing = vendorListings()
    .map((l) => {
      const rows = bookings.filter((b) => b.experienceId === l.id);
      return { listing: l, earnings: earningsFor(rows) };
    })
    .filter((r) => r.earnings.bookings > 0)
    .sort((a, b) => b.earnings.grossMinor - a.earnings.grossMinor);

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">Vendor Portal</p>
            <h1 className="masthead__title">Earnings</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="card">
          <div className="card__head">
            <h2>Today</h2>
            <p className="card__note">
              {today.bookings} bookings · {today.guests} guests
            </p>
          </div>

          <div className="ledger">
            <div className="ledger__row">
              <span className="ledger__label">Gross</span>
              <span className="ledger__value">{formatUsd(today.grossMinor)}</span>
            </div>
            <div className="ledger__row ledger__row--minus">
              <span className="ledger__label">
                Platform fee
                <span className="ledger__rate">{Math.round(COMMISSION_RATE * 100)}%</span>
              </span>
              <span className="ledger__value">−{formatUsd(today.commissionMinor)}</span>
            </div>
            <div className="ledger__row ledger__row--total">
              <span className="ledger__label">Estimated net</span>
              <span className="ledger__value">{formatUsd(today.netMinor)}</span>
            </div>
          </div>
          <p className="card__note ledger__note">
            Net is an estimate until each booking clears. Cancellations inside the free window are
            deducted from the following payout.
          </p>
        </section>

        <section className="card">
          <div className="card__head">
            <h2>Last seven days</h2>
          </div>
          <div className="ledger">
            <div className="ledger__row">
              <span className="ledger__label">Gross</span>
              <span className="ledger__value">{formatUsd(week.grossMinor)}</span>
            </div>
            <div className="ledger__row ledger__row--minus">
              <span className="ledger__label">Platform fee</span>
              <span className="ledger__value">−{formatUsd(week.commissionMinor)}</span>
            </div>
            <div className="ledger__row ledger__row--total">
              <span className="ledger__label">Estimated net</span>
              <span className="ledger__value">{formatUsd(week.netMinor)}</span>
            </div>
          </div>
        </section>

        {byListing.length > 0 ? (
          <section className="card">
            <div className="card__head">
              <h2>By listing, today</h2>
            </div>
            <ul className="bylisting">
              {byListing.map(({ listing, earnings }) => (
                <li key={listing.id} className="bylisting__row">
                  <span className="bylisting__name">{listing.title}</span>
                  <span className="bylisting__meta">
                    {earnings.bookings} × {earnings.guests} guests
                  </span>
                  <span className="bylisting__net">{formatUsd(earnings.netMinor)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
