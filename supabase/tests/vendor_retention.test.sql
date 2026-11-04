-- Vendor document retention: 7 years after the relationship ends, file first and row second.
-- A vendor cannot start, stop or fake the clock. Each refusal has a positive control.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; admin_u uuid; org uuid; doc_old uuid; doc_new uuid; org2 uuid; doc2 uuid;
begin
  insert into auth.users (email) values ('ret-owner@test.local') returning id into owner_u;
  insert into auth.users (email) values ('ret-admin@test.local') returning id into admin_u;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations where trading_name = '[Demo] Unverified Excursions' limit 1;
  select id into org2 from vendor_organizations where id <> org order by created_at limit 1;
  insert into vendor_members (vendor_org_id, user_id, role) values (org, owner_u, 'vendor_owner');
  insert into vendor_documents (vendor_org_id, kind, storage_path) values (org, 'owner_id', org || '/a.pdf') returning id into doc_old;
  insert into vendor_documents (vendor_org_id, kind, storage_path) values (org2, 'owner_id', org2 || '/b.pdf') returning id into doc2;
  insert into fixture values ('owner', owner_u), ('admin', admin_u), ('org', org), ('org2', org2), ('doc', doc_old), ('doc2', doc2);
end
$$;

set local role authenticated;

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  doc uuid := (select v from fixture where k = 'doc');
  n integer;
begin
  perform test.become((select v from fixture where k = 'owner'));
  perform test.raises(format($q$ update vendor_organizations set closed_at = now() - interval '8 years' where id = %L $q$, org),
    'a vendor owner cannot start the retention clock');
  -- Vendors have no UPDATE policy on documents, so the way in is an insert.
  perform test.raises(format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path, file_removed_at)
                                 values (%L, 'owner_id', 'x/y.pdf', now()) $q$, org),
    'a vendor cannot upload a document already marked file-removed');
  -- control: the owner can still edit an ordinary field of the same row
  update vendor_organizations set description = 'edited' where id = org;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an owner can still edit their organisation');

  perform test.become((select v from fixture where k = 'admin'));
  perform test.raises(format($q$ update vendor_documents set file_removed_at = now() where id = %L $q$, doc),
    'not even an admin can mark a file removed');
  update vendor_organizations set closed_at = now() - interval '8 years' where id = org;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin can record that the relationship ended');
end
$$;

set local role service_role;
-- A service-role call carries no user; drop the admin claim left by the block above.
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  org uuid := (select v from fixture where k = 'org');
  doc uuid := (select v from fixture where k = 'doc');
  doc2 uuid := (select v from fixture where k = 'doc2');
  res jsonb; n integer; ok boolean;
begin
  select count(*) into n from vendor_documents_due() where id = doc;
  perform test.eq(n, 1, 'a document of a vendor closed 8 years ago is due');
  select count(*) into n from vendor_documents_due() where id = doc2;
  perform test.eq(n, 0, 'a document of an open vendor is not due');

  -- the row never goes before its file
  res := purge_expired_records();
  select count(*) into n from vendor_documents where id = doc;
  perform test.eq(n, 1, 'the row stays while its file is not marked removed');

  ok := mark_vendor_document_file_removed(doc2);
  perform test.eq(ok, false, 'a document that is not due cannot be marked removed');
  ok := mark_vendor_document_file_removed(doc);
  perform test.eq(ok, true, 'a due document can be marked removed');

  select count(*) into n from vendor_documents_due() where id = doc;
  perform test.eq(n, 0, 'and is no longer listed as due');

  res := purge_expired_records();
  perform test.eq((res ->> 'vendor_documents_removed')::int, 1, 'the purge removes the one row whose file is gone');
  select count(*) into n from vendor_documents where id = doc;
  perform test.eq(n, 0, 'that row is gone');
  select count(*) into n from vendor_documents where id = doc2;
  perform test.eq(n, 1, 'the open vendor document is untouched');
end
$$;

-- only the service role can call these
set local role authenticated;
do $$
begin
  perform test.raises($q$ select * from vendor_documents_due() $q$, 'authenticated cannot list due documents');
  perform test.raises($q$ select mark_vendor_document_file_removed(gen_random_uuid()) $q$, 'authenticated cannot mark a file removed');
end
$$;
set local role anon;
do $$
begin
  perform test.raises($q$ select * from vendor_documents_due() $q$, 'anon cannot list due documents');
end
$$;

rollback;
