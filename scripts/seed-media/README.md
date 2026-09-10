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

## Listings that still need licensed photography

Searched exhaustively on Commons (2026-09-10): free-text queries plus the
`Ocho Rios`, `Saint Ann Parish`, `Negril` and `Tourism in Jamaica` categories. These have **no
freely-licensed photograph of the thing being sold**, and each currently carries a representative
image of the right place instead:

| Listing | Current image | What is actually needed |
|---|---|---|
| Mystic Mountain Bobsled & Zipline | Konoko Falls gardens — **a different Ocho Rios attraction** | The bobsled, the zipline or the chairlift |
| White River Tubing | A bamboo raft on the White River — right river, wrong craft | Tubing on the White River |

**Do not fix these by reaching for a photograph of the activity taken somewhere else.** The only
free tubing images on Commons are of the Chattahoochee and Shenandoah rivers in the United States;
a Georgia river standing in for a Jamaican one is not a representative image of the right island,
it is a false one. A slightly wrong photograph of the right place is honest. The right activity in
the wrong country is not.

The operator is the answer. A marketplace about to send an operator bookings is in a strong position
to ask for a media kit, and most have one ready.

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
