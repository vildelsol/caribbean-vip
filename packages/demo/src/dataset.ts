/**
 * The demo dataset — Jamaica, the Cayman Islands and Barbados.
 *
 * Mirrors `supabase/seed/seed.sql`: same islands, same vendors, same listings, same rum-punch
 * offer. Kept deliberately in step with the SQL seed so that switching between seeded data and a
 * real backend changes where the data comes from, not what the app shows.
 *
 * The two deliberate negative fixtures from the SQL seed are here too — a draft listing, and an
 * approved listing under an unapproved vendor. In demo mode they are filtered out in the one place
 * that mirrors the RLS policy, so the demo cannot show something the real database would hide.
 *
 * ## Photography
 *
 * `media` holds keys into `apps/tourist-web/public/demo`, populated by `scripts/seed-media/fetch.py`
 * from freely-licensed Wikimedia Commons files. `credits.json` carries the author, the licence and
 * — importantly — the SUBJECT of each photograph, which the app renders under the image. Several
 * listings are illustrated with a representative photograph of the right island rather than of
 * that exact operator, so naming the true subject is what keeps the demo honest.
 *
 * ## Why three islands are active here
 *
 * PRD §2 makes Jamaica the launch market, and the SQL seed originally left Cayman and Barbados
 * present-but-inactive. They are populated and active now because the platform's island-awareness
 * is the thing an investor demonstration most needs to show, and an island that cannot be selected
 * demonstrates nothing. Jamaica is still first and still the deepest catalogue.
 */

import type { ExperienceCategory } from '@cvip/types';

export interface DemoIsland {
  id: string;
  code: string;
  name: string;
  in_app_brand: string;
  /**
   * How the island says hello, in its own words.
   *
   * Irie greeted every guest with "Wah Gwaan!", which is Jamaican — correct on one island and
   * borrowed on the other two. The whole point of opening in Patois is that it reads as *built
   * here* rather than built for here, and a Bajan greeted in Jamaican gets the opposite signal:
   * one island's voice applied to a region, which is exactly what the off-island competitors do.
   *
   * It belongs on the island record, beside `in_app_brand`, so a fourth market brings its own
   * greeting with it rather than inheriting Jamaica's.
   */
  greeting: string;
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
  islandId: string;
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
  /** Keys into `apps/tourist-web/public/demo`. First entry is the hero image. */
  media: string[];
  /**
   * Demo rating, shown on cards and the detail page.
   *
   * Demo-only, and deliberately not a column on `experiences`: a real rating is an aggregate over
   * the `reviews` table, computed from guests who actually completed a booking. These stand in for
   * that aggregate so the UI can be built and shown before there are any real reviews to average.
   */
  ratingAverage: number;
  ratingCount: number;
  /**
   * The separate activities included at one venue, shown as a row of pills on the detail screen.
   *
   * Only for listings that genuinely bundle several things — a bobsled park, a multi-stop food
   * walk. A single-activity listing omits this rather than padding it out, because a pill row that
   * restates the title is noise.
   */
  subOptions?: string[];
  /** Minimum age, where the operator sets one. Renders in place of the group fact. */
  minAge?: number;
  /** One featured guest review. Demo-only, standing in for an aggregate over `reviews`. */
  review?: { quote: string; author: string; context: string; date: string };
  /**
   * Where this listing actually starts, when that is not the operator's own base.
   *
   * Distance used to be measured from the **vendor**, and 39 listings share 15 vendors — about
   * five coordinates per island. That is why Dunn's River Falls and Mystic Mountain both read
   * "8 MIN DRIVE · 3.6 KM": same operator, same point, two places 2 km apart. A sort keyed on a
   * number that cannot tell two listings apart is not a sort, and "nearest first" was the claim
   * the screen was making.
   *
   * Omitted where the operator's base genuinely is the meeting point — a transfer desk at the
   * airport, a studio you walk into — so the field marks a real difference rather than restating
   * the vendor on every record.
   */
  meetingPoint?: { name: string; lat: number; lng: number };
}

const JM = 'island-jm';
const KY = 'island-ky';
const BB = 'island-bb';

export const DEMO_ISLANDS: DemoIsland[] = [
  {
    id: JM,
    code: 'JM',
    name: 'Jamaica',
    in_app_brand: 'VIP Jamaica',
    greeting: 'Wah Gwaan!',
    currency: 'JMD',
    timezone: 'America/Jamaica',
    hero_media_path: 'jm-hero',
    is_active: true,
  },
  {
    id: KY,
    code: 'KY',
    name: 'Cayman Islands',
    in_app_brand: 'VIP Cayman',
    greeting: 'Wah goin on!',
    currency: 'KYD',
    timezone: 'America/Cayman',
    hero_media_path: 'ky-hero',
    is_active: true,
  },
  {
    id: BB,
    code: 'BB',
    name: 'Barbados',
    in_app_brand: 'VIP Barbados',
    greeting: 'Wuh gine on!',
    currency: 'BBD',
    timezone: 'America/Barbados',
    hero_media_path: 'bb-hero',
    is_active: true,
  },
  // Negative fixture, matching the SQL seed. Cayman and Barbados used to serve this role by being
  // inactive; now that they are live, an unlaunched market is kept here on purpose so the rule that
  // hides one still has a subject. `islands()` filters it out — that filter is the thing under test.
  {
    id: 'island-ag',
    code: 'AG',
    name: 'Antigua & Barbuda',
    in_app_brand: 'VIP Antigua',
    greeting: 'Wah gwan!',
    currency: 'USD',
    timezone: 'America/Antigua',
    hero_media_path: null,
    is_active: false,
  },
];

type DestSpec = [name: string, slug: string, lat: number, lng: number, order: number, blurb: string];

function destinations(islandId: string, specs: DestSpec[]): DemoDestination[] {
  return specs.map(([name, slug, lat, lng, order, blurb]) => ({
    id: `dest-${slug}`,
    island_id: islandId,
    name,
    slug,
    centre_lat: lat,
    centre_lng: lng,
    editorial_content: blurb,
    sort_order: order,
    is_active: true,
  }));
}

