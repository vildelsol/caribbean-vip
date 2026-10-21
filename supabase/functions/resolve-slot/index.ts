/**
 * resolve-slot — maps (experienceTitle, dateISO, time) to real DB UUIDs.
 *
 * GET ?experience_title=Mystic+Mountain+Bobsled&date=2026-09-21&time=09:00
 * → { slotId, experienceId, options: [{ id, kind, label, unitAmountMinor }] }
 *
 * The tourist app still reads its catalogue from the demo dataset (UX reasons — demo mode and
 * live mode share the same UI). This function is the thin bridge between the human-readable
 * demo IDs and the UUIDs the checkout Edge Function requires.
 *
 * Lookup is by exact title match + starts_at timestamp. Two experiences may not share a title
 * in the demo catalogue, so this is safe for the MVP.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { isPubliclyBookable } from '../_shared/listingVisibility.ts';
import { parseSlotQuery } from '../_shared/slotQuery.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const url = new URL(req.url);
  // Validated before any query: a malformed date or time used to reach Postgres, whose error text
  // was then returned to the caller. Every refusal reads the same, so it does not say which part failed.
  const query = parseSlotQuery(
    url.searchParams.get('experience_title'),
    url.searchParams.get('date'),
    url.searchParams.get('time'),
  );
  if (!query.ok) {
    return json({ error: 'experience_title, date (YYYY-MM-DD) and time (HH:MM) are required' }, 400);
  }
  const { title, startsAt } = query;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    // Two plain queries rather than one nested one. This was `.in('experience_id', <query
    // builder>)`, which supabase-js does not support — `.in()` takes an array — and the malformed
    // request surfaced as a 500 with no usable message.
    const { data: experience, error: expError } = await supabase
      .from('experiences')
      .select('id, status, vendor_organizations!inner(status)')
      .eq('title', title)
      .maybeSingle();

    if (expError) return lookupFailed('experiences', expError);
    // The service client skips RLS, so apply the public-visibility rule here: a draft or suspended
    // listing must read as not found, or its slot and option ids (and prices) can be fetched by title.
    const vendor = Array.isArray(experience?.vendor_organizations)
      ? experience?.vendor_organizations[0]
      : experience?.vendor_organizations;
    if (!experience || !isPubliclyBookable(experience.status, vendor?.status)) {
      return json({ error: 'Experience not found' }, 404);
    }

    // `maybeSingle` rather than `single`: a missing slot is an ordinary outcome the guest caused
    // by picking a time we do not run, and it must read as 404, not as a server fault.
    const { data: slot, error: slotError } = await supabase
      .from('availability_slots')
      .select('id, experience_id')
      .eq('experience_id', experience.id)
      .eq('starts_at', startsAt)
      .maybeSingle();

    if (slotError) return lookupFailed('availability_slots', slotError);
    if (!slot) return json({ error: 'Slot not found' }, 404);

    const { data: options, error: optError } = await supabase
      .from('experience_options')
      .select('id, kind, label, unit_amount_minor')
      .eq('experience_id', slot.experience_id)
      .eq('is_active', true)
      .order('sort_order');

    if (optError) return lookupFailed('experience_options', optError);

    return json({
      slotId: slot.id,
      experienceId: slot.experience_id,
      options: (options ?? []).map((o) => ({
        id: o.id,
        kind: o.kind,
        label: o.label,
        unitAmountMinor: o.unit_amount_minor,
      })),
    });
  } catch (err) {
    console.error('resolve-slot failed:', err);
    return json({ error: 'Lookup failed' }, 500);
  }
});

/**
 * Database errors name tables, columns and types, so they go to the log and never to the caller.
 * The caller gets the same two words whatever failed.
 */
function lookupFailed(step: string, error: { message?: string; code?: string }): Response {
  console.error(`resolve-slot: ${step} lookup failed:`, error.code ?? '', error.message ?? '');
  return json({ error: 'Lookup failed' }, 500);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
