-- Demo content — Jamaica, the Cayman Islands and Barbados
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
-- Jamaica is the launch market and keeps the deepest catalogue. Cayman and Barbados were
-- originally seeded inactive to prove the schema was island-aware (AD-08); they are populated and
-- active now because island-awareness is the thing a demonstration most needs to SHOW, and an
-- island that cannot be selected demonstrates nothing.
--
-- Kept in step with `packages/demo/src/dataset.ts`, so switching between demo mode and a real
-- backend changes where the data comes from, not what the app shows.

insert into islands (code, name, in_app_brand, currency, timezone, is_active) values
  ('JM', 'Jamaica',        'VIP Jamaica',  'JMD', 'America/Jamaica',   true),
  ('KY', 'Cayman Islands', 'VIP Cayman',   'KYD', 'America/Cayman',    true),
  ('BB', 'Barbados',       'VIP Barbados', 'BBD', 'America/Barbados',  true),
  -- Negative fixture. Cayman and Barbados used to serve this role by being inactive; now that they
  -- are live, an unlaunched market is kept here on purpose so the RLS rule that hides one still has
  -- a subject to be tested against. Without it that test would pass vacuously.
  ('AG', 'Antigua & Barbuda', 'VIP Antigua', 'USD', 'America/Antigua', false)
on conflict (code) do nothing;

-- Islands seeded before this change exist with is_active = false; the values list above will not
-- touch them because of the conflict clause, so activate them explicitly.
update islands set is_active = true where code in ('KY', 'BB') and not is_active;

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

-- Cayman Islands
insert into destinations (island_id, name, slug, centre_lat, centre_lng, sort_order, editorial_content)
select i.id, d.name, d.slug, d.lat, d.lng, d.ord, d.blurb
from islands i
cross join (values
  ('George Town',              'george-town',         19.2869, -81.3674, 1, 'The capital and cruise port — duty-free shopping, museums and the harbourfront.'),
  ('Seven Mile Beach',         'seven-mile-beach-ky', 19.3436, -81.3863, 2, 'Six miles of coral sand, calm water, and most of the island''s resorts and restaurants.'),
  ('West Bay',                 'west-bay',            19.3775, -81.4113, 3, 'Stingray City, the turtle centre, and the ironshore formations at Hell.'),
  ('Rum Point & North Side',   'rum-point',           19.3617, -81.2686, 4, 'Shallow turquoise flats, hammocks under the pines, and the quiet end of the island.'),
  ('East End',                 'east-end',            19.3011, -81.1041, 5, 'Blowholes, wall diving and the reef that keeps the whole coast calm.')
) as d(name, slug, lat, lng, ord, blurb)
where i.code = 'KY'
on conflict (island_id, slug) do nothing;

-- Barbados
insert into destinations (island_id, name, slug, centre_lat, centre_lng, sort_order, editorial_content)
select i.id, d.name, d.slug, d.lat, d.lng, d.ord, d.blurb
from islands i
cross join (values
  ('Bridgetown',              'bridgetown',     13.0969, -59.6145, 1, 'UNESCO-listed capital: the Careenage, the Garrison, and Carlisle Bay right beside it.'),
  ('Holetown & West Coast',   'west-coast-bb',  13.1866, -59.6389, 2, 'The calm Caribbean side — platinum-coast beaches, turtles and sunset sailing.'),
  ('Oistins & South Coast',   'south-coast-bb', 13.0664, -59.5395, 3, 'Fish fry on a Friday night, kite surfing by day, and the liveliest stretch of coast.'),
  ('Bathsheba & East Coast',  'east-coast-bb',  13.2136, -59.5236, 4, 'Atlantic surf, the Soup Bowl, and the rock formations that put Barbados on postcards.'),
  ('St Lucy & North',         'north-bb',       13.3271, -59.6428, 5, 'Cliffs, the Animal Flower Cave, and the plantation houses inland.'),
  ('Central Parishes',        'central-bb',     13.1833, -59.5722, 6, 'Harrison''s Cave, gullies and gardens in the green middle of the island.')
) as d(name, slug, lat, lng, ord, blurb)
where i.code = 'BB'
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

