-- Jamaica demo content
--
-- Operating rule 9: "Use realistic seeded demo data but label it as demo content. Do not claim
-- live prices, availability, reviews or vendor verification."
--
-- Every vendor, experience and promotion below carries is_demo = true, and every vendor's trading
-- name is prefixed "[Demo]" so it is unmistakable in a screenshot or an investor walkthrough.
-- Prices, schedules and inclusions are plausible but invented.
--
-- Idempotent: safe to run repeatedly against the same database.

begin;

-- --------------------------------------------------------------------------
-- Platform settings — PRD §10 requires fees be configuration-driven
-- --------------------------------------------------------------------------
--
-- Placeholder commercial values. The real numbers are OD-03, still owned by the founding team.

insert into platform_settings (key, value, description) values
  ('pricing.tax_rate',        '0.15'::jsonb, 'PLACEHOLDER (OD-03) — tax applied to the discounted subtotal'),
  ('pricing.service_fee_rate','0.05'::jsonb, 'PLACEHOLDER (OD-03) — platform service fee charged to the guest'),
  ('pricing.commission_rate', '0.12'::jsonb, 'PLACEHOLDER (OD-03) — platform commission from the vendor share'),
  ('pricing.settlement_currency', '"USD"'::jsonb, 'OD-09 — display may be localized; settlement is USD at MVP'),
  ('subscription.plans', $json$[
     {"key":"starter","name":"Starter","monthly_usd":65,"status":"placeholder"},
     {"key":"growth","name":"Growth","monthly_usd":110,"status":"placeholder"},
     {"key":"premier","name":"Premier","monthly_usd":161,"status":"placeholder"}
   ]$json$::jsonb,
   'PLACEHOLDER (OD-03) — PRD §10 permits USD 65-161/mo; names and benefits are admin-configurable'),
  ('booking.pending_payment_ttl_minutes', '30'::jsonb,
   'How long a pending booking holds capacity before reconciliation releases it')
on conflict (key) do nothing;

-- --------------------------------------------------------------------------
-- Islands — PRD §3
-- --------------------------------------------------------------------------
--
-- Jamaica is the fully populated launch market. Cayman and Barbados exist to prove the
-- architecture is island-aware (AD-08) and are intentionally left unpopulated and inactive.

insert into islands (code, name, in_app_brand, currency, timezone, is_active) values
  ('JM', 'Jamaica',        'VIP Jamaica',  'JMD', 'America/Jamaica',   true),
  ('KY', 'Cayman Islands', 'VIP Cayman',   'KYD', 'America/Cayman',    false),
  ('BB', 'Barbados',       'VIP Barbados', 'BBD', 'America/Barbados',  false)
on conflict (code) do nothing;

-- --------------------------------------------------------------------------
-- Destinations — the six named in PRD §16
-- --------------------------------------------------------------------------

insert into destinations (island_id, name, slug, centre_lat, centre_lng, sort_order, editorial_content)
select i.id, d.name, d.slug, d.lat, d.lng, d.ord, d.blurb
from islands i
cross join (values
  ('Ocho Rios',   'ocho-rios',    18.4074, -77.1030, 1, 'Waterfalls, river tubing and cruise-port energy on the north coast.'),
  ('Montego Bay', 'montego-bay',  18.4762, -77.8939, 2, 'Jamaica''s resort capital — beaches, golf, and the Hip Strip.'),
  ('Negril',      'negril',       18.2683, -78.3480, 3, 'Seven Mile Beach, cliff diving at West End, and the best sunsets on the island.'),
  ('Kingston',    'kingston',     17.9714, -76.7936, 4, 'The capital: music history, food, galleries and the Blue Mountains behind it.'),
  ('Port Antonio','port-antonio', 18.1810, -76.4500, 5, 'The quiet northeast — Blue Lagoon, Reach Falls and rafting the Rio Grande.'),
  ('South Coast', 'south-coast',  18.0333, -77.7500, 6, 'Treasure Beach, Black River safari and YS Falls, away from the resort strip.')
) as d(name, slug, lat, lng, ord, blurb)
where i.code = 'JM'
on conflict (island_id, slug) do nothing;

