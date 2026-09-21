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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const url = new URL(req.url);
  const title = url.searchParams.get('experience_title');
  const date = url.searchParams.get('date');
  const time = url.searchParams.get('time');

  if (!title || !date || !time) {
    return json({ error: 'experience_title, date, and time are required' }, 400);
  }

  // Build the starts_at timestamp. The seed generates slots in UTC; the demo times are wall-clock
  // so we treat them as UTC (matching how the seed generates them with make_interval).
  const startsAt = `${date}T${time}:00+00:00`;

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
      .select('id')
      .eq('title', title)
      .maybeSingle();

    if (expError) return json({ error: 'Lookup failed', detail: expError.message }, 500);
    if (!experience) return json({ error: 'Experience not found', title }, 404);

    // `maybeSingle` rather than `single`: a missing slot is an ordinary outcome the guest caused
    // by picking a time we do not run, and it must read as 404, not as a server fault.
    const { data: slot, error: slotError } = await supabase
      .from('availability_slots')
      .select('id, experience_id')
      .eq('experience_id', experience.id)
      .eq('starts_at', startsAt)
      .maybeSingle();

    if (slotError) return json({ error: 'Lookup failed', detail: slotError.message }, 500);
    if (!slot) return json({ error: 'Slot not found', title, startsAt }, 404);

    const { data: options, error: optError } = await supabase
      .from('experience_options')
      .select('id, kind, label, unit_amount_minor')
      .eq('experience_id', slot.experience_id)
      .eq('is_active', true)
      .order('sort_order');

    if (optError) return json({ error: 'Lookup failed', detail: optError.message }, 500);

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
