'use client';

import {
  EXPERIENCE_CATEGORIES,
  LISTING_LIMITS,
  listingTextSchema,
  type ExperienceCategory,
} from '@cvip/types';
import { demoBackend } from '@cvip/demo';
import { supabase, isSupabaseConfigured } from './supabase';
import { NO_LISTING_PERMISSION } from './permissions';
import { vendorListings } from './vendorData';

/**
 * The listings write path — V-02.
 *
 * Shaped after `redeem.ts`: one async surface, the demo/live branch inside this file rather than
 * at the call site. The page does not know which backend it is talking to, so the demo cannot
 * drift into being a different product from the real one.
 *
 * ## Why the demo path is not a stub
 *
 * Demo mode is a feature of this project, not scaffolding — `pnpm demo` runs the whole product
 * with no credentials and no Docker, and that has to keep working. So the demo path really does
 * mutate, in a module-level store seeded from the shared catalogue, and really does reject what
 * the live path would reject. It loses its writes on reload, which is correct for a demonstration
 * and is the one difference from live.
 *
 * ## The permission gate runs before either branch
 *
 * Every write takes `canManage`, the caller's derived listing-manager permission, and refuses
 * before it reaches a backend. Live, RLS would refuse anyway and the throw only turns a policy
 * error into a sentence; in demo mode there is no RLS at all, so this is the whole enforcement
 * and the demo keeps showing what the real permission does.
 *
 * ## Validation runs before either branch
 *
 * `listingTextSchema` is applied here rather than in each page, and the parsed output is what both
 * branches persist — the schema trims before measuring while the Postgres constraints measure what
 * is stored, so saving the raw input would let a title at exactly the limit plus a trailing space
 * violate `experiences_title_length` on the way in.
 */

export interface VendorListing {
  id: string;
  title: string;
  summary: string;
  fromAmountMinor: number;
  durationMinutes: number;
  ratingCount: number;
  status: 'approved' | 'draft';
}

export interface NewListingInput {
  title: string;
  summary: string;
  fromAmountMinor: number;
  durationMinutes: number;
  category: ExperienceCategory;
  destinationId: string;
}

export interface ListingEdit {
  id: string;
  title: string;
  summary: string;
  fromAmountMinor: number;
  durationMinutes: number;
}

export const isDemoListings = !isSupabaseConfigured;

export const LISTING_CATEGORIES = EXPERIENCE_CATEGORIES;

/**
 * Thrown for anything the operator can fix by editing the form.
 *
 * Distinct from a transport failure on purpose: a dropped connection is not a judgement about the
 * listing, and telling a vendor their title is wrong because the network blinked sends them
 * rewriting text that was already fine.
 */
export class ListingInvalid extends Error {}

/** Refuses a write by an ungranted member. `ListingInvalid`, so pages report it as operator-facing. */
function requireManager(canManage: boolean): void {
  if (!canManage) throw new ListingInvalid(NO_LISTING_PERMISSION);
}

/** The columns a listing write touches. Everything else on the row is set once, at creation. */
const SELECT = 'id, title, summary, from_amount_minor, duration_minutes, status';

type Row = {
  id: string;
  title: string;
  summary: string | null;
  from_amount_minor: number;
  duration_minutes: number;
  status: string;
};

function fromRow(r: Row, ratingCount = 0): VendorListing {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? '',
    fromAmountMinor: r.from_amount_minor,
    durationMinutes: r.duration_minutes,
    ratingCount,
    status: r.status === 'approved' ? 'approved' : 'draft',
  };
}

/**
 * Validate the two text fields and hand back what should be stored.
 *
 * `summary` goes to the database as null rather than '' when it is blank, because the column is
 * nullable and an empty string is a different thing from "not written yet" — the portal's own
 * list renders a prompt for null and would render nothing for ''.
 */
function parseText(title: string, summary: string): { title: string; summary: string | null } {
  const parsed = listingTextSchema
    .pick({ title: true, summary: true })
    .safeParse({ title, summary });
  if (!parsed.success) {
    throw new ListingInvalid(
      parsed.error.issues[0]?.message ?? 'That listing cannot be saved as it is.',
    );
  }
  const trimmedSummary = parsed.data.summary ?? '';
  return { title: parsed.data.title, summary: trimmedSummary.length > 0 ? trimmedSummary : null };
}

function parseNumbers(fromAmountMinor: number, durationMinutes: number) {
  if (!Number.isFinite(fromAmountMinor) || fromAmountMinor < 1) {
    throw new ListingInvalid('Set a price of at least US$1.');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
    throw new ListingInvalid('Set how long the experience runs.');
  }
  return {
    fromAmountMinor: Math.round(fromAmountMinor),
    durationMinutes: Math.round(durationMinutes),
  };
}

// ---------------------------------------------------------------------------
// Demo store
// ---------------------------------------------------------------------------

/**
 * Seeded lazily so the module can be imported during a server render without building the
 * catalogue, and kept at module scope so every screen in the portal sees the same mutations for
 * as long as the tab lives.
 */