-- --------------------------------------------------------------------------
-- Demo vendors
-- --------------------------------------------------------------------------
--
-- One vendor is deliberately left `pending_review` so the negative RLS tests have a real subject:
-- its listings must be invisible to the public even though they are marked approved.

insert into vendor_organizations (island_id, legal_name, trading_name, contact_email, status, is_demo, description)
select i.id, v.legal, v.trading, v.email, v.status::vendor_status, true, v.descr
from islands i
cross join (values
  ('Dunn''s River Adventures Ltd',   '[Demo] Dunn''s River Adventures',   'demo+dunns@caribbeanvip.test',   'approved',       'Waterfall climbs and river tubing around Ocho Rios.'),
  ('Negril Sunset Cruises Ltd',      '[Demo] Negril Sunset Cruises',      'demo+negril@caribbeanvip.test',  'approved',       'Catamaran cruises and snorkelling off Seven Mile Beach.'),
  ('Blue Mountain Coffee Tours Ltd', '[Demo] Blue Mountain Coffee Tours', 'demo+coffee@caribbeanvip.test',  'approved',       'Plantation tours and tastings above Kingston.'),
  ('Portland River Rafting Ltd',     '[Demo] Portland River Rafting',     'demo+portland@caribbeanvip.test','approved',       'Bamboo rafting and Blue Lagoon trips from Port Antonio.'),
  ('Irie Rides Transport Ltd',       '[Demo] Irie Rides Transport',       'demo+rides@caribbeanvip.test',   'approved',       'Airport transfers and private drivers island-wide.'),
  ('Treasure Beach Wellness Ltd',    '[Demo] Treasure Beach Wellness',    'demo+wellness@caribbeanvip.test','approved',       'Beachfront yoga, massage and sound baths on the south coast.'),
  ('Unverified Excursions Ltd',      '[Demo] Unverified Excursions',      'demo+pending@caribbeanvip.test', 'pending_review', 'Deliberately unapproved — proves unapproved vendors stay invisible (V-02).')
) as v(legal, trading, email, status, descr)
where i.code = 'JM'
  and not exists (select 1 from vendor_organizations o where o.trading_name = v.trading);

-- --------------------------------------------------------------------------
-- Vendor locations
-- --------------------------------------------------------------------------

insert into vendor_locations (vendor_org_id, destination_id, name, lat, lng, is_primary, address)
select o.id, d.id, l.loc_name, l.lat, l.lng, true, l.addr
from vendor_organizations o
join (values
  ('[Demo] Dunn''s River Adventures',   'ocho-rios',    'Dunn''s River Falls base',  18.4153, -77.1360, 'Dunn''s River Falls Rd, Ocho Rios'),
  ('[Demo] Negril Sunset Cruises',      'negril',       'Seven Mile Beach jetty',    18.2900, -78.3450, 'Norman Manley Blvd, Negril'),
  ('[Demo] Blue Mountain Coffee Tours', 'kingston',     'Irish Town meeting point',  18.0700, -76.7100, 'Irish Town, St Andrew'),
  ('[Demo] Portland River Rafting',     'port-antonio', 'Rio Grande put-in',         18.1400, -76.4200, 'Berrydale, Portland'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'Sangster Airport desk',     18.5037, -77.9134, 'Sangster International Airport'),
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'Calabash Bay studio',       17.8850, -77.7700, 'Calabash Bay, Treasure Beach'),
  ('[Demo] Unverified Excursions',      'ocho-rios',    'Unverified base',           18.4100, -77.1100, 'Ocho Rios')
) as l(trading, dest_slug, loc_name, lat, lng, addr) on l.trading = o.trading_name
join destinations d on d.slug = l.dest_slug
where not exists (
  select 1 from vendor_locations vl where vl.vendor_org_id = o.id and vl.name = l.loc_name
);

