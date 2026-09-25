import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_PARTY,
  partyFitting,
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
import {
  attendeeLabel,
  describeClash,
  findBookingClashes,
  knownAttendees,
} from '../data/bookingClash';
import { useStore } from '../state/store';
import { isLiveMode, callCheckout, resolveSlot, ensureLiveUser } from '../lib/api';
import { Icon } from '../components/Icon';
import {
  Badge,
  EmptyState,
  Photo,
  PrimaryButton,
  SecondaryButton,
  Stepper,
  TextButton,
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
  /*
   * The party opens at a size the auto-selected departure can actually take.
   *
   * Arriving from "Check Availability" on a departure with one seat left used to put a red error
   * and a disabled button on screen before the guest had touched anything: the screen picked the
   * departure, picked two adults, and then reported the conflict as the guest's. Computed lazily
   * so it reads the opening day's first bookable slot exactly once, on mount — after that the
   * party is the guest's and is never silently rewritten under them.
   */
  const [party, setParty] = useState<PartySelection>(() => {
    if (!experience || !opening) return DEFAULT_PARTY;
    const first = slotsFor(experience, opening.iso).find((s) => s.capacityRemaining > 0);
    return first ? partyFitting(first.capacityRemaining) : DEFAULT_PARTY;
  });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  /*
   * Who is going. `null` is the account holder and is the default, because they are who is booking
   * in almost every case and a picker that demands an answer before it has a reason to is friction
   * on the money screen. It only becomes a question when a clash makes it one.
   */
  const [attendee, setAttendee] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [namingSomeoneElse, setNamingSomeoneElse] = useState(false);
  /** The clash the guest has been shown and accepted, so the warning is not raised twice. */
  const [clashAccepted, setClashAccepted] = useState(false);
  const [clashPrompt, setClashPrompt] = useState(false);

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

  /*
   * Everything this attendee already holds that this departure cannot sit beside.
   *
   * Recomputed from the chosen day, departure and attendee rather than checked once at payment, so
   * changing any of the three clears or raises the warning immediately — a guest who moves to a
   * later departure to resolve a clash should see it resolve, not discover at the Pay button that
   * it did.
   */
  const clashes = useMemo(() => {
    if (!experience || !dateISO || !activeTime) return [];
    return findBookingClashes(
      { experienceId: experience.id, dateISO, time: activeTime, attendeeName: attendee },
      state.bookings,
    );
  }, [experience, dateISO, activeTime, attendee, state.bookings]);

  const clash = clashes[0] ?? null;

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

  const ownLabel = attendeeLabel(null, state.guestName);
  const attendees = knownAttendees(state.bookings, state.guestName);
  const clashMessage = clash ? describeClash(clash, attendeeLabel(attendee, state.guestName)) : null;

  const pay = async (force = false) => {
    if (!quote?.ok || !dateISO || !activeTime || paying) return;

    /*
     * The double-booking gate.
     *
     * It stops at the Pay button rather than disabling it, because a clash is not always a mistake:
     * a couple paying from one card genuinely book two things at the same hour, for two people. The
     * guest is the only one who knows which case this is, so the app asks instead of ruling — and
     * the dialog offers naming the other person as a first-class answer, not a way of dismissing
     * the warning. Refusing outright would block the legitimate case; saying nothing, which is what
     * it did before, sells a seat nobody can use.
     */
    // `force` is passed by the dialog's own "book it anyway", because `clashAccepted` is state and
    // would not be readable in this closure on the same tick the guest pressed it.
    if (clash && !clashAccepted && !force) {
      setClashPrompt(true);
      return;
    }

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
          // Stripe takes the guest off-site, so the attendee has to survive the round trip or the
          // ticket comes back in the account holder's name for a booking made for someone else.
          if (attendee) sessionStorage.setItem(`attendee_${bookingId}`, attendee);
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
      attendeeName: attendee,
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
                  setClashAccepted(false);
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
                  onClick={() => {
                    setTime(s.time);
                    setClashAccepted(false);
                  }}
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

      {/* ---------------- Who it is for ---------------- */}
      {/*
        Shown only once this account has booked something, because until then there is nobody else
        it could be for and the question is noise on the screen where the guest is deciding to pay.
        After that it is the control that makes a couple's two overlapping bookings expressible.
      */}
      {state.bookings.length > 0 ? (
        <section className="checkout__block">
          <h3 className="t-caption-strong checkout__label">Who is this for?</h3>
          <div className="attendee-row">
            {attendees.map((name) => {
              const value = name === ownLabel ? null : name;
              const on = (attendee ?? ownLabel) === (value ?? ownLabel);
              return (
                <button
                  key={name}
                  type="button"
                  className={`attendee ${on ? 'attendee--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setAttendee(value);
                    setNamingSomeoneElse(false);
                    setClashAccepted(false);
                  }}
                >
                  {name}
                </button>
              );
            })}
            <button
              type="button"
              className={`attendee attendee--add ${namingSomeoneElse ? 'attendee--on' : ''}`}
              aria-pressed={namingSomeoneElse}
              onClick={() => {
                setNamingSomeoneElse(true);
                setNameDraft('');
              }}
            >
              <Icon name="plus" size={13} strokeWidth={2.4} />
              Someone else
            </button>
          </div>

          {namingSomeoneElse ? (
            <div className="attendee-name">
              <label className="t-micro c-muted" htmlFor="attendee-name">
                Their name, as it should read on the ticket
              </label>
              <input
                id="attendee-name"
                className="attendee-name__input"
                type="text"
                autoComplete="off"
                maxLength={40}
                value={nameDraft}
                placeholder="e.g. Marcus Bennett"
                onChange={(e) => {
                  // Committed as it is typed rather than on blur. Blur ordering is the kind of
                  // thing that works until a guest taps Pay directly from the field, and a name
                  // that silently failed to attach is a ticket in the wrong person's name.
                  setNameDraft(e.target.value);
                  setAttendee(e.target.value.trim() || null);
                  setClashAccepted(false);
                }}
              />
            </div>
          ) : null}

          <p className="t-micro c-faint checkout__attendee-note">
            They get their own ticket and QR code, which you can send them from Trips.
          </p>
        </section>
      ) : null}

      {/*
        The warning sits here, above the total, not on the Pay button. A guest who is about to pay
        for something they cannot attend should find that out while the departure list is still on
        screen and changing it is one tap, rather than at the last control.
      */}
      {clash && clashMessage ? (
        <section className="checkout__clash" role="status">
          <span className="checkout__clash-icon" aria-hidden>
            <Icon name="calendar" size={15} color="var(--coral-text)" strokeWidth={2.2} />
          </span>
          <div className="grow">
            <p className="t-caption-strong">{clashMessage.headline}</p>
            <p className="t-micro c-muted">{clashMessage.detail}</p>
          </div>
        </section>
      ) : null}

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
          onClick={() => void pay()}
          disabled={!quote?.ok || paying || seats === 0}
          aria-label={quote?.ok ? `Pay ${formatUsd(quote.breakdown.total.amountMinor)}` : 'Pay'}
        >
          {paying
            ? isLiveMode ? 'Redirecting…' : 'Confirming…'
            : quote?.ok
              ? `Pay ${formatUsd(quote.breakdown.total.amountMinor)}`
              : /* Name the blocker. A departure *was* chosen in the capacity case, so telling the
                   guest to choose one sends them to change the thing that was already right. */
                quote?.code === 'capacity'
                ? 'Too many guests for this departure'
                : quote?.code === 'no-guests'
                  ? 'Add a guest'
                  : 'Choose a departure'}
        </PrimaryButton>
        <p className="t-micro c-faint checkout__reassure">
          {isLiveMode
            ? 'Secure payment via Stripe · operator confirms instantly'
            : 'Operator confirms instantly · free cancellation applies'}
        </p>
      </div>

      {/*
        The gate itself. Three ways out and they are not equally weighted on purpose: changing the
        departure is the plain fix and leads; naming the other guest is the couple's answer and is
        the reason this is a question rather than a refusal; paying anyway is last and is still
        allowed, because the app does not know better than the guest who is standing where.
      */}
      {clashPrompt && clash && clashMessage ? (
        <div className="clash-scrim" role="presentation" onClick={() => setClashPrompt(false)}>
          <div
            className="clash-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clash-title"
            aria-describedby="clash-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="clash-title" className="t-display-sm clash-sheet__title">
              {clashMessage.headline}
            </h2>
            <p id="clash-detail" className="t-caption c-muted clash-sheet__detail">
              {clashMessage.detail}
            </p>

            <div className="clash-sheet__actions">
              <PrimaryButton onClick={() => setClashPrompt(false)}>Choose another time</PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setClashPrompt(false);
                  setNamingSomeoneElse(true);
                  setNameDraft('');
                  setAttendee(null);
                }}
              >
                It is for someone else
              </SecondaryButton>
              <TextButton
                onClick={() => {
                  setClashAccepted(true);
                  setClashPrompt(false);
                  void pay(true);
                }}
              >
                {clashMessage.proceedLabel}
              </TextButton>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
