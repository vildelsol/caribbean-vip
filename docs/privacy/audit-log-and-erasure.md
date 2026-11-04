# Audit log versus erasure: proposed rule (DRAFT for counsel)

**Problem.** `audit_logs` is append-only on purpose (a trigger blocks update and delete) and its
`before` and `after` columns hold snapshots of whatever an admin changed. When that was a person's
record, the snapshot holds personal data. Erasure (`erase_my_data()`) cannot reach it. Both duties are
real: accountability for admin actions, and the right to erasure.

## What is in the log today
Written by admin actions through `write_audit_log()`: vendor, listing and promotion reviews and
similar. Subjects are mostly vendors and listings. A tourist appears only if an admin acts on a
tourist record, which no screen does today **[UNKNOWN: confirm no admin screen edits a guest]**.
Staff appear as `actor_user_id`.

## Proposal
1. **Do not put guest personal data in snapshots.** The writer stores ids and the fields that
   changed, never a guest's name, email or free text. Cheapest fix, and removes the conflict for
   guests. A test can scan `write_audit_log()` callers for guest columns.
2. **Keep the log append-only.** Do not add an erasure path that edits rows. Editing the log defeats
   its purpose.
3. **Vendor staff snapshots are kept** for the accountability period below, then deleted whole by a
   retention job that is the only writer allowed past the trigger **[COUNSEL: period]**.
4. **Say so in the privacy notice and vendor terms:** admin actions are logged and kept for the
   period.

## Trap to know
The trigger is `before update or delete`, and `actor_user_id` is `ON DELETE SET NULL`. Setting it to
null is an update, so **deleting an admin's account fails** while they have log rows. Staff removal
needs the retention job or a documented exception **[COUNSEL]**. Tourist removal is not affected
unless a tourist acted as an actor.

## Decisions for counsel
- Retention period for admin audit rows.
- Whether a legal-obligation basis covers keeping staff names in snapshots for that period.
- Whether the same rule applies to `voucher_redemptions` (scanner ids), which is also append-only.
