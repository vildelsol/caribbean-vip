/**
 * The Jamaica demo dataset.
 *
 * Mirrors `supabase/seed/seed.sql` — same vendors, same listings, same rum-punch offer, same
 * `[Demo]` labelling. Kept deliberately in step with the SQL seed so that switching between demo
 * mode and a real backend changes where the data comes from, not what the app shows.
 *
 * Operating rule 9: none of this is presented as live. Every vendor is prefixed `[Demo]` and every
 * listing carries `isDemo`, which the UI renders wherever a listing appears.
 *
 * The two deliberate negative fixtures from the SQL seed are here too — a draft listing, and an
 * approved listing under an unapproved vendor. In demo mode they are filtered out in the one place
 * that mirrors the RLS policy, so the demo cannot show something the real database would hide.
 */

import type { ExperienceCategory } from '@cvip/types';

export interface DemoIsland {
  id: string;
  code: string;
  name: string;
  in_app_brand: string;
  currency: 'USD' | 'JMD' | 'KYD' | 'BBD';
  timezone: string;
  hero_media_path: string | null;
  is_active: boolean;
}

export interface DemoDestination {
  id: string;
  island_id: string;
  name: string;
  slug: string;
  centre_lat: number;
  centre_lng: number;
  editorial_content: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface DemoVendor {
  id: string;
  islandId: string;
  tradingName: string;
  status: 'approved' | 'pending_review';
  description: string;
  location: { name: string; lat: number; lng: number; destinationSlug: string };
}

export interface DemoOption {
  id: string;
  label: string;
  kind: 'adult' | 'child' | 'addon';
  unitAmountMinor: number;
  occupiesCapacity: boolean;
}

export interface DemoExperience {
  id: string;
  vendorId: string;
  destinationSlug: string;
  category: ExperienceCategory;
  title: string;
  summary: string;
  description: string;
  durationMinutes: number;
  inclusions: string[];
  pickupInfo: string;
  fromAmountMinor: number;
  status: 'approved' | 'draft';
  cancellationHours: number;
}

const JM = 'island-jm';

export const DEMO_ISLANDS: DemoIsland[] = [
  {
    id: JM,
    code: 'JM',
    name: 'Jamaica',
    in_app_brand: 'VIP Jamaica',
    currency: 'JMD',
    timezone: 'America/Jamaica',
    hero_media_path: null,
    is_active: true,
  },
  // Present but inactive, exactly as in the SQL seed: the architecture is island-aware, but only
  // Jamaica is a populated launch market (PRD §2).
  {
    id: 'island-ky',
    code: 'KY',
    name: 'Cayman Islands',
    in_app_brand: 'VIP Cayman',
    currency: 'KYD',
    timezone: 'America/Cayman',
    hero_media_path: null,
    is_active: false,
  },
  {
    id: 'island-bb',
    code: 'BB',
    name: 'Barbados',
    in_app_brand: 'VIP Barbados',
    currency: 'BBD',
    timezone: 'America/Barbados',
    hero_media_path: null,
    is_active: false,
  },
];

export const DEMO_DESTINATIONS: DemoDestination[] = [
  ['Ocho Rios', 'ocho-rios', 18.4074, -77.103, 1, 'Waterfalls, river tubing and cruise-port energy on the north coast.'],
  ['Montego Bay', 'montego-bay', 18.4762, -77.8939, 2, "Jamaica's resort capital — beaches, golf, and the Hip Strip."],
  ['Negril', 'negril', 18.2683, -78.348, 3, 'Seven Mile Beach, cliff diving at West End, and the best sunsets on the island.'],
  ['Kingston', 'kingston', 17.9714, -76.7936, 4, 'The capital: music history, food, galleries and the Blue Mountains behind it.'],
  ['Port Antonio', 'port-antonio', 18.181, -76.45, 5, 'The quiet northeast — Blue Lagoon, Reach Falls and rafting the Rio Grande.'],
  ['South Coast', 'south-coast', 18.0333, -77.75, 6, 'Treasure Beach, Black River safari and YS Falls, away from the resort strip.'],
].map(([name, slug, lat, lng, order, blurb]) => ({
  id: `dest-${slug as string}`,
  island_id: JM,
  name: name as string,
  slug: slug as string,
  centre_lat: lat as number,
  centre_lng: lng as number,
  editorial_content: blurb as string,
  sort_order: order as number,
  is_active: true,
}));

export const DEMO_VENDORS: DemoVendor[] = [
  {
    id: 'vendor-dunns',
    islandId: JM,
    tradingName: "[Demo] Dunn's River Adventures",
    status: 'approved',
    description: 'Waterfall climbs and river tubing around Ocho Rios.',
    location: { name: "Dunn's River Falls base", lat: 18.4153, lng: -77.136, destinationSlug: 'ocho-rios' },
  },
  {
    id: 'vendor-negril',
    islandId: JM,
    tradingName: '[Demo] Negril Sunset Cruises',
    status: 'approved',
    description: 'Catamaran cruises and snorkelling off Seven Mile Beach.',
    location: { name: 'Seven Mile Beach jetty', lat: 18.29, lng: -78.345, destinationSlug: 'negril' },
  },
  {
    id: 'vendor-coffee',
    islandId: JM,
    tradingName: '[Demo] Blue Mountain Coffee Tours',
    status: 'approved',
    description: 'Plantation tours and tastings above Kingston.',
    location: { name: 'Irish Town meeting point', lat: 18.07, lng: -76.71, destinationSlug: 'kingston' },
  },
  {
    id: 'vendor-portland',
    islandId: JM,
    tradingName: '[Demo] Portland River Rafting',
    status: 'approved',
    description: 'Bamboo rafting and Blue Lagoon trips from Port Antonio.',
    location: { name: 'Rio Grande put-in', lat: 18.14, lng: -76.42, destinationSlug: 'port-antonio' },
  },
  {
    id: 'vendor-rides',
    islandId: JM,
    tradingName: '[Demo] Irie Rides Transport',
    status: 'approved',
    description: 'Airport transfers and private drivers island-wide.',
    location: { name: 'Sangster Airport desk', lat: 18.5037, lng: -77.9134, destinationSlug: 'montego-bay' },
  },
  {
    id: 'vendor-wellness',
    islandId: JM,
    tradingName: '[Demo] Treasure Beach Wellness',
    status: 'approved',
    description: 'Beachfront yoga, massage and sound baths on the south coast.',
    location: { name: 'Calabash Bay studio', lat: 17.885, lng: -77.77, destinationSlug: 'south-coast' },
  },
  // Negative fixture, matching the SQL seed: its approved listing must stay invisible (V-02).
  {
    id: 'vendor-unverified',
    islandId: JM,
    tradingName: '[Demo] Unverified Excursions',
    status: 'pending_review',
    description: 'Deliberately unapproved — proves unapproved vendors stay invisible.',
    location: { name: 'Unverified base', lat: 18.41, lng: -77.11, destinationSlug: 'ocho-rios' },
  },
];

export const DEMO_EXPERIENCES: DemoExperience[] = [
  {
    id: 'exp-dunns-falls',
    vendorId: 'vendor-dunns',
    destinationSlug: 'ocho-rios',
    category: 'waterfalls',
    title: "Dunn's River Falls Climb",
    summary: 'Climb the terraced falls with a guide, then swim at the beach below.',
    description:
      'Six hundred feet of natural limestone terraces running straight into the Caribbean. Your guide takes the group up hand-in-hand through the cool pools, with plenty of stops to swim and take photographs. Afterwards the beach at the bottom is yours for as long as you like.',
    durationMinutes: 180,
    inclusions: ['Licensed guide', 'Park entry fee', 'Locker', 'Water shoes'],
    pickupInfo: 'Hotel pickup available across Ocho Rios',
    fromAmountMinor: 6500,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-white-river',
    vendorId: 'vendor-dunns',
    destinationSlug: 'ocho-rios',
    category: 'adventure',
    title: 'White River Tubing',
    summary: 'Float the White River through easy rapids and calm stretches.',
    description:
      'A gentle 90-minute float through bamboo-shaded stretches and a few laughing rapids. Guides run the river alongside you the whole way. Suitable for anyone comfortable in water; no experience needed.',
    durationMinutes: 150,
    inclusions: ['Tube', 'Life vest', 'River guide', 'Rum punch at the end'],
    pickupInfo: 'Hotel pickup available across Ocho Rios',
    fromAmountMinor: 5900,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-blue-hole',
    vendorId: 'vendor-dunns',
    destinationSlug: 'ocho-rios',
    category: 'family',
    title: 'Blue Hole Family Day',
    summary: 'Shallow pools, rope swings and picnic space for all ages.',
    description:
      'The Blue Hole is a series of turquoise pools in the hills above Ocho Rios. Shallow edges for small children, rope swings and jump ledges for everyone else, and shaded picnic tables for the middle of the day.',
    durationMinutes: 240,
    inclusions: ['Guide', 'Entry fee', 'Jerk chicken lunch'],
    pickupInfo: 'Hotel pickup available across Ocho Rios',
    fromAmountMinor: 7400,
    status: 'approved',
    cancellationHours: 48,
  },
  {
    id: 'exp-catamaran',
    vendorId: 'vendor-negril',
    destinationSlug: 'negril',
    category: 'water_sports',
    title: 'Catamaran Snorkel & Sunset',
    summary: 'Sail Seven Mile Beach, snorkel the reef, finish at sunset.',
    description:
      'Three and a half hours under sail along Seven Mile Beach. We anchor over the reef for an hour of snorkelling, then turn for the West End cliffs to watch the sun go down with the bar open.',
    durationMinutes: 210,
    inclusions: ['Snorkel gear', 'Open bar', 'Snacks & fresh fruit', 'Crew and local guide'],
    pickupInfo: 'Pickup from Norman Manley Boulevard hotels',
    fromAmountMinor: 8900,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-beach-pass',
    vendorId: 'vendor-negril',
    destinationSlug: 'negril',
    category: 'beaches',
    title: 'Seven Mile Beach Day Pass',
    summary: 'Loungers, umbrella and beach service for the day.',
    description:
      'A reserved pair of loungers and an umbrella on the quieter end of Seven Mile Beach, with table service from the beach bar and access to showers and changing rooms.',
    durationMinutes: 480,
    inclusions: ['Two loungers', 'Umbrella', 'Towels', 'Showers & changing rooms'],
    pickupInfo: 'Meet at the jetty',
    fromAmountMinor: 3500,
    status: 'approved',
    cancellationHours: 12,
  },
  {
    id: 'exp-west-end',
    vendorId: 'vendor-negril',
    destinationSlug: 'negril',
    category: 'nightlife',
    title: 'West End Cliffs Night Out',
    summary: 'Cliffside bars, live music and a late boat back.',
    description:
      'Three cliffside bars along the West End, live music at each, and a boat back along the coast at the end of the night. Over-18s only.',
    durationMinutes: 300,
    inclusions: ['Transport', 'Entry to all venues', 'Welcome drink'],
    pickupInfo: 'Pickup from Negril hotels',
    fromAmountMinor: 6200,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-coffee',
    vendorId: 'vendor-coffee',
    destinationSlug: 'kingston',
    category: 'food',
    title: 'Blue Mountain Coffee Tasting',
    summary: 'Walk the plantation, roast a batch, taste through the grades.',
    description:
      'Up into the Blue Mountains to a working estate. Walk the rows, see the cherries pulped and dried, roast a small batch yourself, then taste through the grades side by side and learn why the peaberry costs what it does.',
    durationMinutes: 240,
    inclusions: ['Plantation tour', 'Roasting session', 'Full tasting', 'Return transport'],
    pickupInfo: 'Pickup from New Kingston hotels',
    fromAmountMinor: 7900,
    status: 'approved',
    cancellationHours: 48,
  },
  {
    id: 'exp-music',
    vendorId: 'vendor-coffee',
    destinationSlug: 'kingston',
    category: 'culture',
    title: 'Kingston Music History Tour',
    summary: 'Studio One, Trench Town and the Bob Marley Museum with a guide.',
    description:
      'A half day through the places reggae actually came from: Studio One, the Trench Town Culture Yard, and 56 Hope Road. Your guide grew up in the city and knows the people as well as the buildings.',
    durationMinutes: 300,
    inclusions: ['Guide', 'All entry fees', 'Air-conditioned transport'],
    pickupInfo: 'Pickup from New Kingston hotels',
    fromAmountMinor: 8500,
    status: 'approved',
    cancellationHours: 48,
  },
  {
    id: 'exp-craft',
    vendorId: 'vendor-coffee',
    destinationSlug: 'kingston',
    category: 'shopping',
    title: 'Kingston Craft Market Run',
    summary: 'Guided craft market visit with a local buyer.',
    description:
      'A working buyer takes you through the craft market, shows you what is actually made in Jamaica versus imported, and handles the haggling if you would rather not.',
    durationMinutes: 180,
    inclusions: ['Guide', 'Transport'],
    pickupInfo: 'Pickup from New Kingston hotels',
    fromAmountMinor: 4200,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-rafting',
    vendorId: 'vendor-portland',
    destinationSlug: 'port-antonio',
    category: 'day_trips',
    title: 'Rio Grande Bamboo Rafting',
    summary: 'Two hours downriver on a bamboo raft, poled by a licensed captain.',
    description:
      'Thirty feet of bamboo, a raised seat for two, and a captain who poles you down the Rio Grande through the Blue Mountain foothills. Quiet, slow, and the single most photographed thing in Portland.',
    durationMinutes: 200,
    inclusions: ['Raft and licensed captain', 'Fresh fruit', 'Return transport'],
    pickupInfo: 'Pickup from Port Antonio hotels',
    fromAmountMinor: 8800,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-reach',
    vendorId: 'vendor-portland',
    destinationSlug: 'port-antonio',
    category: 'waterfalls',
    title: 'Reach Falls Guided Walk',
    summary: 'Walk the river up to Reach Falls and swim the hidden pools.',
    description:
      'Wade up the Driver River to Reach Falls, then swim through to the underwater cave behind the main drop if you fancy it. Less crowded than the north-coast falls.',
    durationMinutes: 180,
    inclusions: ['Guide', 'Entry fee'],
    pickupInfo: 'Pickup from Port Antonio hotels',
    fromAmountMinor: 5500,
    status: 'approved',
    cancellationHours: 24,
  },
  {
    id: 'exp-transfer',
    vendorId: 'vendor-rides',
    destinationSlug: 'montego-bay',
    category: 'transportation',
    title: 'Montego Bay Airport Transfer',
    summary: 'Private air-conditioned transfer, meet and greet on arrival.',
    description:
      'Your driver meets you inside arrivals with a name board, helps with bags, and takes you straight to your hotel. Flight is tracked, so a delay costs you nothing.',
    durationMinutes: 60,
    inclusions: ['Private vehicle', 'Meet & greet', 'Bottled water', 'Flight tracking'],
    pickupInfo: 'Arrivals hall, Sangster International',
    fromAmountMinor: 4500,
    status: 'approved',
    cancellationHours: 12,
  },
  {
    id: 'exp-daytrip',
    vendorId: 'vendor-rides',
    destinationSlug: 'montego-bay',
    category: 'day_trips',
    title: 'MoBay to Negril Day Trip',
    summary: 'Private driver for the day, stops wherever you like along the coast.',
    description:
      'Ten hours with a private driver and vehicle. The usual run is the coast road to Negril with stops at Half Moon Bay and Rick’s Cafe, but the day is yours to shape.',
    durationMinutes: 600,
    inclusions: ['Private vehicle', 'Driver for the day', 'Fuel and tolls'],
    pickupInfo: 'Hotel pickup in Montego Bay',
    fromAmountMinor: 15900,
    status: 'approved',
    cancellationHours: 48,
  },
  {
    id: 'exp-yoga',
    vendorId: 'vendor-wellness',
    destinationSlug: 'south-coast',
    category: 'wellness',
    title: 'Sunrise Beach Yoga',
    summary: 'Ninety minutes of vinyasa on the sand as the sun comes up.',
    description:
      'Mats laid out on Calabash Bay before first light. A slow vinyasa flow timed so that savasana lands as the sun clears the horizon, followed by herbal tea.',
    durationMinutes: 90,
    inclusions: ['Mat and props', 'Instructor', 'Herbal tea'],
    pickupInfo: 'Meet at the Calabash Bay studio',
    fromAmountMinor: 3200,
    status: 'approved',
    cancellationHours: 12,
  },
  {
    id: 'exp-seafood',
    vendorId: 'vendor-wellness',
    destinationSlug: 'south-coast',
    category: 'food',
    title: 'Black River Seafood Lunch',
    summary: 'Boat to a riverside kitchen for pepper shrimp and fried fish.',
    description:
      'A boat up the Black River past the mangroves and the crocodiles, to a kitchen on stilts that has been doing pepper shrimp the same way for forty years.',
    durationMinutes: 240,
    inclusions: ['Boat trip', 'Lunch', 'Guide'],
    pickupInfo: 'Pickup from Treasure Beach guesthouses',
    fromAmountMinor: 6800,
    status: 'approved',
    cancellationHours: 24,
  },
  // Negative fixture: a DRAFT listing under an approved vendor. Must never be visible (T-03).
  {
    id: 'exp-draft',
    vendorId: 'vendor-wellness',
    destinationSlug: 'south-coast',
    category: 'wellness',
    title: 'Sound Bath (unpublished draft)',
    summary: 'Draft listing used to prove drafts never appear publicly.',
    description: 'Should never be visible to a tourist.',
    durationMinutes: 75,
    inclusions: ['Mat'],
    pickupInfo: 'Meet at the Calabash Bay studio',
    fromAmountMinor: 3000,
    status: 'draft',
    cancellationHours: 12,
  },
  // Negative fixture: an APPROVED listing under an UNAPPROVED vendor. Must never be visible (V-02).
  {
    id: 'exp-unverified',
    vendorId: 'vendor-unverified',
    destinationSlug: 'ocho-rios',
    category: 'adventure',
    title: 'Unverified Vendor Excursion',
    summary: 'Approved listing under an unapproved vendor — must stay invisible.',
    description: 'Should never be visible to a tourist.',
    durationMinutes: 120,
    inclusions: ['Guide'],
    pickupInfo: 'Ocho Rios',
    fromAmountMinor: 5000,
    status: 'approved',
    cancellationHours: 24,
  },
];

/** Adult / child / add-on, matching the option pattern in the SQL seed. */
export function demoOptionsFor(experience: DemoExperience): DemoOption[] {
  return [
    {
      id: `${experience.id}-adult`,
      label: 'Adult',
      kind: 'adult',
      unitAmountMinor: experience.fromAmountMinor,
      occupiesCapacity: true,
    },
    {
      id: `${experience.id}-child`,
      label: 'Child (4–11)',
      kind: 'child',
      unitAmountMinor: Math.round((experience.fromAmountMinor * 6) / 10),
      occupiesCapacity: true,
    },
    {
      id: `${experience.id}-photo`,
      label: 'Photo package',
      kind: 'addon',
      unitAmountMinor: 1500,
      occupiesCapacity: false,
    },
  ];
}

export const DEMO_PROMOTION = {
  id: 'promo-rum-punch',
  vendorId: 'vendor-negril',
  title: 'Free rum punch with a qualifying booking',
  terms:
    'DEMO OFFER. One drink per adult guest on a confirmed booking. Must be 18 or older. Not redeemable for cash. Valid only at the issuing vendor during the offer window. Subject to availability.',
  appliesToExperienceIds: ['exp-catamaran'],
};

export const DEMO_PRICING_CONFIG = {
  taxRate: 0.15,
  serviceFeeRate: 0.05,
  commissionRate: 0.12,
};

/**
 * The visibility rule, in one place, mirroring the `experiences_public_read` RLS policy.
 *
 * Demo mode has no database to enforce this, so it is enforced here — and only here — so the demo
 * cannot show a listing the real backend would hide.
 */
export function isPubliclyVisibleDemo(experience: DemoExperience): boolean {
  if (experience.status !== 'approved') return false;
  const vendor = DEMO_VENDORS.find((v) => v.id === experience.vendorId);
  return vendor?.status === 'approved';
}