-- --------------------------------------------------------------------------
-- Experiences — all twelve PRD §16 categories are represented
-- --------------------------------------------------------------------------

insert into experiences (
  vendor_org_id, island_id, destination_id, vendor_location_id,
  category, title, summary, description, duration_minutes,
  inclusions, pickup_info, meeting_point,
  from_amount_minor, currency, status, is_demo
)
select
  o.id, i.id, d.id, vl.id,
  e.category::experience_category, e.title, e.summary,
  e.summary || ' Demo content — prices, times and availability are illustrative and not live.',
  e.mins, e.inclusions, e.pickup, vl.name,
  e.from_minor, 'USD'::currency_code, e.status::listing_status, true
from (values
  -- vendor trading name, destination, category, title, summary, minutes, inclusions, pickup, from (minor), status
  ('[Demo] Dunn''s River Adventures',   'ocho-rios',    'waterfalls',     'Dunn''s River Falls Climb',        'Climb the terraced falls with a guide, then swim at the beach below.', 180, array['Guide','Entry fee','Locker'], 'Hotel pickup available in Ocho Rios', 6500,  'approved'),
  ('[Demo] Dunn''s River Adventures',   'ocho-rios',    'adventure',      'White River Tubing',               'Float the White River through easy rapids and calm stretches.',        150, array['Tube','Life vest','Guide'], 'Hotel pickup available in Ocho Rios', 5900,  'approved'),
  ('[Demo] Dunn''s River Adventures',   'ocho-rios',    'family',         'Blue Hole Family Day',             'Shallow pools, rope swings and picnic space for all ages.',            240, array['Guide','Entry fee','Lunch'], 'Hotel pickup available in Ocho Rios', 7400,  'approved'),
  ('[Demo] Negril Sunset Cruises',      'negril',       'water_sports',   'Catamaran Snorkel & Sunset',       'Sail Seven Mile Beach, snorkel the reef, finish at sunset.',           210, array['Snorkel gear','Open bar','Snacks'], 'Pickup from Norman Manley Blvd hotels', 8900,  'approved'),
  ('[Demo] Negril Sunset Cruises',      'negril',       'beaches',        'Seven Mile Beach Day Pass',        'Loungers, umbrella and beach service for the day.',                   480, array['Lounger','Umbrella','Towel'], 'Meet at the jetty', 3500,  'approved'),
  ('[Demo] Negril Sunset Cruises',      'negril',       'nightlife',      'West End Cliffs Night Out',        'Cliffside bars, live music and a late boat back.',                    300, array['Transport','Entry','Welcome drink'], 'Pickup from Negril hotels', 6200,  'approved'),
  ('[Demo] Blue Mountain Coffee Tours', 'kingston',     'food',           'Blue Mountain Coffee Tasting',     'Walk the plantation, roast a batch, taste through the grades.',        240, array['Tour','Tasting','Transport'], 'Pickup from New Kingston', 7900,  'approved'),
  ('[Demo] Blue Mountain Coffee Tours', 'kingston',     'culture',        'Kingston Music History Tour',      'Studio One, Trench Town and the Bob Marley Museum with a guide.',      300, array['Guide','Entry fees','Transport'], 'Pickup from New Kingston', 8500,  'approved'),
  ('[Demo] Blue Mountain Coffee Tours', 'kingston',     'shopping',       'Kingston Craft Market Run',        'Guided craft market visit with a local buyer.',                       180, array['Guide','Transport'], 'Pickup from New Kingston', 4200,  'approved'),
  ('[Demo] Portland River Rafting',     'port-antonio', 'day_trips',      'Rio Grande Bamboo Rafting',        'Two hours downriver on a bamboo raft, poled by a licensed captain.',   200, array['Raft & captain','Fruit','Transport'], 'Pickup from Port Antonio hotels', 8800,  'approved'),
  ('[Demo] Portland River Rafting',     'port-antonio', 'waterfalls',     'Reach Falls Guided Walk',          'Walk the river up to Reach Falls and swim the hidden pools.',          180, array['Guide','Entry fee'], 'Pickup from Port Antonio hotels', 5500,  'approved'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'transportation', 'Montego Bay Airport Transfer',     'Private air-conditioned transfer, meet and greet on arrival.',          60, array['Private vehicle','Meet & greet','Bottled water'], 'Arrivals hall, Sangster International', 4500,  'approved'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'day_trips',      'MoBay to Negril Day Trip',         'Private driver for the day, stops wherever you like along the coast.', 600, array['Private vehicle','Driver','Fuel'], 'Hotel pickup in Montego Bay', 15900, 'approved'),
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'wellness',       'Sunrise Beach Yoga',               'Ninety minutes of vinyasa on the sand as the sun comes up.',            90, array['Mat','Instructor','Herbal tea'], 'Meet at Calabash Bay studio', 3200,  'approved'),
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'food',           'Black River Seafood Lunch',        'Boat to a riverside kitchen for pepper shrimp and fried fish.',        240, array['Boat','Lunch','Guide'], 'Pickup from Treasure Beach', 6800,  'approved'),
  -- Same vendor, NOT approved: proves a draft listing from an approved vendor stays private (T-03).
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'wellness',       'Sound Bath (unpublished draft)',   'Draft listing used to prove drafts never appear publicly.',             75, array['Mat'], 'Meet at Calabash Bay studio', 3000,  'draft'),
  -- Approved listing under an UNAPPROVED vendor: proves vendor status gates visibility (V-02).
  ('[Demo] Unverified Excursions',      'ocho-rios',    'adventure',      'Unverified Vendor Excursion',      'Approved listing under an unapproved vendor — must stay invisible.',   120, array['Guide'], 'Ocho Rios', 5000,  'approved')
) as e(trading, dest_slug, category, title, summary, mins, inclusions, pickup, from_minor, status)
join vendor_organizations o on o.trading_name = e.trading
join destinations d on d.slug = e.dest_slug
join islands i on i.id = d.island_id
left join vendor_locations vl on vl.vendor_org_id = o.id and vl.is_primary
where not exists (select 1 from experiences x where x.title = e.title);

