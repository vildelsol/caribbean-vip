-- Vendors upload evidence; only admins review it.
--
-- `vendor_documents_member_write` let a member insert a row already marked accepted. The guard in
-- 20261029000003 refuses that and stamps the uploader and reviewer from the caller's identity.
-- Refusals are raised exceptions from a trigger; each has a positive control beside it.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;

set local role service_role;

create temporary table fixture (k text primary key, v uuid) on commit drop;
grant select on fixture to anon, authenticated;

do $$
declare
  owner_u uuid; other_u uuid; admin_u uuid; outsider uuid;
  org uuid; doc uuid;
begin
  insert into auth.users (email) values ('doc-owner@test.local')    returning id into owner_u;
  insert into auth.users (email) values ('doc-other@test.local')    returning id into other_u;
  insert into auth.users (email) values ('doc-admin@test.local')    returning id into admin_u;
  insert into auth.users (email) values ('doc-outsider@test.local') returning id into outsider;
  update profiles set role = 'admin' where id = admin_u;

  select id into org from vendor_organizations
   where trading_name = '[Demo] Unverified Excursions' limit 1;
  if org is null then raise exception 'fixture: expected a seeded vendor'; end if;

  insert into vendor_members (vendor_org_id, user_id, role) values (org, owner_u, 'vendor_owner');

  insert into vendor_documents (vendor_org_id, kind, storage_path)
  values (org, 'owner_id', org || '/owner_id/seed.pdf') returning id into doc;

  insert into fixture values ('owner', owner_u), ('other', other_u), ('admin', admin_u),
    ('outsider', outsider), ('org', org), ('doc', doc);
end
$$;

set local role authenticated;

-- --------------------------------------------------------------------------
-- Uploading
-- --------------------------------------------------------------------------

do $$
declare
  org   uuid := (select v from fixture where k = 'org');
  owner_u uuid := (select v from fixture where k = 'owner');
  other_u uuid := (select v from fixture where k = 'other');
  n integer; uploader uuid;
begin
  perform test.become(owner_u);

  perform test.raises(
    format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path, review_state)
               values (%L, 'public_liability', 'x/y.pdf', 'accepted') $q$, org),
    'a vendor cannot upload a document already accepted'
  );
  perform test.raises(
    format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path, reviewed_by, reviewed_at)
               values (%L, 'public_liability', 'x/y.pdf', auth.uid(), now()) $q$, org),
    'a vendor cannot name themselves the reviewer'
  );
  perform test.raises(
    format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path, review_notes)
               values (%L, 'public_liability', 'x/y.pdf', 'looks fine') $q$, org),
    'a vendor cannot write review notes'
  );
  perform test.raises(
    format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path)
               values (%L, 'Not A Key', 'x/y.pdf') $q$, org),
    'kind must be a requirement key, not free text'
  );

  -- Controls: the upload the portal makes must work, with a number and expiry.
  insert into vendor_documents (vendor_org_id, kind, storage_path, document_number, expires_on, uploaded_by)
  values (org, 'jm.water_sports_licence', org || '/jm.water_sports_licence/a.pdf', 'WS-1', '2027-04-30', other_u);
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'a vendor can upload a pending document with a number and expiry');

  select uploaded_by into uploader from vendor_documents
   where kind = 'jm.water_sports_licence' and vendor_org_id = org;
  perform test.eq(uploader, owner_u, 'uploaded_by is the caller, not whatever the row claimed');
end
$$;

-- --------------------------------------------------------------------------
-- Reviewing
-- --------------------------------------------------------------------------

do $$
declare
  doc uuid := (select v from fixture where k = 'doc');
  n integer; st document_review_state;
begin
  perform test.become((select v from fixture where k = 'owner'));

  -- A member has no UPDATE policy, so the row is invisible to the statement: zero rows, no error.
  update vendor_documents set review_state = 'accepted' where id = doc;
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'a vendor updates no document rows');

  set local role service_role;
  select review_state into st from vendor_documents where id = doc;
  perform test.eq(st, 'pending'::document_review_state, 'the review state is genuinely unchanged');
  set local role authenticated;

  -- Another organisation's member cannot upload into this one.
  perform test.become((select v from fixture where k = 'outsider'));
  perform test.raises(
    format($q$ insert into vendor_documents (vendor_org_id, kind, storage_path)
               values (%L, 'owner_id', 'x/y.pdf') $q$, (select v from fixture where k = 'org')),
    'a stranger cannot upload into someone else''s organisation'
  );
end
$$;

do $$
declare
  doc     uuid := (select v from fixture where k = 'doc');
  admin_u uuid := (select v from fixture where k = 'admin');
  n integer; reviewer uuid; at_ts timestamptz;
begin
  perform test.become(admin_u);

  update vendor_documents set review_state = 'accepted', reviewed_by = null where id = doc;
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'an admin accepts a document');

  set local role service_role;
  select reviewed_by, reviewed_at into reviewer, at_ts from vendor_documents where id = doc;
  perform test.eq(reviewer, admin_u, 'reviewed_by is stamped from auth.uid(), not from the client');
  perform test.ok(at_ts is not null, 'reviewed_at is stamped');
end
$$;

rollback;
