import type { ExperienceCategory } from '@cvip/types';
import type { CatalogueItem } from './catalogue';

/**
 * Irie AI's answer engine — for now, a deterministic intent matcher over the real catalogue.
 *
 * **There is no model behind this yet.** M7 is where a grounded LLM arrives. What ships now is the
 * mockup's conversation UI driven by rules, and that is stated on the screen rather than implied
 * away — see the disclosure in `irie.tsx`. Writing it this way is not a stopgap dressed as a
 * feature; it is the shape the requirement demands either way:
 *
 *   - "Recommends only approved platform inventory" — every card comes from the same RLS-governed
 *     `searchCatalogue` call the rest of the app uses. It is incapable of naming a listing that
 *     does not exist, because it has no vocabulary of its own.
 *   - "Never invents vendors, prices, hours or availability" — no number in an answer is written
 *     here. Prices come off `CatalogueItem`, and the card component formats them.
 *   - "Falls back to normal search when AI is unavailable" — that fallback is this file. When the
 *     model lands it goes in front, and this stays behind it as the degraded path.
 *
 * The honest framing matters: a demo that pretends to be a language model teaches the room the
 * wrong thing about what has been built.
 */

export interface Intent {
  /** The chip label, and what the user's message reads as when they tap it. */
  label: string;
  /** Assistant's lead-in. Never contains a price, a vendor or a time. */
  reply: string;
  categories: ExperienceCategory[];
  /** Optional ceiling in minor units. */
  maxPriceMinor?: number;
  /** Optional short "Irie Tip" — general advice, never a claim about a specific listing. */
  tip?: string;
}

export const INTENTS: Intent[] = [
  {
    label: 'Under $50',
    reply: 'Here are the best experiences I can find under $50 per person.',
    categories: [],
    maxPriceMinor: 5000,
    tip: 'Booking a morning slot usually means smaller groups and cooler weather.',
  },
  {
    label: 'Things to Do Now',
    reply: 'These are available today and close to where you are.',
    categories: [],
    tip: 'Same-day places go quickly. Check availability before you set out.',
  },
  {
    label: 'Family Activities',
    reply: 'These work well with children along.',
    categories: ['family', 'beaches', 'water_sports'],
    tip: 'Check the minimum age on the listing — a few water activities have one.',
  },
  {
    label: 'Hidden Gems',
    reply: 'Quieter picks, away from the cruise-port crowds.',
    categories: ['waterfalls', 'day_trips', 'culture'],
    tip: 'The further from the port, the earlier you want to leave.',
  },
  {
    label: 'Breakfast Near Me',
    reply: 'Food and drink experiences on the island.',
    categories: ['food'],
  },
  {
    label: 'Rainy Day',
    reply: 'These are mostly indoors or run whatever the weather does.',
    categories: ['culture', 'food', 'nightlife'],
    tip: 'Rain on this coast usually passes within the hour.',
  },
];

/**
 * Picks an intent from free text.
 *
 * Deliberately crude — it matches on words, and when nothing matches it says so rather than
 * guessing. "I did not understand that" is a better answer than a confident irrelevant one, and it
 * is the behaviour the fallback path needs to have anyway.
 */
export function matchIntent(text: string): Intent | null {
  const q = text.toLowerCase();
  const direct = INTENTS.find((i) => q.includes(i.label.toLowerCase()));
  if (direct) return direct;

  if (/\bunder\b|\bcheap|\bbudget|\$\d/.test(q)) return INTENTS[0]!;
  if (/\btoday\b|\bnow\b|\btonight\b/.test(q)) return INTENTS[1]!;
  if (/\bkid|\bchild|\bfamil/.test(q)) return INTENTS[2]!;
  if (/\bquiet|\bhidden|\blocal\b|\boff the/.test(q)) return INTENTS[3]!;
  if (/\beat\b|\bfood\b|\bbreakfast|\blunch|\bdinner|\brestaurant/.test(q)) return INTENTS[4]!;
  if (/\brain|\bweather|\bindoor/.test(q)) return INTENTS[5]!;
  return null;
}

/** Applies an intent to the catalogue. Pure, so it is testable without a screen. */
export function applyIntent(intent: Intent, items: CatalogueItem[]): CatalogueItem[] {
  let out = items;
  if (intent.categories.length > 0) {
    const wanted = new Set<string>(intent.categories);
    const hits = out.filter((i) => wanted.has(i.category));
    // Fall back to the unfiltered list rather than returning nothing: an empty answer to a chip
    // the app itself offered is a dead end the guest cannot get out of.
    if (hits.length > 0) out = hits;
  }
  if (intent.maxPriceMinor !== undefined) {
    const affordable = out.filter((i) => i.fromAmountMinor <= intent.maxPriceMinor!);
    if (affordable.length > 0) out = affordable;
  }
  return [...out].sort((a, b) => b.ratingAverage - a.ratingAverage).slice(0, 6);
}