export const DEMO_DESTINATIONS: DemoDestination[] = [
  ...destinations(JM, [
    ['Ocho Rios', 'ocho-rios', 18.4074, -77.103, 1, 'Waterfalls, river tubing and cruise-port energy on the north coast.'],
    ['Montego Bay', 'montego-bay', 18.4762, -77.8939, 2, "Jamaica's resort capital — beaches, golf, and the Hip Strip."],
    ['Negril', 'negril', 18.2683, -78.348, 3, 'Seven Mile Beach, cliff diving at West End, and the best sunsets on the island.'],
    ['Kingston', 'kingston', 17.9714, -76.7936, 4, 'The capital: music history, food, galleries and the Blue Mountains behind it.'],
    ['Port Antonio', 'port-antonio', 18.181, -76.45, 5, 'The quiet northeast — Blue Lagoon, Reach Falls and rafting the Rio Grande.'],
    ['South Coast', 'south-coast', 18.0333, -77.75, 6, 'Treasure Beach, Black River safari and the fishing villages, away from the resort strip.'],
  ]),
  ...destinations(KY, [
    ['George Town', 'george-town', 19.2869, -81.3674, 1, 'The capital and cruise port — duty-free shopping, museums and the harbourfront.'],
    ['Seven Mile Beach', 'seven-mile-beach-ky', 19.3436, -81.3863, 2, 'Six miles of coral sand, calm water, and most of the island’s resorts and restaurants.'],
    ['West Bay', 'west-bay', 19.3775, -81.4113, 3, 'Stingray City, the turtle centre, and the ironshore formations at Hell.'],
    ['Rum Point & North Side', 'rum-point', 19.3617, -81.2686, 4, 'Shallow turquoise flats, hammocks under the pines, and the quiet end of the island.'],
    ['East End', 'east-end', 19.3011, -81.1041, 5, 'Blowholes, wall diving and the reef that keeps the whole coast calm.'],
  ]),
  ...destinations(BB, [
    ['Bridgetown', 'bridgetown', 13.0969, -59.6145, 1, 'UNESCO-listed capital: the Careenage, the Garrison, and Carlisle Bay right beside it.'],
    ['Holetown & West Coast', 'west-coast-bb', 13.1866, -59.6389, 2, 'The calm Caribbean side — platinum-coast beaches, turtles and sunset sailing.'],
    ['Oistins & South Coast', 'south-coast-bb', 13.0664, -59.5395, 3, 'Fish fry on a Friday night, kite surfing by day, and the liveliest stretch of coast.'],
    ['Bathsheba & East Coast', 'east-coast-bb', 13.2136, -59.5236, 4, 'Atlantic surf, the Soup Bowl, and the rock formations that put Barbados on postcards.'],
    ['St Lucy & North', 'north-bb', 13.3271, -59.6428, 5, 'Cliffs, the Animal Flower Cave, and the plantation houses inland.'],
    ['Central Parishes', 'central-bb', 13.1833, -59.5722, 6, 'Harrison’s Cave, gullies and gardens in the green middle of the island.'],
  ]),
];

export const DEMO_VENDORS: DemoVendor[] = [
  // -- Jamaica -------------------------------------------------------------
  {
    id: 'vendor-dunns',
    islandId: JM,
    tradingName: "Dunn's River Adventures",
    status: 'approved',
    description: 'Waterfall climbs and river tubing around Ocho Rios.',
    location: { name: "Dunn's River Falls base", lat: 18.4153, lng: -77.136, destinationSlug: 'ocho-rios' },
  },
  /*
   * Ocho Rios had eight listings and all of them were adventure or nature.
   *
   * The mood tiles promise four kinds of day. On the island the app opens in, "Relax & Unwind" and
   * "Taste Jamaica" returned nothing within 25 km — the nearest answers were Negril and the south
   * coast, 100 km+ away. That is the George Town gap in a different costume: a feature nobody can
   * see through is a data gap wearing a UI. These two operators are what make the tiles answerable
   * where every Jamaican guest actually starts.
   */
  {
    id: 'vendor-ochi-shore',
    islandId: JM,
    tradingName: 'Ochi Shore Company',
    status: 'approved',
    description:
      'Beach days and shoreline mornings around Ocho Rios bay. Family-run, two beach set-ups and a yoga deck in Turtle River Park.',
    location: { name: 'Ocho Rios Bay Beach', lat: 18.409, lng: -77.1035, destinationSlug: 'ocho-rios' },
  },
  {
    id: 'vendor-ochi-table',
    islandId: JM,
    tradingName: 'Ochi Table',
    status: 'approved',
    description:
      'Jerk pits, fish fry and the night strip, walked with people who eat there. Ocho Rios only — they will not take you out of town for a meal.',
    location: { name: 'Ocho Rios town centre', lat: 18.407, lng: -77.101, destinationSlug: 'ocho-rios' },
  },
  {
    id: 'vendor-negril',
    islandId: JM,
    tradingName: 'Negril Sunset Cruises',
    status: 'approved',
    description: 'Catamaran cruises and snorkelling off Seven Mile Beach.',
    location: { name: 'Seven Mile Beach jetty', lat: 18.29, lng: -78.345, destinationSlug: 'negril' },
  },
  {
    id: 'vendor-coffee',
    islandId: JM,
    tradingName: 'Blue Mountain Coffee Tours',
    status: 'approved',
    description: 'Plantation tours, tastings and city culture above Kingston.',
    location: { name: 'Irish Town meeting point', lat: 18.07, lng: -76.71, destinationSlug: 'kingston' },
  },
  {
    id: 'vendor-portland',
    islandId: JM,
    tradingName: 'Portland River Rafting',
    status: 'approved',
    description: 'Bamboo rafting, waterfalls and Blue Lagoon trips from Port Antonio.',
    location: { name: 'Rio Grande put-in', lat: 18.14, lng: -76.42, destinationSlug: 'port-antonio' },
  },
  {
    id: 'vendor-rides',
    islandId: JM,
    tradingName: 'Irie Rides Transport',
    status: 'approved',
    description: 'Airport transfers, private drivers and heritage day trips island-wide.',
    location: { name: 'Sangster Airport desk', lat: 18.5037, lng: -77.9134, destinationSlug: 'montego-bay' },
  },
  {
    id: 'vendor-wellness',
    islandId: JM,
    tradingName: 'Treasure Beach Wellness',
    status: 'approved',
    description: 'Beachfront yoga, massage and south-coast food trips.',
    location: { name: 'Calabash Bay studio', lat: 17.885, lng: -77.77, destinationSlug: 'south-coast' },
  },
  // Negative fixture, matching the SQL seed: its approved listing must stay invisible (V-02).
  {
    id: 'vendor-unverified',
    islandId: JM,
    tradingName: 'Unverified Excursions',
    status: 'pending_review',
    description: 'Deliberately unapproved — proves unapproved vendors stay invisible.',
    location: { name: 'Unverified base', lat: 18.41, lng: -77.11, destinationSlug: 'ocho-rios' },
  },

  // -- Cayman Islands ------------------------------------------------------
  {
    id: 'vendor-ky-stingray',
    islandId: KY,
    tradingName: 'North Sound Stingray Charters',
    status: 'approved',
    description: 'Sandbar, reef and barrier-reef snorkelling trips out of West Bay.',
    location: { name: 'West Bay public dock', lat: 19.3768, lng: -81.4046, destinationSlug: 'west-bay' },
  },
  {
    id: 'vendor-ky-camana',
    islandId: KY,
    tradingName: 'Camana Bay Concierge',
    status: 'approved',
    description: 'Food walks, shopping and sailing along Seven Mile Beach.',
    location: { name: 'Camana Bay waterfront', lat: 19.3243, lng: -81.3818, destinationSlug: 'seven-mile-beach-ky' },
  },
  {
    id: 'vendor-ky-turtle',
    islandId: KY,
    tradingName: 'West Bay Family Adventures',
    status: 'approved',
    description: 'Turtle centre visits and the West Bay heritage run, built around small children.',
    location: { name: 'Turtle Centre entrance', lat: 19.3839, lng: -81.4157, destinationSlug: 'west-bay' },
  },
  /*
   * George Town had no operator based in it — and it is the destination every Cayman guest opens
   * the app in. A default destination with no local inventory is a guest landing where nothing is,
   * and it is the reason the offer needed an 8 km radius to find anything at all.
   */
  {
    id: 'vendor-ky-georgetown',
    islandId: KY,
    tradingName: 'Cayman Heritage & Harbour Co.',
    status: 'approved',
    description:
      'A George Town family operation running the harbour reefs and the old town on foot. Two boats, four guides, and a shop on the waterfront since 1998.',
    location: { name: 'George Town waterfront', lat: 19.293, lng: -81.386, destinationSlug: 'george-town' },
  },
  {
    id: 'vendor-ky-rumpoint',
    islandId: KY,
    tradingName: 'Rum Point Excursions',
    status: 'approved',
    description: 'Boat days, beach clubs and sunset trips on the quiet north side.',
    location: { name: 'Rum Point jetty', lat: 19.3626, lng: -81.2704, destinationSlug: 'rum-point' },
  },

  // -- Barbados ------------------------------------------------------------
  {
    id: 'vendor-bb-cave',
    islandId: BB,
    tradingName: 'Barbados Cave & Coast Tours',
    status: 'approved',
    description: "Harrison's Cave, the east coast and the gullies in between.",
    location: { name: "Harrison's Cave visitor centre", lat: 13.1852, lng: -59.5714, destinationSlug: 'central-bb' },
  },
  {
    id: 'vendor-bb-carlisle',
    islandId: BB,
    tradingName: 'Carlisle Bay Turtle Charters',
    status: 'approved',
    description: 'Turtle and shipwreck snorkelling, and catamaran days down the west coast.',
    location: { name: 'Carlisle Bay boardwalk', lat: 13.0797, lng: -59.6142, destinationSlug: 'bridgetown' },
  },
  {
    id: 'vendor-bb-oistins',
    islandId: BB,
    tradingName: 'Oistins Food & Culture',
    status: 'approved',
    description: 'The Friday fish fry, south-coast beaches and rum shops with a guide.',
    location: { name: 'Oistins Bay Garden', lat: 13.0664, lng: -59.5395, destinationSlug: 'south-coast-bb' },
  },
  {
    id: 'vendor-bb-heritage',
    islandId: BB,
    tradingName: 'Bajan Heritage Tours',
    status: 'approved',
    description: 'Plantation houses, rum distilleries and the northern cliffs.',
    location: { name: 'Speightstown meeting point', lat: 13.2494, lng: -59.6428, destinationSlug: 'north-bb' },
  },
];