-- --------------------------------------------------------------------------
-- Price options — adult/child plus one add-on per experience
-- --------------------------------------------------------------------------

insert into experience_options (experience_id, kind, label, unit_amount_minor, currency, occupies_capacity, min_quantity, max_quantity, sort_order)
select e.id, 'adult'::experience_option_kind, 'Adult', e.from_amount_minor, e.currency, true, 1, 20, 1
from experiences e
where e.is_demo
  and not exists (select 1 from experience_options o where o.experience_id = e.id and o.kind = 'adult');

insert into experience_options (experience_id, kind, label, unit_amount_minor, currency, occupies_capacity, min_quantity, max_quantity, sort_order)
select e.id, 'child'::experience_option_kind, 'Child (4-11)', (e.from_amount_minor * 6) / 10, e.currency, true, 0, 20, 2
from experiences e
where e.is_demo
  and not exists (select 1 from experience_options o where o.experience_id = e.id and o.kind = 'child');

-- Add-ons do NOT occupy capacity — the pricing tests depend on that distinction being real.
insert into experience_options (experience_id, kind, label, unit_amount_minor, currency, occupies_capacity, min_quantity, max_quantity, sort_order)
select e.id, 'addon'::experience_option_kind, 'Photo package', 1500, e.currency, false, 0, 5, 3
from experiences e
where e.is_demo
  and not exists (select 1 from experience_options o where o.experience_id = e.id and o.kind = 'addon');

-- --------------------------------------------------------------------------
-- Availability — next 30 days, two departures a day
-- --------------------------------------------------------------------------
--
-- One slot per experience is seeded with capacity 1, so the concurrency test has a guaranteed
-- last-seat scenario to race against rather than manufacturing one.

insert into availability_slots (experience_id, starts_at, ends_at, capacity, booked_count, status)
select
  e.id,
  slot_start,
  slot_start + make_interval(mins => e.duration_minutes),
  case when day_offset = 0 and hour_of_day = 9 then 1 else 12 end,
  0,
  'open'::slot_status