insert into vendor_organizations (island_id, legal_name, trading_name, contact_email, status, is_demo, description)
select i.id, v.legal, v.trading, v.email, v.status::vendor_status, true, v.descr
from islands i
cross join (values
  ('North Sound Stingray Charters Ltd', '[Demo] North Sound Stingray Charters', 'demo+stingray@caribbeanvip.test', 'approved', 'Sandbar, reef and barrier-reef snorkelling trips out of West Bay.'),
  ('Camana Bay Concierge Ltd',          '[Demo] Camana Bay Concierge',          'demo+camana@caribbeanvip.test',   'approved', 'Food walks, shopping and sailing along Seven Mile Beach.'),
  ('West Bay Family Adventures Ltd',    '[Demo] West Bay Family Adventures',    'demo+westbay@caribbeanvip.test',  'approved', 'Turtle centre visits and the West Bay heritage run, built around small children.'),
  ('Rum Point Excursions Ltd',          '[Demo] Rum Point Excursions',          'demo+rumpoint@caribbeanvip.test', 'approved', 'Boat days, beach clubs and sunset trips on the quiet north side.')
) as v(legal, trading, email, status, descr)
where i.code = 'KY'
  and not exists (select 1 from vendor_organizations o where o.trading_name = v.trading);

insert into vendor_organizations (island_id, legal_name, trading_name, contact_email, status, is_demo, description)
select i.id, v.legal, v.trading, v.email, v.status::vendor_status, true, v.descr
from islands i
cross join (values
  ('Barbados Cave & Coast Tours Ltd',   '[Demo] Barbados Cave & Coast Tours',   'demo+cave@caribbeanvip.test',     'approved', 'Harrison''s Cave, the east coast and the gullies in between.'),
  ('Carlisle Bay Turtle Charters Ltd',  '[Demo] Carlisle Bay Turtle Charters',  'demo+carlisle@caribbeanvip.test', 'approved', 'Turtle and shipwreck snorkelling, and catamaran days down the west coast.'),
  ('Oistins Food & Culture Ltd',        '[Demo] Oistins Food & Culture',        'demo+oistins@caribbeanvip.test',  'approved', 'The Friday fish fry, south-coast beaches and rum shops with a guide.'),
  ('Bajan Heritage Tours Ltd',          '[Demo] Bajan Heritage Tours',          'demo+heritage@caribbeanvip.test', 'approved', 'Plantation houses, rum distilleries and the northern cliffs.')
) as v(legal, trading, email, status, descr)
where i.code = 'BB'
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
  ('[Demo] Unverified Excursions',      'ocho-rios',    'Unverified base',           18.4100, -77.1100, 'Ocho Rios'),
  ('[Demo] North Sound Stingray Charters','west-bay',           'West Bay public dock',       19.3768, -81.4046, 'West Bay, Grand Cayman'),
  ('[Demo] Camana Bay Concierge',        'seven-mile-beach-ky', 'Camana Bay waterfront',      19.3243, -81.3818, 'Camana Bay, Grand Cayman'),
  ('[Demo] West Bay Family Adventures',  'west-bay',            'Turtle Centre entrance',     19.3839, -81.4157, 'Northwest Point Rd, West Bay'),
  ('[Demo] Rum Point Excursions',        'rum-point',           'Rum Point jetty',            19.3626, -81.2704, 'Rum Point, North Side'),
  ('[Demo] Barbados Cave & Coast Tours', 'central-bb',          'Harrison''s Cave visitor centre', 13.1852, -59.5714, 'Allen View, St Thomas'),
  ('[Demo] Carlisle Bay Turtle Charters','bridgetown',          'Carlisle Bay boardwalk',     13.0797, -59.6142, 'Bay Street, Bridgetown'),
  ('[Demo] Oistins Food & Culture',      'south-coast-bb',      'Oistins Bay Garden',         13.0664, -59.5395, 'Oistins, Christ Church'),
  ('[Demo] Bajan Heritage Tours',        'north-bb',            'Speightstown meeting point', 13.2494, -59.6428, 'Speightstown, St Peter')
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
  ('[Demo] Dunn''s River Adventures',   'ocho-rios',    'adventure',      'Mystic Mountain Bobsled & Zipline','Chairlift through the rainforest canopy, then bobsled and zipline back down.', 210, array['Chairlift','Bobsled','Zipline','Pool access'], 'Hotel pickup available in Ocho Rios', 9800,  'approved'),
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
  ('[Demo] Portland River Rafting',     'port-antonio', 'water_sports',   'Blue Lagoon Swim & Boat',          'Swim where the cold spring meets the sea, then along the coast by boat.', 180, array['Boat & captain','Snorkel gear','Fruit'], 'Pickup from Port Antonio hotels', 7200,  'approved'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'culture',        'Rose Hall Great House Tour',       'The plantation house above Montego Bay, and the history it carries.', 180, array['Guide','Entry fee','Transport'], 'Hotel pickup in Montego Bay', 6400,  'approved'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'transportation', 'Montego Bay Airport Transfer',     'Private air-conditioned transfer, meet and greet on arrival.',          60, array['Private vehicle','Meet & greet','Bottled water'], 'Arrivals hall, Sangster International', 4500,  'approved'),
  ('[Demo] Irie Rides Transport',       'montego-bay',  'day_trips',      'MoBay to Negril Day Trip',         'Private driver for the day, stops wherever you like along the coast.', 600, array['Private vehicle','Driver','Fuel'], 'Hotel pickup in Montego Bay', 15900, 'approved'),
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'wellness',       'Sunrise Beach Yoga',               'Ninety minutes of vinyasa on the sand as the sun comes up.',            90, array['Mat','Instructor','Herbal tea'], 'Meet at Calabash Bay studio', 3200,  'approved'),
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'food',           'Black River Seafood Lunch',        'Boat to a riverside kitchen for pepper shrimp and fried fish.',        240, array['Boat','Lunch','Guide'], 'Pickup from Treasure Beach', 6800,  'approved'),
  -- Same vendor, NOT approved: proves a draft listing from an approved vendor stays private (T-03).
  ('[Demo] Treasure Beach Wellness',    'south-coast',  'wellness',       'Sound Bath (unpublished draft)',   'Draft listing used to prove drafts never appear publicly.',             75, array['Mat'], 'Meet at Calabash Bay studio', 3000,  'draft'),
  -- Approved listing under an UNAPPROVED vendor: proves vendor status gates visibility (V-02).
  ('[Demo] Unverified Excursions',      'ocho-rios',    'adventure',      'Unverified Vendor Excursion',      'Approved listing under an unapproved vendor — must stay invisible.',   120, array['Guide'], 'Ocho Rios', 5000,  'approved'),

  -- Cayman Islands
  ('[Demo] North Sound Stingray Charters','west-bay',           'water_sports',   'Stingray City Sandbar',              'Stand waist-deep on the sandbar with wild southern stingrays.',          210, array['Boat & crew','Snorkel gear','Two reef stops'], 'Pickup from Seven Mile Beach and George Town hotels', 9500,  'approved'),
  ('[Demo] North Sound Stingray Charters','west-bay',           'adventure',      'Barrier Reef & Coral Garden Snorkel','Two protected reef sites, calm water, gear and guide included.',         180, array['Boat & crew','Snorkel gear','In-water guide'], 'Pickup from Seven Mile Beach and George Town hotels', 7500,  'approved'),
  ('[Demo] Camana Bay Concierge',        'seven-mile-beach-ky', 'beaches',        'Seven Mile Beach Club Day',          'Loungers, umbrella and table service on the coral sand.',                480, array['Two loungers','Umbrella','Towels'], 'Meet at the beach club', 4200,  'approved'),
  ('[Demo] Camana Bay Concierge',        'seven-mile-beach-ky', 'water_sports',   'Sunset Sail off Seven Mile Beach',   'Two and a half hours under sail as the sun goes down.',                  150, array['Crewed catamaran','Open bar','Canapés'], 'Board at the Camana Bay dock', 8600,  'approved'),
  ('[Demo] Camana Bay Concierge',        'george-town',         'food',           'Camana Bay Food Walk',               'Six tastings around the waterfront, with the people who cook them.',     180, array['Six tastings','Guide','One drink'], 'Meet at the Camana Bay observation tower', 8900,  'approved'),
  ('[Demo] West Bay Family Adventures',  'west-bay',            'family',         'Cayman Turtle Centre Family Day',    'Hold a turtle, snorkel the lagoon, and the predator tank for the brave.',300, array['Entry','Snorkel gear','Guide'], 'Pickup from West Bay and Seven Mile Beach hotels', 6900,  'approved'),
  ('[Demo] West Bay Family Adventures',  'west-bay',            'culture',        'Hell & West Bay Heritage Run',       'The black ironshore at Hell, then the old West Bay village.',            150, array['Guide','Transport','Postcard'], 'Pickup from West Bay and Seven Mile Beach hotels', 4800,  'approved'),
  ('[Demo] Rum Point Excursions',        'rum-point',           'day_trips',      'Rum Point Beach Day by Boat',        'Cross the North Sound to the quiet side, hammocks and mudslides included.',420, array['Return boat','Loungers','Welcome drink'], 'Board at the Camana Bay dock', 9200,  'approved'),
  ('[Demo] Rum Point Excursions',        'rum-point',           'nightlife',      'Bioluminescent Bay Night Kayak',     'Paddle a dark bay where the water lights up around the blade.',          120, array['Clear-bottom kayak','Guide','Life vest'], 'Meet at the Rum Point jetty', 7800,  'approved'),

  -- Barbados
  ('[Demo] Barbados Cave & Coast Tours', 'central-bb',          'adventure',      'Harrison''s Cave Tram Tour',         'Electric tram a mile into a live limestone cave.',                       150, array['Tram tour','Guide','Helmet'], 'Pickup from west and south coast hotels', 7600,  'approved'),
  ('[Demo] Barbados Cave & Coast Tours', 'east-coast-bb',       'day_trips',      'Bathsheba & East Coast Drive',       'The Atlantic side — Soup Bowl, the rock, and lunch above the surf.',     360, array['Transport','Guide','Lunch'], 'Pickup from west and south coast hotels', 9400,  'approved'),
  ('[Demo] Carlisle Bay Turtle Charters','bridgetown',          'water_sports',   'Swim with Turtles & Shipwrecks',     'Carlisle Bay: hawksbill turtles at one stop, two wrecks at the next.',   180, array['Boat & crew','Snorkel gear','In-water guide'], 'Board at the Carlisle Bay boardwalk', 8200,  'approved'),
  ('[Demo] Carlisle Bay Turtle Charters','west-coast-bb',       'day_trips',      'West Coast Catamaran Cruise',        'Five hours down the platinum coast with lunch and two swim stops.',      300, array['Catamaran & crew','Lunch','Open bar'], 'Pickup from west and south coast hotels', 11800, 'approved'),
  ('[Demo] Oistins Food & Culture',      'south-coast-bb',      'food',           'Oistins Friday Night Fish Fry',      'Grilled marlin, macaroni pie and a street party that runs late.',        240, array['Guide','Dinner','One drink'], 'Pickup from south and west coast hotels', 6600,  'approved'),
  ('[Demo] Oistins Food & Culture',      'south-coast-bb',      'beaches',        'Miami Beach Day Pass',               'Loungers and shade on the calm end of the south coast.',                 420, array['Two loungers','Umbrella','Towels'], 'Meet at the beach car park', 3400,  'approved'),
  ('[Demo] Bajan Heritage Tours',        'north-bb',            'adventure',      'Animal Flower Cave & North Cliffs',  'A sea cave at the northern tip, with rock pools you can swim in.',       300, array['Guide','Entry fee','Lunch'], 'Pickup from west and south coast hotels', 8800,  'approved'),
  ('[Demo] Bajan Heritage Tours',        'north-bb',            'food',           'Plantation House & Rum Distillery',  'A 1658 great house, a working copper still, and a tasting.',             240, array['Guide','House & distillery tour','Tasting flight'], 'Pickup from west and south coast hotels', 9600,  'approved'),
  ('[Demo] Bajan Heritage Tours',        'bridgetown',          'culture',        'Bridgetown & Garrison Walking Tour', 'The UNESCO-listed capital on foot, Careenage to Garrison.',              150, array['Guide','All entry fees'], 'Meet at the Careenage bridge', 4600,  'approved')
) as e(trading, dest_slug, category, title, summary, mins, inclusions, pickup, from_minor, status)
join vendor_organizations o on o.trading_name = e.trading
join destinations d on d.slug = e.dest_slug
join islands i on i.id = d.island_id
left join vendor_locations vl on vl.vendor_org_id = o.id and vl.is_primary
where not exists (select 1 from experiences x where x.title = e.title);