export const DEMO_EXPERIENCES: DemoExperience[] = [
  // =========================================================== Jamaica ====
  {
    id: 'exp-dunns-falls',
    vendorId: 'vendor-dunns',
    islandId: JM,
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
    media: ['jm-dunns-1', 'jm-dunns-2', 'jm-dunns-3'],
    ratingAverage: 4.8,
    ratingCount: 1285,
    subOptions: ['Falls Climb', 'Beach Time', 'Craft Market'],
    minAge: 6,
    review: {
      quote:
        'Going up hand-in-hand with strangers turns into the friendliest thing you do all week.',
      author: 'Priya M.',
      context: 'Travelling with friends',
      date: 'April 2026',
    },
  },
  {
    id: 'exp-mystic-mountain',
    meetingPoint: { name: 'Mystic Mountain base station', lat: 18.4108, lng: -77.1178 },
    vendorId: 'vendor-dunns',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'adventure',
    title: 'Mystic Mountain Bobsled & Zipline',
    summary: 'Chairlift through the rainforest canopy, then bobsled and zipline back down.',
    description:
      'A chairlift lifts you up through the canopy above Ocho Rios with the bay opening out behind you. At the top: a gravity bobsled on rails that you control yourself, a zipline circuit through the trees, and an infinity pool with a waterslide for afterwards. Good for families — the bobsled seats two.',
    durationMinutes: 210,
    inclusions: ['Chairlift ride', 'Bobsled run', 'Zipline circuit', 'Pool access', 'Guide'],
    pickupInfo: 'Hotel pickup available across Ocho Rios',
    fromAmountMinor: 9800,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-mystic-1', 'jm-blue-mountains'],
    ratingAverage: 4.8,
    ratingCount: 2314,
    subOptions: ['Bobsled Ride', 'Zipline Canopy', 'Sky Chairlift', 'Rainforest Walk'],
    minAge: 5,
    review: {
      quote:
        'Our guide made the kids feel like explorers. The bobsled was the highlight of our cruise stop.',
      author: 'Dana & Chris',
      context: 'Family of four',
      date: 'May 2026',
    },
  },
  {
    id: 'exp-white-river',
    meetingPoint: { name: 'White River tubing put-in', lat: 18.4265, lng: -77.0836 },
    vendorId: 'vendor-dunns',
    islandId: JM,
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
    media: ['jm-white-river-1', 'jm-white-river-2'],
    ratingAverage: 4.6,
    ratingCount: 612,
  },
  {
    id: 'exp-blue-hole',
    meetingPoint: { name: 'Island Gully Falls car park', lat: 18.3707, lng: -77.0483 },
    vendorId: 'vendor-dunns',
    islandId: JM,
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
    media: ['jm-blue-hole-1', 'jm-blue-hole-2'],
    ratingAverage: 4.7,
    ratingCount: 864,
  },
  {
    id: 'exp-ochi-bay-beach',
    meetingPoint: { name: 'Ocho Rios Bay Beach gate', lat: 18.41, lng: -77.103 },
    vendorId: 'vendor-ochi-shore',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'beaches',
    title: 'Ocho Rios Bay Beach Day',
    summary: 'Loungers, shade and lunch on the town beach, five minutes from the pier.',
    description:
      'The bay beach in the middle of town \u2014 calm water, no swell, and the one Ocho Rios families use. Two loungers, an umbrella, towels and a lunch order sent down from the grill behind.',
    durationMinutes: 360,
    inclusions: ['Two loungers', 'Umbrella', 'Towels', 'Lunch order'],
    pickupInfo: 'Meet at the Ocho Rios Bay Beach gate',
    fromAmountMinor: 4200,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-seven-mile-1'],
    ratingAverage: 4.5,
    ratingCount: 214,
    review: {
      quote: 'Ten minutes off the ship and we were in the water. Calm as a pool.',
      author: 'Denise R.',
      context: 'Visited in June',
      date: '2026-06-14',
    },
  },
  {
    id: 'exp-ochi-mahogany',
    meetingPoint: { name: 'Mahogany Beach entrance', lat: 18.4075, lng: -77.097 },
    vendorId: 'vendor-ochi-shore',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'beaches',
    title: 'Mahogany Beach Afternoon',
    summary: 'The quieter cove east of town, with a bar and no cruise crowd.',
    description:
      'Mahogany Beach sits a mile east of the pier and takes the overflow nobody sends there. Smaller, shaded at the back, a bar that makes a proper rum punch, and water clear enough to see your feet.',
    durationMinutes: 240,
    inclusions: ['Lounger', 'Shade', 'One drink'],
    pickupInfo: 'Meet at the Mahogany Beach entrance on Main Street',
    fromAmountMinor: 3400,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-south-coast-1'],
    ratingAverage: 4.6,
    ratingCount: 132,
  },
  {
    id: 'exp-ochi-yoga',
    meetingPoint: { name: 'Turtle River Park main gate', lat: 18.4075, lng: -77.105 },
    vendorId: 'vendor-ochi-shore',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'wellness',
    title: 'Sunrise Yoga at Turtle River',
    summary: 'An hour on the deck in Turtle River Park, before the town wakes.',
    description:
      'Turtle River Park at 6:30am, before the traffic. An hour of slow practice on the deck by the water with a teacher who has run this class for eleven years, then juice from the stall at the gate.',
    durationMinutes: 75,
    inclusions: ['Mat', 'Teacher', 'Fresh juice'],
    pickupInfo: 'Meet at the Turtle River Park main gate',
    fromAmountMinor: 2800,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-treasure-1'],
    ratingAverage: 4.9,
    ratingCount: 88,
  },
  {
    id: 'exp-ochi-reggae-beach',
    meetingPoint: { name: 'Reggae Beach, Tower Isle', lat: 18.4192, lng: -76.9975 },
    vendorId: 'vendor-ochi-shore',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'beaches',
    title: 'Reggae Beach at Tower Isle',
    summary: 'Twenty minutes east, where Ocho Rios goes on a Sunday.',
    description:
      'Tower Isle, twenty minutes along the coast road. A long sand beach with a sound system at one end and jerk at the other. Busiest on a Sunday, which is the point of going.',
    durationMinutes: 300,
    inclusions: ['Entry', 'Lounger', 'Transfer from town'],
    pickupInfo: 'Pickup from your Ocho Rios hotel',
    fromAmountMinor: 4600,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-seven-mile-2'],
    ratingAverage: 4.4,
    ratingCount: 176,
  },
  {
    id: 'exp-ochi-jerk',
    meetingPoint: { name: 'Ocho Rios jerk pit, Main Street', lat: 18.4082, lng: -77.0997 },
    vendorId: 'vendor-ochi-table',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'food',
    title: 'Ochi Jerk Pit Lunch',
    summary: 'Pork and chicken off the pimento wood, where the drivers eat.',
    description:
      'A pit lunch at the jerk stop on the main road \u2014 pimento wood, oil drum, no menu board. Pork, chicken, festival and a Red Stripe, eaten standing up at the counter like everyone else.',
    durationMinutes: 90,
    inclusions: ['Jerk plate', 'Festival', 'One drink'],
    pickupInfo: 'Meet at the jerk pit on Main Street',
    fromAmountMinor: 2600,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-music-2'],
    ratingAverage: 4.8,
    ratingCount: 341,
    review: {
      quote: 'Best food of the trip and it cost less than the hotel breakfast.',
      author: 'Marlon B.',
      context: 'Ate here in August',
      date: '2026-08-03',
    },
  },
  {
    id: 'exp-ochi-fish-fry',
    meetingPoint: { name: "Fisherman's Beach landing", lat: 18.4105, lng: -77.1055 },
    vendorId: 'vendor-ochi-table',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'food',
    title: "Fisherman's Beach Fish Fry",
    summary: 'Whatever came in that morning, fried at the water.',
    description:
      "Fisherman's Beach is where the Ocho Rios boats land. You pick the fish off the ice, they fry it with bammy and festival, and you eat it at a plastic table ten feet from where it came ashore.",
    durationMinutes: 120,
    inclusions: ['Fish plate', 'Bammy and festival', 'One drink'],
    pickupInfo: "Meet at Fisherman's Beach, west end of the bay",
    fromAmountMinor: 3200,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-blue-hole-2'],
    ratingAverage: 4.7,
    ratingCount: 198,
  },
  {
    id: 'exp-ochi-night',
    meetingPoint: { name: 'Ocho Rios clock tower', lat: 18.4085, lng: -77.102 },
    vendorId: 'vendor-ochi-table',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'nightlife',
    title: 'Ocho Rios Night Strip',
    summary: 'Three bars, a sound system and the late patty stop.',
    description:
      'A guided walk of the strip after dark \u2014 two bars locals drink in, one with a live band on Fridays, and the patty shop that stays open when everything else shuts. You walk it, so nobody is driving.',
    durationMinutes: 210,
    inclusions: ['Guide', 'First drink at each stop', 'Late patty'],
    pickupInfo: 'Meet outside the clock tower on Main Street',
    fromAmountMinor: 3900,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-music-1'],
    ratingAverage: 4.6,
    ratingCount: 124,
  },
  {
    id: 'exp-ochi-market',
    meetingPoint: { name: 'Ocho Rios Craft Market entrance', lat: 18.4085, lng: -77.1045 },
    vendorId: 'vendor-ochi-table',
    islandId: JM,
    destinationSlug: 'ocho-rios',
    category: 'shopping',
    title: 'Ocho Rios Craft Market Walk',
    summary: 'What is actually made here, and what is imported — told straight.',
    description:
      'The craft market with someone who will tell you which stalls carve their own wood and which buy it in a container. Forty minutes, no obligation to buy, and you leave knowing the difference.',
    durationMinutes: 60,
    inclusions: ['Guide', 'Market entry'],
    pickupInfo: 'Meet at the craft market entrance on Main Street',
    fromAmountMinor: 1800,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-craft-1'],
    ratingAverage: 4.3,
    ratingCount: 67,
  },
  {
    id: 'exp-catamaran',
    vendorId: 'vendor-negril',
    islandId: JM,
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
    media: ['jm-catamaran-1', 'jm-negril-bay'],
    ratingAverage: 4.6,
    ratingCount: 956,
  },
  {
    id: 'exp-beach-pass',
    meetingPoint: { name: 'Bloody Bay beach entrance', lat: 18.3242, lng: -78.3494 },
    vendorId: 'vendor-negril',
    islandId: JM,
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
    media: ['jm-seven-mile-1', 'jm-seven-mile-2'],
    ratingAverage: 4.4,
    ratingCount: 318,
  },
  {
    id: 'exp-west-end',
    meetingPoint: { name: 'Negril Lighthouse, West End', lat: 18.2686, lng: -78.3742 },
    vendorId: 'vendor-negril',
    islandId: JM,
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
    media: ['jm-west-end-1', 'jm-west-end-2'],
    ratingAverage: 4.5,
    ratingCount: 442,
  },
  {
    id: 'exp-coffee',
    vendorId: 'vendor-coffee',
    islandId: JM,
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
    media: ['jm-coffee-1', 'jm-coffee-2', 'jm-coffee-3'],
    ratingAverage: 4.9,
    ratingCount: 731,
  },
  {
    id: 'exp-music',
    meetingPoint: { name: 'Bob Marley Museum, Hope Road', lat: 18.0176, lng: -76.783 },
    vendorId: 'vendor-coffee',
    islandId: JM,
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
    media: ['jm-music-1', 'jm-music-2'],
    ratingAverage: 4.8,
    ratingCount: 508,
  },
  {
    id: 'exp-craft',
    meetingPoint: { name: 'Devon House forecourt', lat: 18.0146, lng: -76.7864 },
    vendorId: 'vendor-coffee',
    islandId: JM,
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
    media: ['jm-craft-1'],
    ratingAverage: 4.3,
    ratingCount: 187,
  },
  {
    id: 'exp-rafting',
    vendorId: 'vendor-portland',
    islandId: JM,
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
    media: ['jm-rafting-1', 'jm-rafting-2'],
    ratingAverage: 4.9,
    ratingCount: 1102,
  },
  {
    id: 'exp-reach',
    meetingPoint: { name: 'Reach Falls ticket office', lat: 18.0453, lng: -76.3336 },
    vendorId: 'vendor-portland',
    islandId: JM,
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
    media: ['jm-reach-1'],
    ratingAverage: 4.7,
    ratingCount: 396,
  },
  {
    id: 'exp-blue-lagoon',
    meetingPoint: { name: 'Blue Lagoon boat landing', lat: 18.1725, lng: -76.4178 },
    vendorId: 'vendor-portland',
    islandId: JM,
    destinationSlug: 'port-antonio',
    category: 'water_sports',
    title: 'Blue Lagoon Swim & Boat',
    summary: 'Swim where the cold spring meets the sea, then along the coast by boat.',
    description:
      'The lagoon changes colour through the day as the cold freshwater spring pushes up under the warm sea. Swim it first thing while it is empty, then take the boat out past Monkey Island and along the Portland coast.',
    durationMinutes: 180,
    inclusions: ['Boat and captain', 'Snorkel gear', 'Fresh fruit'],
    pickupInfo: 'Pickup from Port Antonio hotels',
    fromAmountMinor: 7200,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-blue-lagoon-1'],
    ratingAverage: 4.8,
    ratingCount: 673,
  },
  {
    id: 'exp-transfer',
    vendorId: 'vendor-rides',
    islandId: JM,
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
    media: ['jm-mobay-1'],
    ratingAverage: 4.7,
    ratingCount: 2044,
  },
  {
    id: 'exp-daytrip',
    meetingPoint: { name: 'Hip Strip pickup point', lat: 18.488, lng: -77.92 },
    vendorId: 'vendor-rides',
    islandId: JM,
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
    media: ['jm-negril-bay', 'jm-west-end-2'],
    ratingAverage: 4.6,
    ratingCount: 289,
  },
  {
    id: 'exp-rose-hall',
    meetingPoint: { name: 'Rose Hall Great House gates', lat: 18.5175, lng: -77.8355 },
    vendorId: 'vendor-rides',
    islandId: JM,
    destinationSlug: 'montego-bay',
    category: 'culture',
    title: 'Rose Hall Great House Tour',
    summary: 'The plantation house above Montego Bay, and the history it carries.',
    description:
      'A guided tour of the restored great house on the hill above Montego Bay — the architecture, the sugar economy that paid for it, and the lives of the people who were enslaved on the estate. Told straight, not as a ghost story.',
    durationMinutes: 180,
    inclusions: ['Guide', 'Entry fee', 'Return transport'],
    pickupInfo: 'Hotel pickup in Montego Bay',
    fromAmountMinor: 6400,
    status: 'approved',
    cancellationHours: 24,
    media: ['jm-rose-hall-1'],
    ratingAverage: 4.5,
    ratingCount: 921,
  },
  {
    id: 'exp-yoga',
    vendorId: 'vendor-wellness',
    islandId: JM,
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
    media: ['jm-treasure-1', 'jm-south-coast-1'],
    ratingAverage: 4.9,
    ratingCount: 214,
  },
  {
    id: 'exp-seafood',
    meetingPoint: { name: 'Little Ochie, Alligator Pond', lat: 17.877, lng: -77.547 },
    vendorId: 'vendor-wellness',
    islandId: JM,
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
    media: ['jm-black-river-1'],
    ratingAverage: 4.7,
    ratingCount: 486,
  },

  // ==================================================== Cayman Islands ====
  {
    id: 'exp-ky-stingray',
    meetingPoint: { name: 'Stingray City sandbar boat', lat: 19.3868, lng: -81.3195 },
    vendorId: 'vendor-ky-stingray',
    islandId: KY,
    destinationSlug: 'west-bay',
    category: 'water_sports',
    title: 'Stingray City Sandbar',
    summary: 'Stand waist-deep on the sandbar with wild southern stingrays.',
    description:
      'Twenty minutes out into the North Sound to a waist-deep sandbar where southern stingrays have gathered since fishermen cleaned their catch here. The crew shows you how to hold and feed them, and how to shuffle rather than step. Then two reef stops on the way back.',
    durationMinutes: 210,
    inclusions: ['Boat and crew', 'Snorkel gear', 'Two reef stops', 'Drinks and fruit'],
    pickupInfo: 'Pickup from Seven Mile Beach and George Town hotels',
    fromAmountMinor: 9500,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-stingray-1', 'ky-stingray-2'],
    ratingAverage: 4.9,
    ratingCount: 3187,
    subOptions: ['Sandbar Stop', 'Coral Garden', 'Barrier Reef', 'Boat Cruise'],
    minAge: 4,
    review: {
      quote:
        'Standing in waist-deep water with a stingray gliding past your legs is not something you forget.',
      author: 'Marcus T.',
      context: 'Cruise passenger',
      date: 'June 2026',
    },
  },
  {
    id: 'exp-ky-barrier-reef',
    meetingPoint: { name: 'Cemetery Beach reef entry', lat: 19.356, lng: -81.402 },
    vendorId: 'vendor-ky-stingray',
    islandId: KY,
    destinationSlug: 'west-bay',
    category: 'adventure',
    title: 'Barrier Reef & Coral Garden Snorkel',
    summary: 'Two protected reef sites, calm water, gear and guide included.',
    description:
      'The barrier reef inside the North Sound keeps the water flat whatever the wind is doing, which makes it the right first snorkel for anyone nervous. A guide swims with the group at both sites and points out what you are looking at.',
    durationMinutes: 180,
    inclusions: ['Boat and crew', 'Snorkel gear', 'In-water guide', 'Drinks'],
    pickupInfo: 'Pickup from Seven Mile Beach and George Town hotels',
    fromAmountMinor: 7500,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-reef-1', 'ky-stingray-2'],
    ratingAverage: 4.7,
    ratingCount: 742,
  },
  {
    id: 'exp-ky-seven-mile',
    meetingPoint: { name: 'Seven Mile public beach', lat: 19.335, lng: -81.383 },
    vendorId: 'vendor-ky-camana',
    islandId: KY,
    destinationSlug: 'seven-mile-beach-ky',
    category: 'beaches',
    title: 'Seven Mile Beach Club Day',
    summary: 'Loungers, umbrella and table service on the coral sand.',
    description:
      'A reserved pair of loungers with an umbrella on the calm middle stretch of Seven Mile Beach, table service from the beach bar, and towels, showers and changing rooms for the day.',
    durationMinutes: 480,
    inclusions: ['Two loungers', 'Umbrella', 'Towels', 'Showers & changing rooms'],
    pickupInfo: 'Meet at the beach club',
    fromAmountMinor: 4200,
    status: 'approved',
    cancellationHours: 12,
    media: ['ky-seven-mile-1', 'ky-hero'],
    ratingAverage: 4.6,
    ratingCount: 528,
  },
  {
    id: 'exp-ky-sail',
    vendorId: 'vendor-ky-camana',
    islandId: KY,
    destinationSlug: 'seven-mile-beach-ky',
    category: 'water_sports',
    title: 'Sunset Sail off Seven Mile Beach',
    summary: 'Two and a half hours under sail as the sun goes down.',
    description:
      'Out of the harbour and north along Seven Mile Beach under sail, with the bar open and the island turning gold behind you. Small boat, no more than sixteen guests.',
    durationMinutes: 150,
    inclusions: ['Crewed sailing catamaran', 'Open bar', 'Canapés'],
    pickupInfo: 'Board at the Camana Bay dock',
    fromAmountMinor: 8600,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-sail-1', 'ky-sunset-1'],
    ratingAverage: 4.8,
    ratingCount: 634,
  },
  {
    id: 'exp-ky-camana',
    vendorId: 'vendor-ky-camana',
    islandId: KY,
    // Camana Bay is 4.3 km up the coast from George Town. It was filed under George Town to give
    // Cayman's default destination something to show; George Town now has its own operator, so
    // this listing can sit where it actually is.
    destinationSlug: 'seven-mile-beach-ky',
    category: 'food',
    title: 'Camana Bay Food Walk',
    summary: 'Six tastings around the waterfront, with the people who cook them.',
    description:
      'A slow walk around the Camana Bay waterfront with six stops — conch, jerk, a Caymanian beef patty, rum cake and two you will not expect. You meet whoever is cooking at each one.',
    durationMinutes: 180,
    inclusions: ['Six tastings', 'Guide', 'One drink'],
    pickupInfo: 'Meet at the Camana Bay observation tower',
    fromAmountMinor: 8900,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-camana-1'],
    ratingAverage: 4.7,
    ratingCount: 291,
  },
  {
    id: 'exp-ky-eden-rock',
    meetingPoint: { name: 'Eden Rock dive shop', lat: 19.2903, lng: -81.3878 },
    vendorId: 'vendor-ky-georgetown',
    islandId: KY,
    destinationSlug: 'george-town',
    category: 'water_sports',
    title: "Eden Rock & Devil's Grotto Snorkel",
    summary: 'Two swim-through reefs a few minutes from the cruise pier.',
    description:
      'Eden Rock and Devil\u2019s Grotto sit in shallow water straight off the George Town shore \u2014 caverns and swim-throughs you reach from the beach, not a boat. Silversides fill the grotto in summer. Guided in small groups, with gear and a safety briefing.',
    durationMinutes: 120,
    inclusions: ['Mask, snorkel and fins', 'Guide', 'Flotation vest'],
    pickupInfo: 'Meet at the Eden Rock dive shop on South Church Street',
    fromAmountMinor: 6500,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-seven-mile-1'],
    ratingAverage: 4.8,
    ratingCount: 412,
    review: {
      quote: 'Off the beach and into a cavern full of silversides in about ten minutes. We walked there from the pier.',
      author: 'Marcia D.',
      context: 'Snorkelled in July',
      date: '2026-07-19',
    },
  },
  {
    id: 'exp-ky-heritage-walk',
    meetingPoint: { name: 'Cayman National Museum steps', lat: 19.2944, lng: -81.3847 },
    vendorId: 'vendor-ky-georgetown',
    islandId: KY,
    destinationSlug: 'george-town',
    category: 'culture',
    title: 'Old George Town on Foot',
    summary: 'The harbour, the wrecks and the families who stayed, in two hours.',
    description:
      'From the Cayman National Museum along the waterfront to Fort George and back through the old lanes \u2014 the wrecking years, the turtle fleet, and why a sandbar island ended up running the world\u2019s banks. A walk, at walking pace, in the shade where there is any.',
    durationMinutes: 120,
    inclusions: ['Guide', 'Museum entry', 'Cold water'],
    pickupInfo: 'Meet on the museum steps on Harbour Drive',
    fromAmountMinor: 4200,
    status: 'approved',
    cancellationHours: 12,
    media: ['ky-camana-1'],
    ratingAverage: 4.7,
    ratingCount: 168,
  },
  {
    id: 'exp-ky-smith-cove',
    meetingPoint: { name: 'Smith Barcadere car park', lat: 19.2828, lng: -81.3897 },
    vendorId: 'vendor-ky-georgetown',
    islandId: KY,
    destinationSlug: 'george-town',
    category: 'beaches',
    title: 'Smith Cove Swim & Sunset',
    summary: "The locals' cove south of town, with the sun going down behind it.",
    description:
      'Smith Barcadere is a small ironshore cove ten minutes south of George Town where Caymanians actually swim. Late afternoon, with shade, a cooler and somebody who knows which rock to jump off. Stay for the sunset.',
    durationMinutes: 150,
    inclusions: ['Beach set-up', 'Cooler with drinks', 'Host'],
    pickupInfo: 'Meet at the Smith Barcadere car park',
    fromAmountMinor: 3800,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-seven-mile-1'],
    ratingAverage: 4.9,
    ratingCount: 97,
  },
  {
    id: 'exp-ky-turtle',
    vendorId: 'vendor-ky-turtle',
    islandId: KY,
    destinationSlug: 'west-bay',
    category: 'family',
    title: 'Cayman Turtle Centre Family Day',
    summary: 'Hold a turtle, snorkel the lagoon, and the predator tank for the brave.',
    description:
      'The conservation centre in West Bay: the breeding ponds, a lagoon you can snorkel with turtles and fish, a predator tank with sharks behind glass, and a bird aviary. Easy to fill a whole day with small children.',
    durationMinutes: 300,
    inclusions: ['Entry', 'Snorkel gear', 'Guide', 'Locker'],
    pickupInfo: 'Pickup from West Bay and Seven Mile Beach hotels',
    fromAmountMinor: 6900,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-turtle-1', 'ky-turtle-2'],
    ratingAverage: 4.5,
    ratingCount: 1409,
  },
  {
    id: 'exp-ky-hell',
    meetingPoint: { name: 'Hell post office, West Bay', lat: 19.3739, lng: -81.4111 },
    vendorId: 'vendor-ky-turtle',
    islandId: KY,
    destinationSlug: 'west-bay',
    category: 'culture',
    title: 'Hell & West Bay Heritage Run',
    summary: 'The black ironshore at Hell, then the old West Bay village.',
    description:
      'Hell is a field of black limestone spikes, a post office that will frank your card from Hell, and a gift shop that has leaned all the way into it. Then the older part of West Bay: the ironshore coast, the sea wall, and the houses that predate the tourism.',
    durationMinutes: 150,
    inclusions: ['Guide', 'Transport', 'Postcard and stamp'],
    pickupInfo: 'Pickup from West Bay and Seven Mile Beach hotels',
    fromAmountMinor: 4800,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-hell-1'],
    ratingAverage: 4.2,
    ratingCount: 806,
  },
  {
    id: 'exp-ky-rum-point',
    vendorId: 'vendor-ky-rumpoint',
    islandId: KY,
    destinationSlug: 'rum-point',
    category: 'day_trips',
    title: 'Rum Point Beach Day by Boat',
    summary: 'Cross the North Sound to the quiet side, hammocks and mudslides included.',
    description:
      'A boat straight across the sound rather than the hour by road. Rum Point is shallow, calm and shaded by Casuarina pines, with hammocks strung between them and a bar that invented the mudslide. Stay as long as you like; the boat runs back on the hour.',
    durationMinutes: 420,
    inclusions: ['Return boat', 'Loungers', 'Welcome drink'],
    pickupInfo: 'Board at the Camana Bay dock',
    fromAmountMinor: 9200,
    status: 'approved',
    cancellationHours: 24,
    media: ['ky-rum-point-1', 'ky-kaibo-1'],
    ratingAverage: 4.8,
    ratingCount: 1173,
  },
  {
    id: 'exp-ky-bio-bay',
    // No meetingPoint on purpose: the bio bay boat leaves from the Rum Point jetty, the same
    // place as its sibling tour, so the operator's own location is the truthful answer. This is
    // the pair that keeps "same site — no transfer" a reachable state in the planner.
    vendorId: 'vendor-ky-rumpoint',
    islandId: KY,
    destinationSlug: 'rum-point',
    category: 'nightlife',
    title: 'Bioluminescent Bay Night Kayak',
    summary: 'Paddle a dark bay where the water lights up around the blade.',
    description:
      'On a moonless night the dinoflagellates in the bay light up blue wherever the water is disturbed — around your paddle, off your hand, off a fish going past underneath. Clear-bottom kayaks, a guide per group, and no lights on the water.',
    durationMinutes: 120,
    inclusions: ['Clear-bottom kayak', 'Guide', 'Life vest'],
    pickupInfo: 'Meet at the Rum Point jetty',
    fromAmountMinor: 7800,
    status: 'approved',
    cancellationHours: 48,
    media: ['ky-sunset-1'],
    ratingAverage: 4.9,
    ratingCount: 458,
  },

  // ========================================================= Barbados ====
  {
    id: 'exp-bb-harrisons',
    vendorId: 'vendor-bb-cave',
    islandId: BB,
    destinationSlug: 'central-bb',
    category: 'adventure',
    title: "Harrison's Cave Tram Tour",
    summary: 'Electric tram a mile into a live limestone cave.',
    description:
      'The tram takes you a mile underground through chambers still being formed — stalactites meeting stalagmites, a forty-foot waterfall into a deep green pool, and streams running through it all. Cool, easy underfoot, and it works whatever the weather is doing outside.',
    durationMinutes: 150,
    inclusions: ['Tram tour', 'Guide', 'Helmet', 'Entry fee'],
    pickupInfo: 'Pickup from west and south coast hotels',
    fromAmountMinor: 7600,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-harrisons-1', 'bb-harrisons-2'],
    ratingAverage: 4.7,
    ratingCount: 1642,
  },
  {
    id: 'exp-bb-east-coast',
    meetingPoint: { name: 'Bathsheba Soup Bowl', lat: 13.2136, lng: -59.5253 },
    vendorId: 'vendor-bb-cave',
    islandId: BB,
    destinationSlug: 'east-coast-bb',
    category: 'day_trips',
    title: 'Bathsheba & East Coast Drive',
    summary: 'The Atlantic side — Soup Bowl, the rock, and lunch above the surf.',
    description:
      'The east coast is a different island: Atlantic swell, no resorts, and the mushroom-shaped rocks that end up on every postcard. We stop at the Soup Bowl where the surfers are, walk the beach at Bathsheba, and have lunch on a terrace above it.',
    durationMinutes: 360,
    inclusions: ['Transport', 'Guide', 'Lunch'],
    pickupInfo: 'Pickup from west and south coast hotels',
    fromAmountMinor: 9400,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-bathsheba-1', 'bb-bathsheba-2'],
    ratingAverage: 4.6,
    ratingCount: 384,
  },
  {
    id: 'exp-bb-turtles',
    vendorId: 'vendor-bb-carlisle',
    islandId: BB,
    destinationSlug: 'bridgetown',
    category: 'water_sports',
    title: 'Swim with Turtles & Shipwrecks',
    summary: 'Carlisle Bay: hawksbill turtles at one stop, two wrecks at the next.',
    description:
      'Carlisle Bay is a marine park with six wrecks sunk inside it and a resident population of hawksbill turtles. Two stops: turtles first while the water is clearest, then the wrecks, which sit shallow enough to snorkel without diving.',
    durationMinutes: 180,
    inclusions: ['Boat and crew', 'Snorkel gear', 'In-water guide', 'Drinks'],
    pickupInfo: 'Board at the Carlisle Bay boardwalk',
    fromAmountMinor: 8200,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-turtle-1', 'bb-carlisle-1', 'bb-carlisle-2'],
    ratingAverage: 4.9,
    ratingCount: 1878,
  },
  {
    id: 'exp-bb-catamaran',
    meetingPoint: { name: 'Holetown jetty', lat: 13.1875, lng: -59.6389 },
    vendorId: 'vendor-bb-carlisle',
    islandId: BB,
    destinationSlug: 'west-coast-bb',
    category: 'day_trips',
    title: 'West Coast Catamaran Cruise',
    summary: 'Five hours down the platinum coast with lunch and two swim stops.',
    description:
      'North along the calm Caribbean side past the great houses and the platinum-coast hotels, with two swim stops and a proper Bajan lunch served on board. The west coast has no swell, so this is the comfortable option.',
    durationMinutes: 300,
    inclusions: ['Catamaran and crew', 'Lunch', 'Open bar', 'Snorkel gear'],
    pickupInfo: 'Pickup from west and south coast hotels',
    fromAmountMinor: 11800,
    status: 'approved',
    cancellationHours: 48,
    media: ['bb-west-coast-1', 'bb-hero'],
    ratingAverage: 4.8,
    ratingCount: 1265,
  },
  {
    id: 'exp-bb-oistins',
    vendorId: 'vendor-bb-oistins',
    islandId: BB,
    destinationSlug: 'south-coast-bb',
    category: 'food',
    title: 'Oistins Friday Night Fish Fry',
    summary: 'Grilled marlin, macaroni pie and a street party that runs late.',
    description:
      'Every Friday the fish market at Oistins turns into the biggest thing on the south coast: grills the length of the street, marlin and flying fish and mahi straight off the boats, macaroni pie, and a sound system at either end. Your guide gets you to the right stall and the right table.',
    durationMinutes: 240,
    inclusions: ['Guide', 'Dinner', 'One drink', 'Return transport'],
    pickupInfo: 'Pickup from south and west coast hotels',
    fromAmountMinor: 6600,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-oistins-port-1', 'bb-south-coast-1'],
    ratingAverage: 4.8,
    ratingCount: 967,
  },
  {
    id: 'exp-bb-south-beach',
    meetingPoint: { name: 'Accra Beach, Rockley', lat: 13.0729, lng: -59.5786 },
    vendorId: 'vendor-bb-oistins',
    islandId: BB,
    destinationSlug: 'south-coast-bb',
    category: 'beaches',
    title: 'Miami Beach Day Pass',
    summary: 'Loungers and shade on the calm end of the south coast.',
    description:
      'Miami Beach at Enterprise is split by a headland: flat and shallow on one side for children, breezy and body-surfable on the other. A reserved pair of loungers under a palm on the calm side, with the food truck on the road behind.',
    durationMinutes: 420,
    inclusions: ['Two loungers', 'Umbrella', 'Towels'],
    pickupInfo: 'Meet at the beach car park',
    fromAmountMinor: 3400,
    status: 'approved',
    cancellationHours: 12,
    media: ['bb-oistins-1'],
    ratingAverage: 4.4,
    ratingCount: 276,
  },
  {
    id: 'exp-bb-animal-flower',
    meetingPoint: { name: 'Animal Flower Cave, North Point', lat: 13.3325, lng: -59.6122 },
    vendorId: 'vendor-bb-heritage',
    islandId: BB,
    destinationSlug: 'north-bb',
    category: 'adventure',
    title: 'Animal Flower Cave & North Cliffs',
    summary: 'A sea cave at the northern tip, with rock pools you can swim in.',
    description:
      'The cave opens straight out of the cliff at the northernmost point of the island. Inside are rock pools you can get into and sea anemones — the "animal flowers" — in the crevices, with the Atlantic coming in through the mouth of it.',
    durationMinutes: 300,
    inclusions: ['Guide', 'Entry fee', 'Transport', 'Lunch at the cliff restaurant'],
    pickupInfo: 'Pickup from west and south coast hotels',
    fromAmountMinor: 8800,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-animal-flower-1', 'bb-animal-flower-2'],
    ratingAverage: 4.7,
    ratingCount: 715,
  },
  {
    id: 'exp-bb-rum',
    meetingPoint: { name: 'St. Nicholas Abbey, St. Peter', lat: 13.2764, lng: -59.5744 },
    vendorId: 'vendor-bb-heritage',
    islandId: BB,
    destinationSlug: 'north-bb',
    category: 'food',
    title: 'Plantation House & Rum Distillery',
    summary: 'A 1658 great house, a working copper still, and a tasting.',
    description:
      'Barbados invented rum, and this is where the claim is easiest to see: a Jacobean great house from 1658, cane still cut on the estate, a steam mill, and a copper pot still running. The tour ends with a tasting flight and an honest account of who worked the estate and under what conditions.',
    durationMinutes: 240,
    inclusions: ['Guide', 'House and distillery tour', 'Tasting flight', 'Transport'],
    pickupInfo: 'Pickup from west and south coast hotels',
    fromAmountMinor: 9600,
    status: 'approved',
    cancellationHours: 48,
    media: ['bb-rum-1'],
    ratingAverage: 4.8,
    ratingCount: 823,
  },
  {
    id: 'exp-bb-bridgetown',
    meetingPoint: { name: 'National Heroes Square', lat: 13.0969, lng: -59.6145 },
    vendorId: 'vendor-bb-heritage',
    islandId: BB,
    destinationSlug: 'bridgetown',
    category: 'culture',
    title: 'Bridgetown & Garrison Walking Tour',
    summary: 'The UNESCO-listed capital on foot, Careenage to Garrison.',
    description:
      'Two and a half hours through the UNESCO-listed centre: the Careenage where the schooners tied up, the Parliament buildings, the synagogue and its 1654 cemetery, and out to the Garrison with its ring of colonial military architecture.',
    durationMinutes: 150,
    inclusions: ['Guide', 'All entry fees'],
    pickupInfo: 'Meet at the Careenage bridge',
    fromAmountMinor: 4600,
    status: 'approved',
    cancellationHours: 24,
    media: ['bb-bridgetown-1'],
    ratingAverage: 4.5,
    ratingCount: 402,
  },

  // ================================================ Negative fixtures ====
  // A DRAFT listing under an approved vendor. Must never be visible (T-03).
  {
    id: 'exp-draft',
    vendorId: 'vendor-wellness',
    islandId: JM,
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
    media: [],
    ratingAverage: 0,
    ratingCount: 0,
  },
  // An APPROVED listing under an UNAPPROVED vendor. Must never be visible (V-02).
  {
    id: 'exp-unverified',
    vendorId: 'vendor-unverified',
    islandId: JM,
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
    media: [],
    ratingAverage: 0,
    ratingCount: 0,
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

/**
 * The geofenced offer.
 *
 * **One qualifying listing in each island's default destination**, which is a requirement and not a
 * coincidence. The offer fires when the guest is near the vendor that issues it, so a promotion
 * with nothing in the town the app opens in is a feature nobody will ever see — which is exactly
 * what Jamaica was: the only qualifying listing was the Negril jetty, 130 km from Ocho Rios, where
 * every guest starts. The app used to paper over that by announcing it anyway.
 *
 * `exp-dunns-falls` carries it in Ocho Rios. A complimentary rum punch at the beach bar below the
 * falls is the kind of thing the operator would actually run, and Dunn's River is the listing an
 * Ocho Rios guest is most likely to be standing near.
 *
 * `vendorId` names the original issuing vendor only. It has been inconsistent with
 * `appliesToExperienceIds` since Cayman and Barbados were added — three different vendors run this
 * promotion — and nothing reads it. Left in place because it mirrors the column in the SQL seed;
 * the day promotions become per-vendor records, this is the field that splits.
 */
export const DEMO_PROMOTION = {
  id: 'promo-rum-punch',
  vendorId: 'vendor-negril',
  title: 'Free rum punch with a qualifying booking',
  terms:
    'One drink per adult guest on a confirmed booking. Must be 18 or older. Not redeemable for cash. Valid only at the issuing vendor during the offer window. Subject to availability.',
  appliesToExperienceIds: [
    'exp-dunns-falls', // Ocho Rios — Jamaica's default destination
    'exp-catamaran', // Negril
    'exp-ky-eden-rock', // George Town waterfront — Cayman's default, and now local to it
    // Was exp-bb-catamaran, which reads as Carlisle Bay only because it shared the vendor's
    // coordinates. It leaves from the Holetown jetty, 12 km up the west coast, so once listings
    // carried their own meeting points it stopped being anywhere near the guest. The turtle swim
    // genuinely starts on the Carlisle Bay boardwalk.
    'exp-bb-turtles', // Carlisle Bay boardwalk — Barbados' default
  ],
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