from experiences e
cross join generate_series(0, 29) as day_offset
cross join (values (9), (14)) as t(hour_of_day)
cross join lateral (
  select (date_trunc('day', now()) + make_interval(days => day_offset, hours => hour_of_day)) as slot_start
) s
where e.status = 'approved' and e.is_demo
on conflict (experience_id, starts_at) do nothing;

-- --------------------------------------------------------------------------
-- The demo geofenced offer — PRD §16 names this one explicitly
-- --------------------------------------------------------------------------

insert into promotions (
  vendor_org_id, island_id, title, description, terms,
  value_kind, starts_at, ends_at, inventory_limit, requires_booking,
  approval_state, is_demo
)
select
  o.id, i.id,
  'Free rum punch with a qualifying booking',
  'Show your voucher at check-in to receive one complimentary rum punch per adult guest.',
  'DEMO OFFER. One drink per adult guest on a confirmed booking. Must be 18 or older. '
  || 'Not redeemable for cash. Valid only at the issuing vendor during the offer window. '
  || 'Subject to availability.',
  'in_kind'::promotion_value_kind,
  now() - interval '1 day',
  now() + interval '60 days',
  500,
  true,
  'approved'::approval_state,
  true
from vendor_organizations o
join islands i on i.id = o.island_id
where o.trading_name = '[Demo] Negril Sunset Cruises'
  and not exists (select 1 from promotions p where p.title = 'Free rum punch with a qualifying booking');

-- A standalone saved-offer case (T-08): no booking required.
insert into promotions (
  vendor_org_id, island_id, title, description, terms,
  value_kind, value_rate, starts_at, ends_at, inventory_limit, requires_booking,
  approval_state, is_demo
)
select
  o.id, i.id,
  '10% off sunrise yoga this week',
  'Save the voucher now, use it any morning this week.',
  'DEMO OFFER. 10% off the sunrise yoga session. One use per guest. No cash value. '
  || 'Valid only at Calabash Bay studio during the offer window.',
  'percentage'::promotion_value_kind,
  0.10,
  now() - interval '1 day',
  now() + interval '7 days',
  100,
  false,
  'approved'::approval_state,
  true
from vendor_organizations o
join islands i on i.id = o.island_id
where o.trading_name = '[Demo] Treasure Beach Wellness'
  and not exists (select 1 from promotions p where p.title = '10% off sunrise yoga this week');

-- Scope the rum punch offer to the catamaran cruise.
insert into promotion_experiences (promotion_id, experience_id)
select p.id, e.id
from promotions p
join experiences e on e.title = 'Catamaran Snorkel & Sunset'
where p.title = 'Free rum punch with a qualifying booking'
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Geofences — PRD §9
-- --------------------------------------------------------------------------

insert into geofences (
  promotion_id, destination_id, vendor_location_id,
  centre_lat, centre_lng, radius_m, cooldown_minutes, is_active
)
select p.id, d.id, vl.id, vl.lat, vl.lng, 1200, 1440, true
from promotions p
join vendor_organizations o on o.id = p.vendor_org_id
join vendor_locations vl on vl.vendor_org_id = o.id and vl.is_primary
join destinations d on d.id = vl.destination_id
where p.title = 'Free rum punch with a qualifying booking'
  and not exists (select 1 from geofences g where g.promotion_id = p.id);

insert into geofences (
  promotion_id, destination_id, vendor_location_id,
  centre_lat, centre_lng, radius_m, cooldown_minutes, is_active
)
select p.id, d.id, vl.id, vl.lat, vl.lng, 800, 720, true
from promotions p
join vendor_organizations o on o.id = p.vendor_org_id
join vendor_locations vl on vl.vendor_org_id = o.id and vl.is_primary
join destinations d on d.id = vl.destination_id
where p.title = '10% off sunrise yoga this week'
  and not exists (select 1 from geofences g where g.promotion_id = p.id);

commit;
