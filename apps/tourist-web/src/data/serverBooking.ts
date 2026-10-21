import type { Booking } from '../state/store';
import type { PartySelection } from './catalogue';
import { ISLANDS, visibleExperiences } from './catalogue';

/**
 * Recovering a tourist's bookings from the server on a new device.
 *
 * `my_bookings()` (supabase/migrations/20261021000001_my_bookings.sql) returns the signed-in
 * tourist's paid bookings. This module turns one of its rows into the local `Booking` the screens
 * already render, and merges the recovered list into whatever the device already holds.
 *
 * Pure, with no Supabase import, so it can be tested without a network and dispatched from live
 * code only. Demo mode never calls it.
 */

export type ServerBookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'refunded'
  | 'expired';

export interface ServerGuest {
  kind: 'adult' | 'child' | 'infant' | 'addon' | 'ticket_type';
  label: string;
  quantity: number;
  unit_amount_minor: number;
}

/** One row of `my_bookings()`, as PostgREST returns it. */
export interface ServerBookingRow {
  id: string;
  reference: string;
  status: ServerBookingStatus;
  seats: number;
  currency: 'USD' | 'JMD' | 'KYD' | 'BBD';
  subtotal_minor: number;
  tax_minor: number;
  service_fee_minor: number;
  total_minor: number;
  created_at: string;
  ticket_token: string | null;
  experience_title: string;
  island_code: string;
  starts_at: string;
  guests: ServerGuest[] | null;
}

// ---------------------------------------------------------------------------
// Slot time — UTC wall-clock, the inverse of resolve-slot
// ---------------------------------------------------------------------------

/**
 * The `starts_at` resolve-slot looks a departure up by.
 *
 * Must stay byte-identical to `supabase/functions/resolve-slot/index.ts`, which treats the demo's
 * wall-clock times as UTC because that is how the seed generates the slots.
 */
export function slotStartsAt(dateISO: string, time: string): string {
  return `${dateISO}T${time}:00+00:00`;
}

/** The inverse: a server `starts_at` back to the local day and departure, read in UTC. */
export function slotWallClock(startsAt: string | null | undefined): { dateISO: string; time: string } {
  if (!startsAt) return { dateISO: '', time: '' };
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return { dateISO: '', time: '' };
  const iso = d.toISOString(); // always UTC: YYYY-MM-DDTHH:MM:SS.sssZ
  return { dateISO: iso.slice(0, 10), time: iso.slice(11, 16) };
}

// ---------------------------------------------------------------------------
// Catalogue mapping
// ---------------------------------------------------------------------------

const UNMAPPED_PREFIX = 'unmapped:';

function isCatalogueExperience(id: string): boolean {
  return visibleExperiences().some((e) => e.id === id);
}

/**
 * The local catalogue id for a DB listing title.
 *
 * The tourist app reads its catalogue from `@cvip/demo` and resolve-slot finds the DB listing by
 * exact title, so the title is the join between the two. A title this build does not carry (a
 * listing added or renamed after it shipped) still gets an id, a stable placeholder. The screens
 * already fall back to "Your booking" for an id they cannot find, and a paid booking that renders
 * plainly is far better than one that disappears.
 */
export function experienceIdForTitle(title: string): string {
  const match = visibleExperiences().find((e) => e.title === title);
  return match ? match.id : `${UNMAPPED_PREFIX}${title}`;
}

