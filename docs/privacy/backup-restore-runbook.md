# Backup restore without un-erasing people (DRAFT runbook)

**Risk.** A restore from a backup taken before an erasure brings the erased data back. Erasure is
only real if a restore replays it.

## What survives a restore to help us
`privacy_requests` records each `erasure` and `account_removal` with the subject id and time, and
is kept after erasure with no link to the profile. It is the replay list. A backup taken after a
request already holds the request row.

## Backup facts
**[UNKNOWN]** Supabase plan, backup frequency, whether point-in-time recovery is on, retention of
backups, region (`us-east-1`). Ro to confirm from the dashboard. Backups themselves hold erased data
until they age out **[COUNSEL: acceptable if the period is stated in the notice]**.

## Restore procedure (draft)
1. **Before restoring**, export `privacy_requests` from the live database to a file outside it. If
   the database is already lost, take it from the newest backup, then check later requests in the
   Stripe and support records.
2. Restore into a **new** project or a scratch database first. Never over the live one.
3. In the restored copy, list requests newer than the backup:
   `select subject_id, request_type, received_at from privacy_requests_export where received_at > <backup time>`.
4. For each `erasure` subject still present: run the erasure steps (the body of `erase_my_data()`
   as the service role, for that subject). Record the replay in `privacy_requests` with outcome
   `{"replayed": true}`.
5. For each `account_removal` subject still present: delete the Auth user with the Auth admin API,
   after the erasure replay.
6. Verify: for each replayed subject, `profiles.display_name` is null and no rows remain in
   `saved_items`, `trips`, `reviews`, `ai_conversations`, `notifications`, `promotion_impressions`.
7. Only then repoint the apps. Keep the export with the incident record.

## Gaps
- No replay script exists; steps 4 and 5 are manual. A script and a test (restore a fixture, replay,
  assert) is the safeguard to build next.
- `erase_my_data()` takes the caller from `auth.uid()`, so replay needs a service-role variant that
  takes the subject as an argument. It must be revoked from every other role.
