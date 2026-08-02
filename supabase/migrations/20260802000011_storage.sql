-- M1 · Storage buckets and policies
--
-- PRD §14: "Keep vendor documents and private media in non-public storage buckets with signed
-- access."
--
-- Two buckets with opposite defaults:
--   experience-media   public   — listing photos are meant to be seen
--   vendor-documents   private  — tourism licences and payout evidence are never public
--
-- Guarded so the migration is a no-op outside Supabase (the local Postgres harness used for
-- migration and RLS tests has no storage schema).

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping bucket setup (non-Supabase environment)';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('experience-media', 'experience-media', true)
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public)
  values ('vendor-documents', 'vendor-documents', false)
  on conflict (id) do nothing;

  -- Listing media: world-readable, writable only by the owning vendor's members.
  -- Path convention: experience-media/<vendor_org_id>/<experience_id>/<file>
  execute $p$
    create policy experience_media_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'experience-media');
  $p$;

  execute $p$
    create policy experience_media_vendor_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'experience-media'
        and is_vendor_member((storage.foldername(name))[1]::uuid)
      );
  $p$;

  execute $p$
    create policy experience_media_vendor_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'experience-media'
        and is_vendor_member((storage.foldername(name))[1]::uuid)
      );
  $p$;

  -- Onboarding documents: no public read at all. The vendor's own members and admins can read;
  -- everyone else needs a short-lived signed URL minted server-side after an ownership check.
  -- Path convention: vendor-documents/<vendor_org_id>/<file>
  execute $p$
    create policy vendor_documents_member_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'vendor-documents'
        and (is_vendor_member((storage.foldername(name))[1]::uuid) or is_admin())
      );
  $p$;

  execute $p$
    create policy vendor_documents_member_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'vendor-documents'
        and is_vendor_member((storage.foldername(name))[1]::uuid)
      );
  $p$;
end
$$;