/** `JM` → `island-jm`, the id format `@cvip/demo` uses. */
export function islandIdForCode(code: string): string {
  const known = ISLANDS.find((i) => i.code.toUpperCase() === code.toUpperCase());
  return known ? known.id : `island-${code.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Row → Booking
// ---------------------------------------------------------------------------

/** PostgREST may serialise `bigint` as a string; amounts must be numbers locally. */
function minor(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The label the photo package add-on carries, in the catalogue (`demoOptionsFor` in @cvip/demo)
 * and in the seed's `experience_options` row that resolve-slot returns. `my_bookings()` reports a
 * guest line by option kind and label only, so the label is the match. Any other add-on is still
 * itemised in `lines`; it just is not the photo package.
 */
export const PHOTO_PACKAGE_LABEL = 'Photo package';

function isPhotoPackage(g: ServerGuest): boolean {
  return g.kind === 'addon' && g.quantity > 0 && g.label.trim().toLowerCase() === PHOTO_PACKAGE_LABEL.toLowerCase();
}

function partyFrom(guests: ServerGuest[], seats: number): PartySelection {
  if (guests.length === 0) return { adults: seats, children: 0, photoPackage: false };
  let adults = 0;
  let children = 0;
  let photoPackage = false;
  for (const g of guests) {
    if (g.kind === 'adult' || g.kind === 'ticket_type') adults += g.quantity;
    else if (g.kind === 'child' || g.kind === 'infant') children += g.quantity;
    else if (isPhotoPackage(g)) photoPackage = true;
  }
  return { adults, children, photoPackage };
}

/**
 * One `my_bookings()` row as a local booking, or `null` when it should not be shown.
 *
 * Skipped: unpaid rows (`pending_payment`, `expired`; the RPC already excludes them) and a
 * confirmed row with no ticket token, which is a webhook that has not landed yet and would render
 * a ticket with no QR. Cancelled and refunded rows are kept, so the guest can see what was
 * cancelled, but always without a token: `my_bookings()` already returns null for them
 * (20261021000003), and this does not trust that alone. A cancelled ticket must not scan.
 */
export function bookingFromServer(row: ServerBookingRow): Booking | null {
  let status: Booking['status'];
  switch (row.status) {
    case 'confirmed':
    case 'completed':
      status = 'confirmed';
      break;
    case 'cancelled':
    case 'refunded':
      status = 'cancelled';
      break;
    default:
      return null;
  }

  const token = status === 'confirmed' ? (row.ticket_token ?? '') : '';
  if (status === 'confirmed' && !token) return null;

  const guests = row.guests ?? [];
  const { dateISO, time } = slotWallClock(row.starts_at);

  return {
    id: row.id,
    reference: row.reference,
    experienceId: experienceIdForTitle(row.experience_title),
    islandId: islandIdForCode(row.island_code),
    dateISO,
    time,
    party: partyFrom(guests, row.seats),
    // Amounts are USD minor units (OD-09); `currency` is not carried locally.
    totalMinor: minor(row.total_minor),
    lines: guests.map((g) => ({
      label: g.label,
      quantity: g.quantity,
      amountMinor: minor(g.unit_amount_minor) * g.quantity,
    })),
    taxMinor: minor(row.tax_minor),
    serviceFeeMinor: minor(row.service_fee_minor),
    subtotalMinor: minor(row.subtotal_minor),
    status,
    createdAtISO: row.created_at,
    ticketToken: token,
    voucherId: null,
    attendeeName: null,
    source: 'server',
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function mergeOne(local: Booking, server: Booking): Booking {
  const localHasDetail = local.lines.length > 0;
  return {
    ...local,
    // The server is the record of what was paid and what state it is in.
    status: server.status,
    reference: server.reference,
    // A cancelled booking keeps no scannable token, wherever the token came from.
    ticketToken: server.status === 'cancelled' ? '' : server.ticketToken || local.ticketToken,
    totalMinor: server.totalMinor,
    subtotalMinor: server.subtotalMinor,
    taxMinor: server.taxMinor,
    serviceFeeMinor: server.serviceFeeMinor,
    createdAtISO: server.createdAtISO || local.createdAtISO,
    // The departure the server holds is the real one.
    dateISO: server.dateISO || local.dateISO,
    time: server.time || local.time,
    islandId: server.islandId || local.islandId,
    // A server title the catalogue does not know must not overwrite a local id that works.
    experienceId: isCatalogueExperience(server.experienceId) ? server.experienceId : local.experienceId,
    // The device keeps what only the device knows; itemisation is taken from the server only when
    // the local copy has none (BookingReturn's fallback reconstructs bookings with `lines: []`).
    party: localHasDetail || server.lines.length === 0 ? local.party : server.party,
    lines: localHasDetail ? local.lines : server.lines,
    attendeeName: local.attendeeName,
    voucherId: local.voucherId,
    source: 'server',
  };
}

/**
 * Fill-only: `incoming` is NOT a server row (BookingReturn's reconstruction from booking-status
 * and device storage), so it may only supply what the device still lacks. Real server values that
 * `useLiveSync` already merged (island, day, departure, itemisation) are never overwritten.
 */
function fillOne(local: Booking, incoming: Booking): Booking {
  const takeLines = local.lines.length === 0 && incoming.lines.length > 0;
  return {
    ...local,
    reference: local.reference || incoming.reference,
    experienceId: local.experienceId || incoming.experienceId,
    islandId: local.islandId || incoming.islandId,
    dateISO: local.dateISO || incoming.dateISO,
    time: local.time || incoming.time,
    createdAtISO: local.createdAtISO || incoming.createdAtISO,
    ticketToken: local.status === 'cancelled' ? local.ticketToken : local.ticketToken || incoming.ticketToken,
    party: takeLines ? incoming.party : local.party,
    lines: takeLines ? incoming.lines : local.lines,
    attendeeName: local.attendeeName ?? incoming.attendeeName,
    voucherId: local.voucherId ?? incoming.voucherId,
    source: local.source ?? incoming.source,
  };
}

/** Structural equality over plain booking data; an `undefined` property counts as absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue(ra[k], rb[k]));
}

export interface MergeOptions {
  /** The incoming bookings are a reconstruction, not server rows: fill empty fields only. */
  fillOnly?: boolean;
}

/**
 * The device's bookings with the server's folded in.
 *
 * - Matched by id. By reference only for a local booking with no server source (a legacy copy
 *   whose id differs); that booking then takes the server id, so the next sync matches by id.
 *   Two server bookings are always told apart by id.
 * - The server wins for status, ticket token, reference, totals and the departure time; the
 *   device keeps attendee, voucher, and party/lines when it has them. A cancelled booking keeps
 *   no token.
 * - A booking only the device holds is never removed: demo bookings and anything the server
 *   did not return stay exactly as they were.
 * - Server-only bookings are appended in server order.
 * - A booking the merge does not change is returned as the same object, so a sync that changes
 *   nothing lets the reducer return the same state.
 * - Idempotent: merging the same server list twice gives the same result.
 */
export function mergeBookings(
  local: readonly Booking[],
  server: readonly Booking[],
  options: MergeOptions = {},
): Booking[] {
  const result = local.map((b) => b);

  // A repeated server row needs no special case: the second copy matches the first by id and
  // merges into it, which is exactly the idempotence property.
  for (const s of server) {
    let i = result.findIndex((b) => b.id === s.id);
    let byReference = false;
    if (i === -1) {
      i = result.findIndex((b) => b.source !== 'server' && b.reference === s.reference);
      byReference = i !== -1;
    }

    if (i === -1) {
      // Anything merged as a server row is server-sourced, however it was built.
      result.push(options.fillOnly || s.source === 'server' ? s : { ...s, source: 'server' });
      continue;
    }
    const current = result[i]!;
    const merged = options.fillOnly ? fillOne(current, s) : mergeOne(current, s);
    if (byReference && !options.fillOnly) merged.id = s.id;
    result[i] = sameValue(merged, current) ? current : merged;
  }

  return result;
}