-- --------------------------------------------------------------------------
-- Photography
-- --------------------------------------------------------------------------
--
-- `storage_path` carries the same media KEY the demo dataset uses, not a Supabase Storage path:
-- the files live in `apps/mobile/assets/demo`, downloaded by `scripts/seed-media/fetch.py` from
-- freely-licensed Wikimedia Commons originals. When a hosted project exists these keys become the
-- object names uploaded to the `experience-media` bucket, so nothing here has to change shape.
--
-- `alt_text` is the photograph's TRUE subject, and doubles as half of the required attribution —
-- several listings are illustrated with a representative photograph of the right island rather
-- than of that exact operator, and saying so is what keeps the demo honest. Full author and licence
-- for every file are in `docs/media-credits.md`.
--
-- Generated from `packages/demo/src/dataset.ts`; regenerate rather than editing by hand.

insert into experience_media (experience_id, storage_path, alt_text, sort_order)
select e.id, m.path, m.alt, m.ord
from (values
  ('Dunn''s River Falls Climb', 'jm-dunns-1', 'Dunn''s River Falls, Ocho Rios, Jamaica', 0),
  ('Dunn''s River Falls Climb', 'jm-dunns-2', 'Climbing Dunn''s River Falls, Ocho Rios, Jamaica', 1),
  ('Dunn''s River Falls Climb', 'jm-dunns-3', 'Dunn''s River Falls, Ocho Rios, Jamaica', 2),
  ('Mystic Mountain Bobsled & Zipline', 'jm-mystic-1', 'The gardens at Konoko Falls, in the hills above Ocho Rios, Jamaica', 0),
  ('Mystic Mountain Bobsled & Zipline', 'jm-blue-mountains', 'The Blue Mountains, Jamaica', 1),
  ('White River Tubing', 'jm-white-river-1', 'A bamboo raft on the White River, Ocho Rios, Jamaica', 0),
  ('White River Tubing', 'jm-white-river-2', 'Rafting the White River, Ocho Rios, Jamaica', 1),
  ('Blue Hole Family Day', 'jm-blue-hole-1', 'Island Gully Falls at the Blue Hole, above Ocho Rios, Jamaica', 0),
  ('Blue Hole Family Day', 'jm-blue-hole-2', 'The White River near Ocho Rios, Jamaica', 1),
  ('Catamaran Snorkel & Sunset', 'jm-catamaran-1', 'Sunset off the West End cliffs, Negril, Jamaica', 0),
  ('Catamaran Snorkel & Sunset', 'jm-negril-bay', 'Bloody Bay, Negril, Jamaica', 1),
  ('Seven Mile Beach Day Pass', 'jm-seven-mile-1', 'Seven Mile Beach, Negril, Jamaica', 0),
  ('Seven Mile Beach Day Pass', 'jm-seven-mile-2', 'The beach at Negril, Jamaica', 1),
  ('West End Cliffs Night Out', 'jm-west-end-1', 'Cliff jumping at Rick''s Cafe, Negril, Jamaica', 0),
  ('West End Cliffs Night Out', 'jm-west-end-2', 'The West End cliffs at Rick''s Cafe, Negril, Jamaica', 1),
  ('Blue Mountain Coffee Tasting', 'jm-coffee-1', 'Roasting coffee in Section, Portland Parish, Jamaica', 0),
  ('Blue Mountain Coffee Tasting', 'jm-coffee-2', 'Barrels of Jamaica Blue Mountain coffee', 1),
  ('Blue Mountain Coffee Tasting', 'jm-coffee-3', 'Mavis Bank Coffee Factory, Blue Mountains, Jamaica', 2),
  ('Kingston Music History Tour', 'jm-music-1', 'A Marley mural in Kingston, Jamaica', 0),
  ('Kingston Music History Tour', 'jm-music-2', 'Jonkonnu dancers, Jamaica', 1),
  ('Kingston Craft Market Run', 'jm-craft-1', 'A craft stall in Montego Bay, Jamaica', 0),
  ('Rio Grande Bamboo Rafting', 'jm-rafting-1', 'Bamboo rafting on the Rio Grande, Portland, Jamaica', 0),
  ('Rio Grande Bamboo Rafting', 'jm-rafting-2', 'Bamboo rafting on the Rio Grande, Portland, Jamaica', 1),
  ('Reach Falls Guided Walk', 'jm-reach-1', 'Reach Falls, Portland, Jamaica', 0),
  ('Blue Lagoon Swim & Boat', 'jm-blue-lagoon-1', 'The Blue Lagoon, Port Antonio, Jamaica', 0),
  ('Montego Bay Airport Transfer', 'jm-mobay-1', 'Montego Bay, Jamaica', 0),
  ('MoBay to Negril Day Trip', 'jm-negril-bay', 'Bloody Bay, Negril, Jamaica', 0),
  ('MoBay to Negril Day Trip', 'jm-west-end-2', 'The West End cliffs at Rick''s Cafe, Negril, Jamaica', 1),
  ('Rose Hall Great House Tour', 'jm-rose-hall-1', 'Rose Hall Great House, near Montego Bay, Jamaica', 0),
  ('Sunrise Beach Yoga', 'jm-treasure-1', 'Treasure Beach, St Elizabeth, Jamaica', 0),
  ('Sunrise Beach Yoga', 'jm-south-coast-1', 'A quiet beach in Jamaica', 1),
  ('Black River Seafood Lunch', 'jm-black-river-1', 'A safari boat on the Black River, St Elizabeth, Jamaica', 0),
  ('Stingray City Sandbar', 'ky-stingray-1', 'The sandbar at Stingray City, Grand Cayman', 0),
  ('Stingray City Sandbar', 'ky-stingray-2', 'A southern stingray at Stingray City, Grand Cayman', 1),
  ('Barrier Reef & Coral Garden Snorkel', 'ky-reef-1', 'Coral reef seen while snorkelling, Cayman Islands', 0),
  ('Barrier Reef & Coral Garden Snorkel', 'ky-stingray-2', 'A southern stingray at Stingray City, Grand Cayman', 1),
  ('Seven Mile Beach Club Day', 'ky-seven-mile-1', 'Seven Mile Beach, Grand Cayman', 0),
  ('Seven Mile Beach Club Day', 'ky-hero', 'Seven Mile Beach, Grand Cayman', 1),
  ('Sunset Sail off Seven Mile Beach', 'ky-sail-1', 'Sailboats off Seven Mile Beach, Grand Cayman', 0),
  ('Sunset Sail off Seven Mile Beach', 'ky-sunset-1', 'Sunset in the Cayman Islands', 1),
  ('Camana Bay Food Walk', 'ky-camana-1', 'Camana Bay, Grand Cayman', 0),
  ('Cayman Turtle Centre Family Day', 'ky-turtle-1', 'The snorkel lagoon at the Cayman Turtle Centre, West Bay', 0),
  ('Cayman Turtle Centre Family Day', 'ky-turtle-2', 'A crocodile at the Cayman Turtle Centre, West Bay', 1),
  ('Hell & West Bay Heritage Run', 'ky-hell-1', 'The ironshore formations at Hell, West Bay, Grand Cayman', 0),
  ('Rum Point Beach Day by Boat', 'ky-rum-point-1', 'Rum Point, Grand Cayman', 0),
  ('Rum Point Beach Day by Boat', 'ky-kaibo-1', 'Kaibo Beach, Grand Cayman', 1),
  ('Bioluminescent Bay Night Kayak', 'ky-sunset-1', 'Sunset in the Cayman Islands', 0),
  ('Harrison''s Cave Tram Tour', 'bb-harrisons-1', 'Harrison''s Cave, St Thomas, Barbados', 0),
  ('Harrison''s Cave Tram Tour', 'bb-harrisons-2', 'Harrison''s Cave, St Thomas, Barbados', 1),
  ('Bathsheba & East Coast Drive', 'bb-bathsheba-1', 'The rock at Bathsheba, St Joseph, Barbados', 0),
  ('Bathsheba & East Coast Drive', 'bb-bathsheba-2', 'The east coast at Bathsheba, St Joseph, Barbados', 1),
  ('Swim with Turtles & Shipwrecks', 'bb-turtle-1', 'A sea turtle swimming in clear Caribbean water', 0),
  ('Swim with Turtles & Shipwrecks', 'bb-carlisle-2', 'Carlisle Bay, Bridgetown, Barbados', 1),
  ('West Coast Catamaran Cruise', 'bb-west-coast-1', 'A west coast beach, Barbados', 0),
  ('West Coast Catamaran Cruise', 'bb-hero', 'The coast of Barbados', 1),
  ('Oistins Friday Night Fish Fry', 'bb-oistins-port-1', 'Fishing boats at the port of Oistins, Christ Church, Barbados', 0),
  ('Oistins Friday Night Fish Fry', 'bb-south-coast-1', 'A beach near Hastings, Christ Church, Barbados', 1),
  ('Miami Beach Day Pass', 'bb-oistins-1', 'Miami Beach at Oistins, Christ Church, Barbados', 0),
  ('Animal Flower Cave & North Cliffs', 'bb-animal-flower-1', 'The view out of the Animal Flower Cave, St Lucy, Barbados', 0),
  ('Animal Flower Cave & North Cliffs', 'bb-animal-flower-2', 'The Animal Flower Cave, St Lucy, Barbados', 1),
  ('Plantation House & Rum Distillery', 'bb-rum-1', 'The still at St Nicholas Abbey distillery, St Peter, Barbados', 0),
  ('Bridgetown & Garrison Walking Tour', 'bb-bridgetown-1', 'The Careenage, Bridgetown, Barbados', 0)
) as m(title, path, alt, ord)
join experiences e on e.title = m.title
where not exists (
  select 1 from experience_media em
  where em.experience_id = e.id and em.storage_path = m.path
);

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
-- Scope the rum punch offer to the sunset sailings, one per island.
insert into promotion_experiences (promotion_id, experience_id)
select p.id, e.id
from promotions p
join experiences e on e.title in (
  'Catamaran Snorkel & Sunset',
  'Sunset Sail off Seven Mile Beach',
  'West Coast Catamaran Cruise'
)
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
