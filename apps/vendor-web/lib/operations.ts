import {
  COMMISSION_RATE,
  activeVendor,
  earningsFor,
  todaysBookings,
  vendorListings,
  type Earnings,
  type VendorBooking,
} from './vendorData';

/**
 * The operating picture the Today and Earnings screens draw, in one shape for both modes.
 *
 * Demo mode builds it from the seeded catalogue (`demoOperations`, the same arithmetic those
 * screens ran inline before). Live mode builds it from `bookings` rows the vendor is allowed to
 * read (`liveOperations`). Everything here is pure: the query lives in `useOperations.ts`, so the
 * money and the day boundaries can be tested without a database.
 */

export interface LiveBooking extends VendorBooking {
  commissionMinor: number;
  startsAt: string;
}

export interface Operations {
  vendorName: string;
  listingCount: number;
  today: VendorBooking[];
  todayEarnings: Earnings;
  week: { grossMinor: number; commissionMinor: number; netMinor: number };
  /** Whole percent shown beside the platform fee; null when nothing is booked to take a rate from. */
  commissionPct: number | null;
  byListing: { id: string; title: string; earnings: Earnings }[];
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

/** One `bookings` row with the embeds `useOperations` asks for. */
export interface BookingRow {
  id: string;
  reference: string;
  status: string;
  seats: number;
  subtotal_minor: number;
  discount_minor: number;
  commission_minor: number;
  experience_id: string;
  experiences: { title: string } | null;
  availability_slots: { starts_at: string } | null;
  booking_guests: { guest_name: string | null }[] | null;
  vouchers: { state: string }[] | null;
}

/** Statuses that put a guest on the manifest. Unpaid, cancelled, refunded and expired do not. */
const MANIFEST_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'completed']);

/** `YYYY-MM-DD` of an instant on the island's wall clock. A vendor's "today" is theirs, not UTC's. */
export function dayKey(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** `HH:MM`, 24-hour, on the island's wall clock. */
export function timeLabel(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/**
 * The vendor's gross is what the guest paid for the experience, before platform fee, tax and the
 * guest's service fee: `subtotal − discount`. Net takes the commission off that. This is
 * `vendorNet` in `packages/payments/src/checkout.ts`; vendor-web does not depend on that package,
 * so the formula is restated here. Change them together.
 */
export function toLiveBooking(row: BookingRow, timeZone: string): LiveBooking | null {
  const startsAt = row.availability_slots?.starts_at;
  if (!startsAt || !MANIFEST_STATUSES.has(row.status)) return null;

  const named = row.booking_guests?.map((g) => g.guest_name?.trim()).find((n) => n);
  const redeemed = row.vouchers?.some((v) => v.state === 'redeemed') ?? false;

  return {
    id: row.id,
    reference: row.reference,
    experienceId: row.experience_id,
    experienceTitle: row.experiences?.title ?? 'Experience',
    time: timeLabel(startsAt, timeZone),
    guests: row.seats,
    grossMinor: row.subtotal_minor - row.discount_minor,
    commissionMinor: row.commission_minor,
    status: redeemed || row.status === 'completed' ? 'checked-in' : 'confirmed',
    guestName: named ?? 'Guest',
    startsAt,
  };
}

function earningsOf(bookings: LiveBooking[]): Earnings {
  const grossMinor = bookings.reduce((s, b) => s + b.grossMinor, 0);
  const commissionMinor = bookings.reduce((s, b) => s + b.commissionMinor, 0);
  return {
    grossMinor,
    commissionMinor,
    netMinor: grossMinor - commissionMinor,
    bookings: bookings.length,
    guests: bookings.reduce((s, b) => s + b.guests, 0),
  };
}

export function liveOperations(input: {
  rows: BookingRow[];
  vendorName: string;
  listingCount: number;
  timeZone: string;
  now: Date;
}): Operations {
  const { rows, vendorName, listingCount, timeZone, now } = input;
  const all = rows
    .map((r) => toLiveBooking(r, timeZone))
    .filter((b): b is LiveBooking => b !== null);

  const todayKey = dayKey(now, timeZone);
  // Seven wall-clock days ending today. These zones have no daylight saving, so 24 h steps land
  // on the previous date.
  const weekKeys = new Set(
    Array.from({ length: 7 }, (_, i) => dayKey(new Date(now.getTime() - i * 86_400_000), timeZone)),
  );

  const today = all
    .filter((b) => dayKey(b.startsAt, timeZone) === todayKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const week = earningsOf(all.filter((b) => weekKeys.has(dayKey(b.startsAt, timeZone))));
  const todayEarnings = earningsOf(today);

  const byListing = [...new Set(today.map((b) => b.experienceId))]
    .map((id) => {
      const rowsFor = today.filter((b) => b.experienceId === id);
      return { id, title: rowsFor[0]!.experienceTitle, earnings: earningsOf(rowsFor) };
    })
    .sort((a, b) => b.earnings.grossMinor - a.earnings.grossMinor);

  return {
    vendorName,
    listingCount,
    today,
    todayEarnings,
    week: { grossMinor: week.grossMinor, commissionMinor: week.commissionMinor, netMinor: week.netMinor },
    commissionPct:
      todayEarnings.grossMinor > 0
        ? Math.round((todayEarnings.commissionMinor / todayEarnings.grossMinor) * 100)
        : null,
    byListing,
  };
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

/** What Today and Earnings computed inline before this module existed, unchanged. */
export function demoOperations(): Operations {
  const bookings = todaysBookings();
  const todayEarnings = earningsFor(bookings);

  // A settled week behind today, derived from the same manifest so the two screens agree.
  const weekMultiplier = 5.4;

  return {
    vendorName: activeVendor().tradingName,
    listingCount: vendorListings().length,
    today: bookings,
    todayEarnings,
    week: {
      grossMinor: Math.round(todayEarnings.grossMinor * weekMultiplier),
      commissionMinor: Math.round(todayEarnings.commissionMinor * weekMultiplier),
      netMinor: Math.round(todayEarnings.netMinor * weekMultiplier),
    },
    commissionPct: Math.round(COMMISSION_RATE * 100),
    byListing: vendorListings()
      .map((l) => ({
        id: l.id,
        title: l.title,
        earnings: earningsFor(bookings.filter((b) => b.experienceId === l.id)),
      }))
      .filter((r) => r.earnings.bookings > 0)
      .sort((a, b) => b.earnings.grossMinor - a.earnings.grossMinor),
  };
}
