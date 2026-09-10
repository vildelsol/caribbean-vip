# Demo photography

`manifest.json` names every photograph the demo dataset uses; `fetch.py` downloads them into
`apps/tourist-web/public/demo` and regenerates both `packages/demo/src/credits.ts` and
`docs/media-credits.md`.

```bash
python3 scripts/seed-media/fetch.py
```

Existing files are left alone, so a re-run is cheap. Delete a file (or pass `--force`) to refresh
it. Images are recompressed to 1400px / quality 78 on the way in — full-size Commons originals
would put ~40 MB of photography in the mobile bundle for no visible gain on a phone.

## Rules

- **Wikimedia Commons only, free licences only.** `fetch.py` verifies the licence of every file
  against Commons' own metadata and **refuses to write anything at all** if one is outside
  CC0 / CC BY / CC BY-SA / public domain. A missing photo is obvious in the app; an unlicensed one
  is not.
- **`subject` must say what the photograph actually shows.** Some listings are illustrated with a
  representative photograph of the right island rather than of that exact operator. The app renders
  the subject with the credit, which is what keeps that honest.
- **Attribution ships in the app, not just in a document.** CC BY and CC BY-SA require credit
  wherever the work appears. A test in `packages/demo` fails if a referenced media key has no
  credit recorded.

All of this is demonstration content. Commissioned or licensed photography of the actual vendors is
still needed before anything ships to the public.

## Photography status (2026-09-10)

Every listing now carries a photograph of the right place, and no hero is shared by two listings —
there is a check for that in the audit script.

**White River Tubing shows a bamboo raft on the White River, and that is deliberate.** Ro's call:
rafting is what the river is *known* for, so the raft reads as the White River to anyone who knows
it. This was previously logged as blocked on the operator; it is not blocked, it is correct. Do not
"fix" it.

The rule that produced that entry still stands for anything new: **do not reach for a photograph of
the right activity taken somewhere else.** The only free tubing images anywhere online are of the
Chattahoochee and Shenandoah in the United States — searched again on 2026-09-10 across Commons,
Flickr's CC pool, Unsplash and Pexels. A slightly different craft on the right river is honest; a
Georgia river standing in for a Jamaican one is not.

## Operator-supplied photography

`manifest.json` is Commons-only and will refuse anything else — correctly, because it cannot verify
a licence it cannot look up. `licensed.json` is the other route, for photographs the operator has
given us of their own product.

```bash
# 1. save the image under the media key the dataset already uses
cp ~/Downloads/mystic-bobsled.jpg scripts/seed-media/licensed/jm-mystic-1.jpg

# 2. add an entry to licensed.json with that same key (see the _example in the file)

# 3. rebuild — copies it in, shrinks it, and regenerates the credits
python3 scripts/seed-media/fetch.py
```

An entry here **overrides `manifest.json` for that key**, so no dataset change is needed: the
listing keeps pointing at `jm-mystic-1` and simply gets a different photograph.

Nothing here can be verified automatically, so provenance is recorded by hand instead and the
script refuses an entry that does not carry it. Four ways it will refuse, all tested:

| Problem | What it says |
|---|---|
| Entry with no file beside it | `licensed.json names it but licensed/<key>.jpg is missing` |
| `permission` left as the placeholder | `'permission' is still the placeholder — record how we got it` |
| `rightsHolder` or `permission` blank | `licensed entries need both 'rightsHolder' and 'permission'` |
| — | and as always, nothing at all is written until every problem is fixed |

`permission` is rendered on the card, as `Used with permission — <what you wrote>`. Write what is
actually true: *"Email from Marketing, 12 Sep 2026"* is useful a year later; *"yes"* is not.

**A photograph being publicly visible online is not permission.** An operator's website, a booking
site's gallery and a search-results page are all still someone's copyright. This route is for images
we were *given*, and the `permission` field is where that is recorded — which is also what makes the
difference easy to see later, when nobody remembers where a file came from.

### jm-mystic-1 — Mystic Mountain, shipped (2026-09-10)

The first image through this route, and it **shows the bobsled** — the thing the listing actually
sells. **It is not a Rainforest Adventures promotional image**, which is what the handover assumed
and what made it look blocked: it came from an independent drone pilot, used with that pilot's
permission. The rights holder is the pilot, not the operator.

(A first shot of the same site showed the waterslide rather than the ride; it was replaced the same
day. Nothing on Commons was ever going to solve this listing — the operator, or someone who was
there, always was.)

**Record the pilot's name.** `rightsHolder` reads "Independent drone pilot" because nobody wrote the
name down — the one weak thing about the credit, since a named photographer is the whole point of
the habit. One edit to `licensed.json` and a re-run fixes it.

**Keep the credit short.** It renders on one line over the hero and is ellipsised if it overruns.
`author · licence` wants to stay under about 70 characters, and `Used with permission — ` already
spends 23 of them, so a licensed entry has far less room than a Commons one. The first draft of this
entry ran to 166 characters, wrapped, and covered the "Open Now" badge.

It is 275x183, where other heroes are 941-1400px. `shrink()` only ever scales down, so it ships at
source size. **Ro judged this fine for the demonstration on 2026-09-10** — recorded here as a fact
about the file, not as an open problem. If a replacement turns up, 1400px on the long edge is the
number worth asking for; anything larger is downscaled into a 1400x1400 box.

**White River Tubing is the only listing still short of the real thing.** If you do write to an
operator, it is one paragraph:

> Subject: Photography for your Caribbean VIP listing
>
> Hello,
>
> We're launching Caribbean VIP, a marketplace for verified Jamaican excursions, and Mystic
> Mountain is one of the experiences we feature. We'd like to show the ride itself rather than a
> view of the site.
>
> Could we have written permission to use two or three images from your media kit - ideally the
> bobsled, the zipline or the chairlift - at full resolution? We'll credit Rainforest Adventures
> beside every image wherever it appears, and we'll stop using them the moment you ask us to.
>
> Thanks,
> Ro
