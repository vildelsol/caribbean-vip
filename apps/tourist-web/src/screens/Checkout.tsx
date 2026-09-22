import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_PARTY,
  experienceById,
  heroUrl,
  qualifiesForRumPunch,
  seatsIn,
  priceFor,
  vendorFor,
  type PartySelection,
} from '../data/catalogue';
import {
  cancellationDeadline,
  daysFor,
  firstBookableDay,
  formatLongDate,
  pickupTime,
  slotOn,
  slotsFor,
} from '../data/availability';
import { useStore } from '../state/store';
import { isLiveMode, callCheckout, resolveSlot, ensureLiveUser } from '../lib/api';
import { Icon } from '../components/Icon';
import {
  Badge,
  EmptyState,
  Photo,
  PrimaryButton,
  Stepper,
  formatUsd,
} from '../components/kit';
import './Checkout.css';

/**
 * Date, party and simulated payment — the design's "colour and ornament drain away as the total
 * comes into view".
 *
 * Every figure on this screen comes from `calculateBookingTotal` in `@cvip/types`. Nothing here
 * adds anything up: the itemisation, the tax, the service fee and the total are all read off one
 * breakdown, recomputed whenever the party or the slot changes. That is what makes the number here
 * identical to the one on the confirmation and in the day total, rather than merely similar.
 *
 * The calculator also rejects a party larger than the slot, so the error a guest sees is the same
 * rule the database would enforce — not a separate check that could drift from it.
 */
