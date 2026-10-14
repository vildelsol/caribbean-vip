/**
 * Worst-case data, for breaking this UI on purpose.
 *
 * Dev-only, and reached only by putting `?data=worst` on the URL — see `dataMode()` below.
 * Nothing here is reachable in a production build: `dataMode()` returns `'demo'` unless
 * `import.meta.env.DEV` is true, so the bundler drops the rest as dead code.
 *
 * ## The rule every value here follows
 *
 * Each one is either something a real operator could plausibly type, or the actual limit the
 * backend accepts. There is no `"aaaaaaaa"` and no 5,000-character name, because the first thing
 * anyone says to a contrived break is "that never happens" — and they are right, and then they
 * stop listening to the real ones.
 *
 * The limits worth knowing, because they are the reason some of these are as long as they are:
 *
 *  - `experiences.title`, `.summary`, `.description`, `.pickup_info` are **`text` with no length
 *    constraint** (`supabase/migrations/20260802000004_inventory.sql:14-20`). There is no Zod
 *    schema bounding them either. Nothing in the stack stops a vendor pasting a paragraph into
 *    the title field, so the only honest worst case is "as long as a real OTA listing title gets",
 *    and those run past 120 characters routinely.
 *  - `summary` and `description` are **nullable in Postgres** but typed `string` (not `string | undefined`)
 *    in `DemoExperience` (`packages/demo/src/dataset.ts:89-90`). The empty-string rows below stand
 *    in for the null the database will eventually hand this app.
 *  - The only `maxLength` in the whole tourist app is `40`, on the guest-name field
 *    (`screens/Checkout.tsx:457`).
 *
 * Failures are spread across rows rather than stacked into row one, because that is how real data
 * arrives: one listing has the long title, the next has no reviews, the third is in Spanish.
 */

import type { DemoExperience, DemoVendor } from '@cvip/demo';

export type DataMode = 'demo' | 'worst' | 'empty' | 'one' | 'huge';

const MODES: DataMode[] = ['demo', 'worst', 'empty', 'one', 'huge'];

/**
 * The mode, from `?data=` on the URL. There is deliberately no control in the interface.
 *
 * A switch rendered into the app is one `NODE_ENV` mistake away from a debug pill under the hero
 * on somebody else's screen, and this app gets shown to people. The URL gives the same coverage
 * with nothing on the page to go wrong: append `?data=worst` and reload. It also means a
 * screenshot of a break carries its own reproduction in the address bar.
 *
 *   ?data=worst   every failure in this file, spread across the first nine listings
 *   ?data=empty   zero listings
 *   ?data=one     a single listing
 *   ?data=huge    1,000 listings
 */
export function dataMode(): DataMode {
  if (!import.meta.env.DEV) return 'demo';
  // The unit tests import `visibleExperiences()` in a node environment, where there is no
  // `window` and `import.meta.env.DEV` is true. Without this guard every test that reaches the
  // catalogue throws on `window.location` — a fixture is not allowed to decide whether the suite
  // runs.
  if (typeof window === 'undefined') return 'demo';
  const raw = new URLSearchParams(window.location.search).get('data');
  return MODES.includes(raw as DataMode) ? (raw as DataMode) : 'demo';
}

// ---------------------------------------------------------------------------
// The values
// ---------------------------------------------------------------------------

/**
 * 137 characters. Shorter than plenty of live Viator and GetYourGuide titles, which stack every
 * keyword the operator wants to rank for into the name of the thing.
 */
const LONG_TITLE =
  'Seven Mile Beach Sunset Catamaran Cruise with Open Bar, Snorkelling at Stingray City, Caribbean Buffet Dinner and Return Hotel Transfers';

/** A one-word listing name. Operators do this, and it is the other end of the same problem. */
const SHORT_TITLE = 'Zip';

/**
 * Spanish and French are both first languages in this region — Puerto Rico, Guadeloupe,
 * Martinique, Haiti. Accented capitals and the tails on ç and é are what get clipped by a tight
 * line-height over `overflow: hidden`.
 */
const SPANISH_TITLE = 'Excursión al Cañón de Río Camuy — Visita Guiada con Almuerzo Criollo';
const FRENCH_TITLE = 'Randonnée guidée à la Soufrière — départ à l’aube';

/** Operators put emoji in their trading names. This is from a real category of business name. */
const EMOJI_VENDOR = 'Island Vibes Tours 🌴🇯🇲';

/**
 * An email with a long domain and no spaces anywhere in it. This is the single most reliable way
 * to break a flex row, because the string offers the browser no place to wrap it.
 */
const UNBREAKABLE =
  'Reservations: reservations@negril-beachfront-watersports-adventures.com.jm';

/** A real transfer description, written as a sentence because the field invites one. */
const LONG_INCLUSION =
  'Round-trip air-conditioned hotel transfers from any property between Montego Bay and Ocho Rios';

const MANY_INCLUSIONS = [
  'Licensed bilingual guide',
  LONG_INCLUSION,
  'Park entry fee',
  'Locker hire',
  'Water shoes',
  'Snorkel mask, fins and vest',
  'Caribbean buffet lunch',
  'Unlimited rum punch, beer and soft drinks',
  'Beach towel',
  'Professional photographs (digital download)',
  'All taxes and port fees',
  'Gratuities for the crew',
  'Complimentary bottled water',
  'Hotel pickup between 07:00 and 08:30',
];