let demoRows: VendorListing[] | null = null;

function demoStore(): VendorListing[] {
  demoRows ??= vendorListings().map((e) => ({
    id: e.id,
    title: e.title,
    summary: e.summary ?? '',
    fromAmountMinor: e.fromAmountMinor,
    durationMinutes: e.durationMinutes,
    ratingCount: e.ratingCount,
    status: e.status === 'approved' ? 'approved' : 'draft',
  }));
  return demoRows;
}

/** Test seam. The portal never calls this; `store.test.ts` does, to start from a known list. */
export function __resetDemoListings(): void {
  demoRows = null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadListings(orgId: string | null): Promise<VendorListing[]> {
  if (isDemoListings || !orgId) return [...demoStore()];

  const { data, error } = await supabase
    .from('experiences')
    .select(SELECT)
    .eq('vendor_org_id', orgId)
    .order('title');

  if (error) throw new Error(error.message);
  return (data as unknown as Row[]).map((r) => fromRow(r));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveListing(
  canManage: boolean,
  orgId: string | null,
  edit: ListingEdit,
): Promise<VendorListing> {
  requireManager(canManage);
  const text = parseText(edit.title, edit.summary);
  const nums = parseNumbers(edit.fromAmountMinor, edit.durationMinutes);

  if (isDemoListings || !orgId) {
    const rows = demoStore();
    const i = rows.findIndex((l) => l.id === edit.id);
    if (i === -1) throw new ListingInvalid('That listing no longer exists.');
    const next: VendorListing = {
      ...rows[i]!,
      title: text.title,
      summary: text.summary ?? '',
      ...nums,
    };
    rows[i] = next;
    return next;
  }

  const { data, error } = await supabase
    .from('experiences')
    .update({
      title: text.title,
      summary: text.summary,
      from_amount_minor: nums.fromAmountMinor,
      duration_minutes: nums.durationMinutes,
    })
    .eq('id', edit.id)
    .eq('vendor_org_id', orgId)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return fromRow(data as unknown as Row);
}

export async function createListing(
  canManage: boolean,
  orgId: string | null,
  islandId: string | null,
  input: NewListingInput,
): Promise<VendorListing> {
  requireManager(canManage);
  const text = parseText(input.title, input.summary);
  const nums = parseNumbers(input.fromAmountMinor, input.durationMinutes);

  if (isDemoListings || !orgId) {
    const next: VendorListing = {
      id: `new-${Date.now()}`,
      title: text.title,
      summary: text.summary ?? '',
      ...nums,
      ratingCount: 0,
      status: 'draft',
    };
    demoStore().push(next);
    return next;
  }

  if (!islandId) throw new ListingInvalid('This account is not attached to an island yet.');
  if (!input.destinationId) throw new ListingInvalid('Choose where the experience runs.');

  /*
   * A new listing is always a draft. Publishing is a separate, deliberate act with its own
   * button, and a listing that went live the moment it was typed would reach guests before
   * anybody had read it back.
   *
   * `currency` is USD because settlement is USD (OD-09); an island's currency is a display
   * conversion, never the amount charged.
   */
  const { data, error } = await supabase
    .from('experiences')
    .insert({
      vendor_org_id: orgId,
      island_id: islandId,
      destination_id: input.destinationId,
      category: input.category,
      title: text.title,
      summary: text.summary,
      from_amount_minor: nums.fromAmountMinor,
      duration_minutes: nums.durationMinutes,
      currency: 'USD',
      status: 'draft',
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return fromRow(data as unknown as Row);
}

export async function setListingStatus(
  canManage: boolean,
  orgId: string | null,
  id: string,
  status: 'approved' | 'draft',
): Promise<VendorListing> {
  requireManager(canManage);
  if (isDemoListings || !orgId) {
    const rows = demoStore();
    const i = rows.findIndex((l) => l.id === id);
    if (i === -1) throw new ListingInvalid('That listing no longer exists.');
    const next: VendorListing = { ...rows[i]!, status };
    rows[i] = next;
    return next;
  }

  const { data, error } = await supabase
    .from('experiences')
    .update({ status })
    .eq('id', id)
    .eq('vendor_org_id', orgId)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return fromRow(data as unknown as Row);
}

// ---------------------------------------------------------------------------
// Destinations, for the create form
// ---------------------------------------------------------------------------

export interface DestinationOption {
  id: string;
  name: string;
}

export async function loadDestinations(islandId: string | null): Promise<DestinationOption[]> {
  if (isDemoListings || !islandId) {
    const island = islandId ?? demoBackend.islands()[0]?.id ?? '';
    return demoBackend.destinations(island).map((d) => ({ id: d.id, name: d.name }));
  }

  const { data, error } = await supabase
    .from('destinations')
    .select('id, name')
    .eq('island_id', islandId)
    .order('sort_order');

  if (error) throw new Error(error.message);
  return (data as unknown as DestinationOption[]) ?? [];
}

export { LISTING_LIMITS };
