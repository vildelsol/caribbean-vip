# Plugging in outside tools and databases

The stack is not chosen (OD-05 and more). Any email, maps, AI, analytics, payments or database tool
must be able to join without new privacy plumbing, and without privacy being forgotten for it.

## The seam
`packages/types/src/processorPorts.ts` defines `ProcessorPort`: a tool says what it is, what data it
holds, where it stores it, and how to **export** and **erase** one person. `createProcessorRegistry`
refuses a port with no declared data or region, or a duplicate id. `eraseEverywhere` and
`exportEverywhere` run every port, and never throw: they report `complete: false` and name the
tools that did not finish. An unsupported or failing tool is an incomplete erasure, never a skipped
one.

This extends the provider interfaces already in `providers.ts` (AD-07: maps, notifications, AI, each
with a mock). Those say how the app *uses* a tool. A port says how the tool *holds guest data*.

Supabase today is one adapter behind the same idea. The tourist app already injects its clients
(`ConsentClient`, `PrivacyClient`, `OffersClient`); a different database means a different client
object, not different screens.

## Adding a tool (checklist)
1. Write an adapter that implements `ProcessorPort` (no SDK imports in `packages/types`; the adapter
   lives with the app or function that uses the SDK).
2. Add it to the registry the erasure and export flows build.
3. Add its row to `processor-record.md` (role, data, region, contract, transfer basis).
4. If it stores data in our database, list the table in `data-inventory.md` (the build fails otherwise).
5. If it receives a guest's location or free text, update `dpia.md`.
6. Test its adapter with a fake: erase works, `not_held` is handled, a failure is reported.

## What is not built yet
- No adapter exists. Nothing registers Stripe, Supabase Auth or email yet, so the registry is empty
  and `eraseEverywhere([])` reports complete. The erasure flow does not call it yet. Wiring it in
  (the Edge Function that runs `erase_my_data()` then the registry, recording the report in
  `privacy_requests.outcome`) is the next step, and should add a test that fails if a processor row
  in `processor-record.md` has no registered port.
- Data portability formats per tool are left to each adapter.