/**
 * US$12,999. A private yacht charter for a day out of Gustavia is more than this. It is here to
 * make every money field render four digits plus a separator at once — card, detail, checkout
 * summary, the Pay button's own label, and the trip total.
 */
const YACHT_PRICE = 1_299_900;

/** The other end: a listing priced at nothing, which the schema allows (`>= 0`). */
const FREE_PRICE = 0;

// ---------------------------------------------------------------------------
// The transform
// ---------------------------------------------------------------------------

/**
 * Rewrite the first nine listings, leave the rest alone.
 *
 * Leaving the tail untouched matters: a screen where *everything* is broken is easy to dismiss as
 * a broken fixture. A rail where card three is wrong and cards one, two and four are fine is the
 * thing that actually ships.
 */
export function worstCaseExperiences(base: DemoExperience[]): DemoExperience[] {
  const out = base.map((e) => ({ ...e }));

  // 1 — the long title, on the most expensive listing in the app.
  if (out[0]) {
    out[0].title = LONG_TITLE;
    out[0].summary =
      'Six hours aboard a 62-foot catamaran with an open bar, two swim stops and a buffet dinner served as the sun goes down over the western end of the island.';
    out[0].fromAmountMinor = YACHT_PRICE;
    out[0].ratingCount = 1;
    out[0].ratingAverage = 5;
    out[0].inclusions = MANY_INCLUSIONS;
    out[0].durationMinutes = 1440;
    out[0].subOptions = [
      'Sunset Sail',
      'Open Bar',
      'Stingray City Snorkel',
      'Caribbean Buffet Dinner',
      'Hotel Transfers',
      'Professional Photography',
    ];
  }

  // 2 — the one-word title, no summary, no reviews yet, free.
  //      `null`, not `''`: that is what Postgres actually returns for these columns, and the two
  //      are not the same thing to a type checker even though they look the same on screen.
  if (out[1]) {
    out[1].title = SHORT_TITLE;
    out[1].summary = null;
    out[1].description = null;
    out[1].fromAmountMinor = FREE_PRICE;
    out[1].ratingCount = 0;
    out[1].ratingAverage = 0;
    out[1].inclusions = [];
    out[1].subOptions = undefined;
    out[1].minAge = undefined;
    out[1].review = undefined;
    out[1].durationMinutes = 15;
  }

  // 3 — the unbreakable string, in a field that renders as prose.
  if (out[2]) {
    out[2].pickupInfo = UNBREAKABLE;
    out[2].summary = `Meet at the dock 15 minutes before departure. ${UNBREAKABLE}`;
    out[2].ratingCount = 1;
    out[2].durationMinutes = 90; // rounds to "2 hr" on Trips — see the report.
  }

  // 4 — Spanish, with the accents and the em dash.
  if (out[3]) {
    out[3].title = SPANISH_TITLE;
    out[3].summary =
      'Descenso guiado por el tercer sistema de cuevas más grande del mundo, con almuerzo criollo incluido y transporte desde San Juan.';
  }

  // 5 — French, with the apostrophe that is not an ASCII quote.
  if (out[4]) {
    out[4].title = FRENCH_TITLE;
    out[4].review = {
      quote:
        'Nous sommes partis à quatre heures du matin et nous avons vu le soleil se lever au-dessus de la mer des Caraïbes depuis le sommet — inoubliable, même sous la pluie.',
      author: 'Jo',
      context: 'En famille',
      date: 'Mars 2026',
    };
  }

  // 6 — every nullable and optional field missing at once.
  if (out[5]) {
    out[5].subOptions = undefined;
    out[5].minAge = undefined;
    out[5].review = undefined;
    out[5].summary = null;
    out[5].description = null;
    out[5].pickupInfo = null;
    out[5].inclusions = [];
    out[5].media = [];
  }

  // 7 — a media key that 404s.
  if (out[6]) {
    out[6].media = ['this-file-does-not-exist', 'nor-does-this-one'];
  }

  // 8 — the rating at its ceiling with a six-figure count.
  if (out[7]) {
    out[7].ratingAverage = 5;
    out[7].ratingCount = 284_917;
    out[7].title = 'Dunn’s River Falls & Blue Hole Combo — Small Group, Skip-the-Line Entry';
  }

  // 9 — a five-minute listing priced like a long one.
  if (out[8]) {
    out[8].durationMinutes = 5;
    out[8].minAge = 0;
  }

  return out;
}

/** The vendor side: emoji, and a trading name with nowhere to wrap. */
export function worstCaseVendor(v: DemoVendor): DemoVendor {
  return {
    ...v,
    tradingName: EMOJI_VENDOR,
    description: UNBREAKABLE,
    location: { ...v.location, name: 'Negril Beachfront Watersports & Adventure Company Limited' },
  };
}

/**
 * 1,000 listings, for the unpaginated rails and the search results.
 *
 * Real inventory for one island will pass this inside a year, and nothing in the app paginates,
 * so this is a performance question as much as a layout one.
 */
export function hugeExperiences(base: DemoExperience[]): DemoExperience[] {
  const out: DemoExperience[] = [];
  for (let i = 0; i < 1000; i += 1) {
    const src = base[i % base.length];
    if (!src) break;
    out.push({ ...src, id: `${src.id}--dup-${i}`, title: `${src.title} ${i + 1}` });
  }
  return out;
}
