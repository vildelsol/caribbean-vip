-- Storage policies: close the gaps found when verifying staging-2 (2026-10-26).
--
-- 1. experience-media had no UPDATE policy, so an upload with `upsert: true` (overwrite a listing
--    photo) failed for every vendor.
-- 2. experience-media let ANY vendor member write, but the experience_media table (and experiences)
--    require is_vendor_listing_manager. Staff without can_manage_listings could put files in a
--    listing's folder that they could not reference. Storage now follows the same rule.
-- 3. vendor-documents had no UPDATE or DELETE, so a vendor could never replace a wrong licence
--    scan. Replacing and removing is allowed only while the org is still being reviewed: once a
--    vendor is approved, suspended or rejected the evidence is frozen and only an admin can change
--    it.
--
-- No vendor exists yet, so nothing depends on the old behaviour.
--
-- Guarded like 20260802000011_storage.sql: a no-op where the storage schema is absent (the local
-- Postgres harness). Nothing under supabase/tests can exercise these policies. They were verified
-- on staging with a rolled-back transaction as an authenticated vendor member and as a stranger.

create or replace function vendor_documents_editable(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_organizations o
    where o.id = org_id
      and o.status in ('draft', 'pending_review', 'changes_requested')
  );
$$;

comment on function vendor_documents_editable(uuid) is
  'True while the org is still in onboarding review. Evidence files are frozen after that.';

revoke execute on function vendor_documents_editable(uuid) from public, anon;
grant execute on function vendor_documents_editable(uuid) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema not present — skipping storage policies (non-Supabase environment)';
    return;
  end if;

  -- experience-media: listing managers (or an admin) write; the folder is the vendor org id.
  execute $p$ drop policy if exists experience_media_vendor_write on storage.objects $p$;
  execute $p$ drop policy if exists experience_media_vendor_delete on storage.objects $p$;

  execute $p$
    create policy experience_media_vendor_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'experience-media'
        and (is_vendor_listing_manager((storage.foldername(name))[1]::uuid) or is_admin())
      );
  $p$;

  execute $p$
    create policy experience_media_vendor_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'experience-media'
        and (is_vendor_listing_manager((storage.foldername(name))[1]::uuid) or is_admin())
      )
      with check (
        bucket_id = 'experience-media'
        and (is_vendor_listing_manager((storage.foldername(name))[1]::uuid) or is_admin())
      );
  $p$;

  execute $p$
    create policy experience_media_vendor_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'experience-media'
        and (is_vendor_listing_manager((storage.foldername(name))[1]::uuid) or is_admin())
      );
  $p$;

  -- vendor-documents: replace or remove while in review; admins always.
  execute $p$
    create policy vendor_documents_member_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'vendor-documents'
        and (
          (is_vendor_member((storage.foldername(name))[1]::uuid)
             and vendor_documents_editable((storage.foldername(name))[1]::uuid))
          or is_admin()
        )
      )
      with check (
        bucket_id = 'vendor-documents'
        and (
          (is_vendor_member((storage.foldername(name))[1]::uuid)
             and vendor_documents_editable((storage.foldername(name))[1]::uuid))
          or is_admin()
        )
      );
  $p$;

  execute $p$
    create policy vendor_documents_member_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'vendor-documents'
        and (
          (is_vendor_member((storage.foldername(name))[1]::uuid)
             and vendor_documents_editable((storage.foldername(name))[1]::uuid))
          or is_admin()
        )
      );
  $p$;
end
$$;
