import {
  DEMO_EXPERIENCES,
  DEMO_PRICING_CONFIG,
  DEMO_VENDORS,
  type DemoExperience,
} from '@cvip/demo';

/**
 * The operating picture behind the portal.
 *
 * Until a vendor's own rows exist in Supabase, this derives a consistent day from the shared
 * catalogue: the same listings the tourist app sells, with bookings generated from a stable hash so
 * every screen in the portal agrees with every other one and a reload does not reshuffle the day.
 *
 * Money is the part that has to be right. Commission comes from `DEMO_PRICING_CONFIG` — the same
 * figure the tourist checkout prices against — so gross, fee and net here reconcile with what the
 * guest was actually charged rather than being an independent invention.
 */

/** The operator this portal is standing in for until real membership rows arrive. */
export const ACTIVE_VENDOR_ID = 'vendor-dunns';

export function activeVendor() {
  return DEMO_VENDORS.find((v) => v.id === ACTIVE_VENDOR_ID) ?? DEMO_VENDORS[0]!;
}

export function vendorListings(): DemoExperience[] {
  return DEMO_EXPERIENCES.filter((e) => e.vendorId === ACTIVE_VENDOR_ID);
}

/** Deterministic hash, so the same listing and date always produce the same day. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export interface VendorBooking {
  id: string;
  reference: string;
  experienceId: string;
  experienceTitle: string;
  time: string;
  guests: number;
  grossMinor: number;
  status: 'confirmed' | 'checked-in';
  guestName: string;
}

const GUEST_NAMES = [
  'D. Whitfield',
  'M. Okonkwo',
  'S. Ramírez',
  'A. Lindqvist',
  'P. Chatterjee',
  'J. Moreau',
  'T. Nakamura',
  'R. Campbell',
];

const TIMES = ['08:30', '09:00', '10:30', '11:30', '13:30', '14:00', '16:30'];

/** Today's manifest across every listing this vendor runs. */
export function todaysBookings(): VendorBooking[] {
  const today = new Date().toISOString().slice(0, 10);
  const out: VendorBooking[] = [];

  for (const e of vendorListings()) {
    const seed = hash(`${e.id}|${today}`);
    const count = (seed % 3) + 1;
    for (let i = 0; i < count; i += 1) {
      const s = hash(`${e.id}|${today}|${i}`);
      const guests = (s % 4) + 1;
      out.push({
        id: `${e.id}-${i}`,
        reference: `VIPJ-${String(s % 9000 + 1000)}-${String.fromCharCode(65 + (s % 26))}${s % 90 + 10}`,
        experienceId: e.id,
        experienceTitle: e.title,
        time: TIMES[s % TIMES.length]!,
        guests,
        grossMinor: e.fromAmountMinor * guests,
        status: s % 3 === 0 ? 'checked-in' : 'confirmed',
        guestName: GUEST_NAMES[s % GUEST_NAMES.length]!,
      });
    }
  }

  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export interface Earnings {
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  bookings: number;
  guests: number;
}

/**
 * Gross, platform fee and net, kept separate.
 *
 * V-07 asks for these as three figures rather than one, and that is the right call: a vendor
 * deciding whether this channel is worth it cannot do that from a net number alone, and a portal
 * that shows only what lands in the bank looks like it is hiding the rate.
 */
export function earningsFor(bookings: VendorBooking[]): Earnings {
  const grossMinor = bookings.reduce((s, b) => s + b.grossMinor, 0);
  const commissionMinor = Math.round(grossMinor * DEMO_PRICING_CONFIG.commissionRate);
  return {
    grossMinor,
    commissionMinor,
    netMinor: grossMinor - commissionMinor,
    bookings: bookings.length,
    guests: bookings.reduce((s, b) => s + b.guests, 0),
  };
}

export const COMMISSION_RATE = DEMO_PRICING_CONFIG.commissionRate;

export function formatUsd(minor: number): string {
  const major = minor / 100;
  const hasCents = minor % 100 !== 0;
  return `US$${major.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** The next fourteen days of capacity for one listing, derived the same way availability is. */
export function capacityFor(experience: DemoExperience, days = 14) {
  const out: { iso: string; label: string; slots: { time: string; capacity: number; sold: number }[] }[] = [];
  const times =
    experience.durationMinutes >= 360
      ? ['08:30']
      : experience.durationMinutes >= 210
        ? ['09:00', '13:30']
        : ['09:00', '11:30', '14:00', '16:30'];

  for (let d = 0; d < days; d += 1) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const iso = date.toISOString().slice(0, 10);
    out.push({
      iso,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      slots: times.map((time) => {
        const s = hash(`${experience.id}|${iso}|${time}`);
        const capacity = 12;
        return { time, capacity, sold: s % (capacity + 1) };
      }),
    });
  }
  return out;
}
