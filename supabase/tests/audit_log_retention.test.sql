-- audit_logs: append-only, except an actor's id can be nulled and rows expire at 7 years, only via
-- the purge. Each refusal has a positive control.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

begin;
set local role service_role;

do $$
declare
  u uuid; r_new uuid; r_old uuid; res jsonb; n integer;
begin
  insert into auth.users (email) values ('audit-actor@test.local') returning id into u;
  insert into audit_logs (actor_user_id, action, entity_type, after) values (u, 'test.new', 'test', '{"a":1}') returning id into r_new;
  insert into audit_logs (actor_user_id, action, entity_type, created_at) values (u, 'test.old', 'test', now() - interval '7 years 1 day') returning id into r_old;

  perform test.raises(format($q$ update audit_logs set action = 'x' where id = %L $q$, r_new), 'action cannot change');
  perform test.raises(format($q$ update audit_logs set after = '{}' where id = %L $q$, r_new), 'snapshots cannot change');
  perform test.raises(format($q$ update audit_logs set actor_user_id = gen_random_uuid() where id = %L $q$, r_new), 'actor cannot be swapped');
  perform test.raises(format($q$ update audit_logs set actor_user_id = null, action = 'x' where id = %L $q$, r_new), 'nulling the actor cannot carry another change');
  perform test.raises(format($q$ delete from audit_logs where id = %L $q$, r_new), 'delete refused');
  perform test.raises(format($q$ delete from audit_logs where id = %L $q$, r_old), 'even an old row cannot be deleted outside the purge');
  perform test.raises(format($q$ select set_config('cvip.retention_purge','on',true); delete from audit_logs where id = %L $q$, r_new),
    'with the purge setting on, a young row still cannot be deleted');
  perform set_config('cvip.retention_purge', '', true);

  res := purge_expired_records();
  perform test.eq((res ->> 'audit_logs_removed')::int, 1, 'the purge removes the one row older than 7 years');
  select count(*) into n from audit_logs where id = r_old;
  perform test.eq(n, 0, 'the old row is gone');
  select count(*) into n from audit_logs where id = r_new;
  perform test.eq(n, 1, 'the young row stays');

  -- the foreign key can do its job: deleting the actor no longer fails, and the row stays
  delete from auth.users where id = u;
  select count(*) into n from audit_logs where id = r_new and actor_user_id is null and action = 'test.new' and after = '{"a":1}';
  perform test.eq(n, 1, 'deleting the actor nulls the actor and keeps the entry intact');
end
$$;

rollback;
