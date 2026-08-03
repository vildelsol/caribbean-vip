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
