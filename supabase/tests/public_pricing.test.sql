-- public_pricing(): readable by anyone, exposes exactly the tax and service fee rates.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;
begin;
set local role service_role;

do $$
declare r jsonb;
begin
  r := public_pricing();
  perform test.eq((select array_agg(k order by k) from jsonb_object_keys(r) k), array['service_fee_rate', 'tax_rate'],
                  'exactly the tax and service fee rates, and no commission rate');
  perform test.ok(r ? 'tax_rate' and (r->>'tax_rate')::numeric = (select (value #>> '{}')::numeric from platform_settings where key = 'pricing.tax_rate'),
                  'the tax rate is the stored one');

  update platform_settings set value = '0.2'::jsonb where key = 'pricing.tax_rate';
  perform test.eq((public_pricing()->>'tax_rate')::numeric, 0.2::numeric, 'a changed rate is what the guest sees (same source the checkout reads)');
end $$;

-- Anyone, signed in or not.
set local role anon;
do $$ begin
  perform test.become_anon();
  perform test.ok(public_pricing() ? 'tax_rate', 'anon can read the rates');
end $$;

-- ...but the table itself is still closed to anon, and the commission rate is still not readable.
do $$ begin
  perform test.eq((select count(*)::int from platform_settings), 0, 'anon sees no platform_settings rows directly (RLS)');
  perform test.ok(not (public_pricing() ? 'commission_rate'), 'the commission rate is not exposed through the function');
end $$;

rollback;