export function Checkout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, createBooking } = useStore();

  const experience = id ? experienceById(id) : undefined;
  const opening = experience ? firstBookableDay(experience) : undefined;

  const [dateISO, setDateISO] = useState<string | null>(opening?.iso ?? null);
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState<PartySelection>(DEFAULT_PARTY);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const days = useMemo(() => (experience ? daysFor(experience) : []), [experience]);
  const slots = useMemo(
    () => (experience && dateISO ? slotsFor(experience, dateISO) : []),
    [experience, dateISO],
  );

  // The chosen slot, or the first that still has room — so the screen always opens on something
  // bookable rather than on a full departure the guest then has to notice and change.
  const activeTime = time ?? slots.find((s) => s.capacityRemaining > 0)?.time ?? null;
  const slot = experience && dateISO && activeTime ? slotOn(experience, dateISO, activeTime) : undefined;

  const quote = useMemo(() => {
    if (!experience || !slot) return null;
    return priceFor(experience, party, slot.capacityRemaining);
  }, [experience, slot, party]);

  if (!experience) {
    return (
      <main className="screen">
        <EmptyState
          icon="search"
          title="That listing is not available"
          body="It may have been removed, or it belongs to another island."
          action="Back to Explore"
          onAction={() => navigate('/')}
        />
      </main>
    );
  }

  const vendor = vendorFor(experience);
  const seats = seatsIn(party);
  const rumPunch = qualifiesForRumPunch(experience);
  const liveVoucher = state.vouchers.find(
    (v) => v.promotionId === 'promo-rum-punch' && v.state === 'available',
  );

  const pay = async () => {
    if (!quote?.ok || !dateISO || !activeTime || paying) return;
    setPaying(true);
    setPayError(null);

    // A failure in the live path must say so. A silent `setPaying(false)` reads to a guest as the
    // Pay button simply un-pressing, which is indistinguishable from a misfire.
    const fail = (message: string) => {
      setPayError(message);
      setPaying(false);
    };

    if (isLiveMode) {
      // Live path: resolve DB slot UUID, then redirect to Stripe Checkout.
      const dbSlot = await resolveSlot({
        experienceTitle: experience.title,
        dateISO: dateISO!,
        time: activeTime!,
      });

      if (!dbSlot) {
        fail('We could not find that departure. Choose another time, or try again in a moment.');
        return;
      }

      const lines: { optionId: string; quantity: number }[] = [];
      for (const opt of dbSlot.options) {
        if (opt.kind === 'adult' && party.adults > 0) lines.push({ optionId: opt.id, quantity: party.adults });
        else if (opt.kind === 'child' && party.children > 0) lines.push({ optionId: opt.id, quantity: party.children });
        else if (opt.kind === 'addon' && party.photoPackage) lines.push({ optionId: opt.id, quantity: 1 });
      }

      if (lines.length === 0) {
        fail('That departure has no tickets matching your party. Choose another time.');
        return;
      }

      // `bookings.user_id` is a real foreign key onto `profiles`, so this has to be an auth id.
      // It was a `generateVoucherId()` token, which is base64url and failed the request schema's
      // `z.string().uuid()` before the foreign key ever got a chance to reject it.
      const userId = await ensureLiveUser();
      if (!userId) {
        fail('We could not start a secure session. Check your connection and try again.');
        return;
      }

      const idempotencyKey = crypto.randomUUID();

      const storeContext = (bookingId: string) => {
        try {
          sessionStorage.setItem(`slot_date_${bookingId}`, `${dateISO}T${activeTime}`);
          sessionStorage.setItem(`slot_time_${bookingId}`, activeTime);
          sessionStorage.setItem(`party_${bookingId}`, JSON.stringify(party));
        } catch {
          // sessionStorage unavailable — BookingReturn falls back to sensible defaults.
        }
      };

      const result = await callCheckout({
        userId,
        availabilitySlotId: dbSlot.slotId,
        lines,
        promotionId: rumPunch && liveVoucher ? liveVoucher.promotionId : null,
        customerEmail: null,
        idempotencyKey,
        experienceId: dbSlot.experienceId,
      });

      if (!result.ok) {
        fail(result.message || 'Payment could not be started. Please try again.');
        return;
      }

      storeContext(result.bookingId);
      window.location.href = result.checkoutUrl;
      return;
    }

    // Demo path: simulated payment with a deliberate beat.
    await new Promise((r) => setTimeout(r, 900));
    const b = quote.breakdown;
    const booking = await createBooking({
      experienceId: experience.id,
      islandId: experience.islandId,
      dateISO,
      time: activeTime,
      party,
      totalMinor: b.total.amountMinor,
      lines: b.lines.map((l) => ({
        label: l.label,
        quantity: l.quantity,
        amountMinor: l.lineTotal.amountMinor,
      })),
      subtotalMinor: b.subtotal.amountMinor,
      taxMinor: b.tax.amountMinor,
      serviceFeeMinor: b.serviceFee.amountMinor,
      status: 'confirmed',
      voucherId: rumPunch && liveVoucher ? liveVoucher.id : null,
    });
    navigate(`/confirmation/${booking.id}`, { replace: true });
  };

  return (
    <main className="screen screen--calm checkout">
      <header className="checkout__head">
        <button type="button" className="round-btn round-btn--light" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="chevron-left" size={17} strokeWidth={2.2} />
        </button>
        <h1 className="t-body-strong">Confirm your booking</h1>
      </header>

      <section className="checkout__listing">
        <Photo
          src={heroUrl(experience)}
          mediaKey={experience.media[0]}
          alt=""
          ratio="1 / 1"
          radius="var(--r-md)"
          className="checkout__thumb"
        />
        <div className="grow">
          <h2 className="t-display-sm">{experience.title}</h2>
          <p className="t-micro c-faint checkout__where">{vendor?.location.name}</p>
        </div>
      </section>

      {/* ---------------- Date ---------------- */}
      <section className="checkout__block">
        <h3 className="t-caption-strong checkout__label">Choose a day</h3>
        <div className="day-strip">
          {days.map((d) => {
            const on = d.iso === dateISO;
            return (
              <button
                key={d.iso}
                type="button"
                className={`day ${on ? 'day--on' : ''} ${d.hasAvailability ? '' : 'day--full'}`}
                disabled={!d.hasAvailability}
                onClick={() => {
                  setDateISO(d.iso);
                  setTime(null);
                }}
                aria-pressed={on}
                aria-label={`${formatLongDate(d.iso)}${d.hasAvailability ? '' : ', fully booked'}`}
              >
                <span className="day__weekday">{d.weekday}</span>
                <span className="day__num">{d.dayOfMonth}</span>
                <span className="day__month">{d.month}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- Time ---------------- */}
      <section className="checkout__block">
        <h3 className="t-caption-strong checkout__label">Departure</h3>
        {slots.length === 0 ? (
          <p className="t-caption c-muted">No departures on this day. Try another date.</p>
        ) : (
          <div className="time-row">
            {slots.map((s) => {
              const on = s.time === activeTime;
              const full = s.capacityRemaining === 0;
              return (
                <button
                  key={s.time}
                  type="button"
                  className={`slot ${on ? 'slot--on' : ''} ${full ? 'slot--full' : ''}`}
                  disabled={full}
                  onClick={() => setTime(s.time)}
                  aria-pressed={on}
                >
                  <span className="t-caption-strong">{s.label}</span>
                  <span className="slot__left t-micro">
                    {full ? 'Full' : `${s.capacityRemaining} left`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {slot && activeTime ? (
          <p className="t-micro c-locator checkout__pickup">
            <Icon name="car" size={13} color="var(--teal-text)" />
            Hotel pickup around {pickupTime(activeTime)}
          </p>
        ) : null}
      </section>

      {/* ---------------- Party ---------------- */}
      <section className="checkout__block">
        <h3 className="t-caption-strong checkout__label">Guests</h3>
        <div className="checkout__steppers">
          <Stepper
            label="Adults"
            sub={formatUsd(experience.fromAmountMinor)}
            value={party.adults}
            onChange={(adults) => setParty((p) => ({ ...p, adults }))}
            min={0}
            max={12}
          />
          <Stepper
            label="Children"
            sub={`${formatUsd(Math.round((experience.fromAmountMinor * 6) / 10))} · ages 4–11`}
            value={party.children}
            onChange={(children) => setParty((p) => ({ ...p, children }))}
            min={0}
            max={12}
          />
          <label className="addon">
            <input
              type="checkbox"
              checked={party.photoPackage}
              onChange={(e) => setParty((p) => ({ ...p, photoPackage: e.target.checked }))}
            />
            <span className="grow">
              <span className="t-caption-strong">Photo package</span>
              <span className="t-micro c-muted"> · {formatUsd(1500)}, does not take a place</span>
            </span>
          </label>
        </div>
      </section>

      {rumPunch && liveVoucher ? (
        <section className="checkout__voucher">
          <span className="checkout__voucher-icon">
            <Icon name="ticket" size={17} color="var(--on-dark)" />
          </span>
          <p className="grow t-caption-strong">Complimentary rum punch applied</p>
          <Badge tone="aqua">Voucher</Badge>
        </section>
      ) : null}

      {/* ---------------- Summary ---------------- */}
      <section className="checkout__block">
        <h3 className="t-caption-strong checkout__label">Summary</h3>
        {/*
          The total is the number the guest is deciding on, and it recomputes silently whenever the
          party or the departure changes. The stepper announces the new count, so a screen reader
          hears "3" and never hears what three costs. Announcing the block politely closes that gap;
          `atomic` is what makes it read the whole revised summary rather than the one figure that
          happened to change.
        */}
        <div aria-live="polite" aria-atomic="true">
        {!quote ? (
          <p className="t-caption c-muted">Choose a departure to see the total.</p>
        ) : !quote.ok ? (
          <p className="checkout__error t-caption-strong">
            <Icon name="close" size={14} color="var(--coral-text)" strokeWidth={2.4} />
            {quote.message}
          </p>
        ) : (
          <>
            <dl className="summary">
              {quote.breakdown.lines.map((l) => (
                <div key={l.optionId} className="summary__row">
                  <dt className="t-caption c-muted">
                    {l.quantity} × {l.label}
                  </dt>
                  <dd className="t-caption-strong">{formatUsd(l.lineTotal.amountMinor)}</dd>
                </div>
              ))}
              <div className="summary__row">
                <dt className="t-caption c-muted">Tax</dt>
                <dd className="t-caption-strong">{formatUsd(quote.breakdown.tax.amountMinor)}</dd>
              </div>
              <div className="summary__row">
                <dt className="t-caption c-muted">Service fee</dt>
                <dd className="t-caption-strong">{formatUsd(quote.breakdown.serviceFee.amountMinor)}</dd>
              </div>
              <div className="summary__row summary__row--total">
                <dt className="t-body-strong">Total</dt>
                <dd className="t-amount c-brand">
                  {formatUsd(quote.breakdown.total.amountMinor, { withCode: true })}
                </dd>
              </div>
            </dl>
            {dateISO && activeTime ? (
              <p className="t-micro c-faint checkout__policy">
                {formatLongDate(dateISO)} · free cancellation until{' '}
                {cancellationDeadline(experience, dateISO, activeTime)}
              </p>
            ) : null}
          </>
        )}
        </div>
      </section>

      {/* ---------------- Payment ---------------- */}
      <section className="checkout__block">
        <h3 className="t-caption-strong checkout__label">Payment</h3>
        {isLiveMode ? (
          <p className="sim-strip t-micro">
            <Icon name="lock" size={14} color="var(--ink-muted)" />
            You will be redirected to Stripe to complete payment securely.
          </p>
        ) : (
          <>
            <div className="card-row">
              <span className="card-row__chip" />
              <span className="grow t-caption-strong">Visa ···· 4242</span>
              <span className="t-micro c-faint">Saved card</span>
            </div>
            <p className="sim-strip t-micro">
              <Icon name="lock" size={14} color="var(--ink-muted)" />
              Your card details are encrypted in transit and never stored on this device.
            </p>
          </>
        )}
      </section>

      <div className="checkout__pay">
        {payError && (
          <p className="checkout__error t-micro" role="alert">
            <Icon name="lock" size={14} color="var(--coral-text)" />
            {payError}
          </p>
        )}
        <PrimaryButton
          onClick={pay}
          disabled={!quote?.ok || paying || seats === 0}
          aria-label={quote?.ok ? `Pay ${formatUsd(quote.breakdown.total.amountMinor)}` : 'Pay'}
        >
          {paying
            ? isLiveMode ? 'Redirecting…' : 'Confirming…'
            : quote?.ok
              ? `Pay ${formatUsd(quote.breakdown.total.amountMinor)}`
              : 'Choose a departure'}
        </PrimaryButton>
        <p className="t-micro c-faint checkout__reassure">
          {isLiveMode
            ? 'Secure payment via Stripe · operator confirms instantly'
            : 'Operator confirms instantly · free cancellation applies'}
        </p>
      </div>
    </main>
  );
}
