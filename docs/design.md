# Design language

Where the visual language comes from, and the rules that keep it consistent. Read
[`HANDOVER.md`](HANDOVER.md) §4 first for which mockup governs and why.

## Provenance

Four mockups exist. They do not all agree, and the resolution is recorded in HANDOVER §4:

- **`ChatGPT Image Aug 2, 2026, 12_45_42 AM.png`** (VIP Cayman) — the **aesthetic**: the circular
  gold crest, the near-black forest green, the metallic gold, letterspaced caps, ivory card
  surfaces.
- **The three `07_39_*` images** (Caribbean VIP) — the **flow and screen inventory**: twelve
  screens, Jamaica content, five-tab navigation with Irie AI centred.

The earlier "colour reference only" ruling is superseded. The mockups now drive layout.

## Tokens

All colour lives in `packages/ui/src/tokens.ts`. Components reference `semantic.*`, never a hex
literal and never `palette.*` directly unless they genuinely need a raw brand colour.

| Token | Value | Use |
|---|---|---|
| `green950` | `#04211C` | Bottom navigation, crest interior |
| `green900` | `#052D27` | Brand surfaces, headers, primary buttons |
| `green700` | `#0B4E46` | Active/pressed brand |
| `gold` | `#D4AF37` | The premium accent. **Dark surfaces only.** |
| `goldDeep` | `#8F7628` | Gold as text on sand — the one pairing that fails contrast otherwise |
| `sand` | `#FBF1E3` | App background |
| `ivory` | `#FBF7EE` | Voucher and ticket surfaces |
| `turquoise` | `#10828A` | Links and secondary actions |
| `coral` | `#D9694F` | Alerts, expiry, destructive actions |

The green was darkened and the gold made more metallic to match the crest. At the original values
the two sat too close in tone and the result read tropical rather than premium.

**Contrast is tested, not eyeballed.** `tokens.test.ts` asserts the pairings that carry text against
WCAG ratios, because PRD §16 makes outdoor readability a hard constraint. If you change a colour and
that suite goes red, the colour is wrong — not the test.

## The crest

`Crest` in `apps/mobile/components/kit.tsx`. A gold ring on deep green, "VIP" in the middle, the
island name letterspaced beneath.

**The mark never changes; only the word underneath does.** "VIP JAMAICA", "VIP CAYMAN",
"VIP BARBADOS". This is what lets the mockups' VIP Cayman crest exist without contradicting PRD §3,
which says the app is never renamed per island. Do not introduce a second crest, and do not remove
the island line to "simplify" it — the localization is the point.

Drawn in type and views rather than shipped as an image, so it stays crisp at any size, recolours
for light and dark, and costs nothing in the bundle.

## The kit

`apps/mobile/components/kit.tsx` holds everything the mockups repeat: crest, wordmark, the two
button weights, filter chips, status badges, the star-rating row, stat tiles, section headers, the
photo frame, the card surface, and the money formatters.

**Add to the kit rather than restyling inside a screen.** Six screens each growing their own card
style is the exact failure the mockups' own notes call out ("consistent bottom navigation", "better
hierarchy and spacing").

## Rules worth knowing

- **Photos need a ratio frame.** Use `Photo`. A bundled asset carries intrinsic dimensions and
  react-native-web writes those on as a pixel height that beats `aspectRatio` — a 1400×930 photo
  once rendered a 930px-tall card.
- **Attribution ships with the image.** Most photography is CC BY or CC BY-SA, which require credit
  wherever the work appears — so it renders on the card, not only in `media-credits.md`. A test
  fails if a referenced media key has no credit.
- **Tap targets are 44pt minimum**, and primary buttons are 52pt and full width. PRD §16 wants this
  usable one-handed, outdoors, in sun.
- **Money always names its currency**: "$89 USD", never a bare "$89". Local figures are always
  prefixed "≈" and are display only (OD-09).
- **Demo content is labelled wherever it appears** — on cards, on the detail page, in the booking
  flow. Operating rule 9, and a card in a screenshot is exactly where it gets forgotten.

## Screens against the mockups

| Screen | State |
|---|---|
| Welcome | built to the mockup |
| Explore Home | built — greeting, categories, Nearby Discoveries, rated cards |
| Experience Detail | built — hero, rating, Verified Operator, stat row, sticky price bar |
| Voucher popup | built |
| Date & Guests | built — day strip, time chips, steppers |
| Review & Pay | built — summary card, itemized total, dual currency |
| Booking Confirmation | built |
| Trips | built — segmented control, photo cards |
| Search Results | **not restyled** |
| Select Destination | **not restyled** |
| Interests | **not built** |
| Map View | **blocked on OD-05** — ships as a distance-sorted list |
| Irie AI | **not built** — still a milestone placeholder, and it is the centre tab |
| Vendor portal | **functional, unstyled** |
