import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTING_AUDIT_ENTITY } from './listingReview';
import { PROMOTION_AUDIT_ENTITY } from './promotionReview';
import { VENDOR_AUDIT_ENTITY } from './vendorReview';

// `audit_status_change()` files its own row under the table name. The console's explicit audit row
// for the same decision must use the same spelling, or one entity ends up under two entity types.
const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260802000009_functions.sql'),
  'utf8',
);
const triggerTables = [...migration.matchAll(/create trigger \w+_audit\s+after update of status on (\w+)/g)].map(
  (m) => m[1],
);

describe('audit entity types', () => {
  it('the trigger sources are found', () => {
    expect(triggerTables).toEqual(expect.arrayContaining(['vendor_organizations', 'experiences']));
  });

  it('listing decisions are filed under the audited table name', () => {
    expect(triggerTables).toContain(LISTING_AUDIT_ENTITY);
  });

  it('vendor decisions are filed under the audited table name', () => {
    expect(triggerTables).toContain(VENDOR_AUDIT_ENTITY);
  });

  it('promotion decisions are filed under the audited table name', () => {
    const promotionMigration = readFileSync(
      join(__dirname, '../../../supabase/migrations/20261031000002_audit_promotion_approval.sql'),
      'utf8',
    );
    const tables = [...promotionMigration.matchAll(/create trigger \w+_audit\s+after update of approval_state on (\w+)/g)].map(
      (m) => m[1],
    );
    expect(tables).toContain(PROMOTION_AUDIT_ENTITY);
  });
});
