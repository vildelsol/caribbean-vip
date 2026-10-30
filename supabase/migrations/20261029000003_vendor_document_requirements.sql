-- Vendor documents: expiry and number columns, a kind format, and a guard on review fields.
--
-- `vendor_documents` already existed for onboarding evidence, but nothing used it, and two things
-- were missing for it to carry real licences.
--
-- 1. Licences lapse and have numbers an admin can check against a public list (Barbados publishes
--    its licensed operators each February; TPDCo lists Jamaican entities). `expires_on` and
--    `document_number` hold those. Renewals are new rows: the newest row per `kind` is current
--    (see requirementStatuses in packages/types/src/vendorDocuments.ts), and the old ones stay as
--    the audit trail, so there is deliberately no member UPDATE or DELETE policy.
--
-- 2. `vendor_documents_member_write` is `for insert with check (is_vendor_member(vendor_org_id))`
--    and says nothing about columns, so a member could insert a row already marked `accepted`, or
--    name any reviewer, and approve their own evidence. Same shape as the organisation, listing and
--    slot guards: a trigger, because the rule is per-column and RLS is per-row.
--
-- `kind` is the requirement key from the shared registry ('jm.water_sports_licence'). The format
-- check keeps it a key and nothing else; which keys exist is the registry's business, not the
-- database's, so adding a requirement needs no migration.

alter table vendor_documents
  add column document_number text,
  add column expires_on date;

alter table vendor_documents
  add constraint vendor_documents_kind_format check (kind ~ '^[a-z0-9_.]{1,80}$'),
  add constraint vendor_documents_number_length check (document_number is null or char_length(document_number) <= 80);

create or replace function guard_vendor_document_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No end-user context: the service role. Inside the trust boundary, as for the other guards.
  if auth.uid() is null then
    return new;
  end if;

  if is_admin() then
    -- The console must not be trusted to name the reviewer. Stamp it from the identity.
    if tg_op = 'UPDATE' and new.review_state is distinct from old.review_state then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.review_state <> 'pending'
       or new.review_notes is not null
       or new.reviewed_by is not null
       or new.reviewed_at is not null
    then
      raise exception 'a vendor cannot review its own documents';
    end if;
    -- Who uploaded is a fact about the caller, not something to take from the row.
    new.uploaded_by := auth.uid();
  elsif new.review_state is distinct from old.review_state
     or new.review_notes is distinct from old.review_notes
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    raise exception 'a vendor cannot review its own documents';
  end if;

  return new;
end;
$$;

comment on function guard_vendor_document_review_fields() is
  'Blocks vendor writes to a document''s review fields, stamps uploaded_by, and stamps the reviewer for admins.';

create trigger vendor_documents_review_guard
  before insert or update on vendor_documents
  for each row execute function guard_vendor_document_review_fields();
