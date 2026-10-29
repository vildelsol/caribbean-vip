import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listingAction,
  parseListingStatus,
  statusView,
  vendorMayMove,
  type ListingStatus,
} from './listingStatus';

const ALL: ListingStatus[] = ['draft', 'pending_review', 'approved', 'rejected', 'unpublished'];

describe('vendorMayMove', () => {
  it('agrees with the database guard on every pair', () => {
    // Read from the migration, not restated: a pinned list here would pass while the trigger and
    // this table had both drifted from each other.
    const sql = readFileSync(
      join(__dirname, '../../../supabase/migrations/20261029000001_guard_listing_review_fields.sql'),
      'utf8',
    );
    const block = sql.slice(sql.indexOf('not in ('), sql.indexOf(')\n  then', sql.indexOf('not in (')));
    const allowed = new Set(
      [...block.matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map(([, from, to]) => `${from}>${to}`),
    );
    expect(allowed.size).toBeGreaterThan(0);

    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue;
        expect(vendorMayMove(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it('never lets a vendor approve or reject', () => {
    for (const from of ALL) {
      expect(vendorMayMove(from, 'approved')).toBe(false);
      expect(vendorMayMove(from, 'rejected')).toBe(false);
    }
  });
});

describe('listingAction', () => {
  it.each(ALL)('live: the button for %s never produces approved', (status) => {
    const action = listingAction(status, false);
    expect(action).not.toBeNull();
    expect(action!.to).not.toBe('approved');
  });

  it.each(ALL)('live: the button for %s is a move the database allows', (status) => {
    const action = listingAction(status, false)!;
    expect(vendorMayMove(status, action.to)).toBe(true);
  });

  it('live: a draft is submitted, not published', () => {
    expect(listingAction('draft', false)).toMatchObject({ label: 'Submit for review', to: 'pending_review' });
  });

  it('demo: keeps Publish and Unpublish, since demo has no moderation', () => {
    expect(listingAction('draft', true)).toMatchObject({ label: 'Publish', to: 'approved', quiet: false });
    expect(listingAction('approved', true)).toMatchObject({ label: 'Unpublish', to: 'draft', quiet: true });
  });
});

describe('statusView and parseListingStatus', () => {
  it('shows every status a distinct label, with Live and Draft unchanged', () => {
    const labels = ALL.map((s) => statusView(s).label);
    expect(new Set(labels).size).toBe(ALL.length);
    expect(statusView('approved')).toEqual({ label: 'Live', pillClass: 'pill--live' });
    expect(statusView('draft')).toEqual({ label: 'Draft', pillClass: 'pill--draft' });
  });

  it('reads an unknown value as a draft, never as live', () => {
    expect(parseListingStatus('something_new')).toBe('draft');
    expect(parseListingStatus('approved')).toBe('approved');
  });
});
