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

**Every value is re-sampled from the VIP Cayman mockup** (2026-08-03). The first pass averaged
pixels over regions, and an average taken across a card edge or a glyph returns a colour that
appears nowhere in the image — which is why the palette read muddy and too dark. Sampling now takes
the *modal* colour of a flat area, confirmed in several independent regions per token.

| Token | Value | Use |
|---|---|---|
| `ivory` | `#FCF9F4` | App background, **bottom navigation**, status bar |
| `ivorySunken` | `#FAF5EC` | Category tiles, stat tiles, sunken strips |
| `ivoryRaised` | `#FFFDF9` | Cards |
| `green950` | `#0C2B25` | The crest — the darkest value in the design |
| `green900` | `#173A31` | Primary buttons, badges, active nav item |
| `green700` | `#215247` | Links, steppers, pressed brand |
| `greenAccent` | `#1F7A5C` | **Prices, "View All", the selected tab, the location pin.** 5.0:1 on ivory |
| `ratingStar` | `#FFA100` | The rating star. Decorative — the number beside it carries the meaning |
| `gold` | `#C9A257` | Premium accent; the midpoint of the button gradient |
| `goldTop`/`goldBottom` | `#E2BC70` / `#BB9347` | The gold button's vertical gradient |
| `goldLight` | `#E4C173` | Crest ring, rating stars |
| `goldDeep` | `#7E6118` | The only gold that may carry text — on ivory **and** on the gold tints |
| `coral` | `#C2543A` | Alerts, expiry, destructive actions |
| `turquoise` | `#10828A` | **Not used in the interface** — see below |
| `tintGreen` / `tintSuccess` | `#F1F6F2` / `#E8F4ED` | "Use My Location", the success badge |
| `tintGold` / `tintOffer` / `tintWarning` | `#F7EFDD` / `#F5E4BE` / `#F7EADA` | Irie Tip, "Top Rated", "Pending" |

### The tints

Pale washes behind badges, callouts and the "Use My Location" card. They were hand-mixed inline in
`kit.tsx`, `irie.tsx` and `select-destination.tsx` — five one-off pale colours across three files,
which is how a palette comes apart, and the vendor portal is about to need the same set.

Pulling them into tokens brought them under `tokens.test.ts`, and **three of the five were failing
AA** at 3.7–4.3:1. Badge labels are 11pt and Irie Tip body is 13pt, so neither qualifies for the
3:1 large-text allowance. The fix was to darken the *ink*, not lighten the wash: `goldDeep` went
`#8A6D24` → `#7E6118` and `warning` `#A06E1C` → `#905E0C`. Lightening the tints was tried first and
rejected — it walked the mockup's sand up to a pale yellow. `goldDeep` also reads better on ivory
now (5.5:1, was 4.6:1), so nothing regressed where it was already used.

### Three corrections worth remembering

1. **The chrome is ivory, not green.** The bottom navigation, the status bar and the surface behind
   every screen are all `#FCF9F4`. The nav bar was a deep green slab. Putting the heaviest value in
   the composition along the bottom edge of every screen inverted the design's value structure, and
   it was the single largest reason the build did not look like the mockup.

2. **Turquoise appears nowhere in the mockup's interface.** It is in the photography, which is where
   a sea colour belongs. `semantic.accent` pointed at it, so every inline link, stepper and "Try
   again" rendered turquoise on ivory and read as another product's UI dropped into this one.
   `semantic.accent` is now `green700`; `palette.turquoise` remains for illustration.

3. **Gold buttons carry deep green text, not white.** White on this gold is 2.4:1. This is the one
   deliberate deviation from the mockup, and `tokens.test.ts` pins both halves of it.

4. **Green carries information, it is not only chrome.** In the mockup the price on a card is
   *green*, not ink; "View All" is a green outlined pill; the selected tab sits in a filled green
   disc. `greenAccent` exists for exactly this and is deliberately lighter and more saturated than
   the brand green — a price in `green900` is indistinguishable from the title above it and the card
   loses its hierarchy. "View All" was previously gold text at 2.3:1, which was unreadable.

**Contrast is tested, not eyeballed.** `tokens.test.ts` asserts the pairings that carry text against
WCAG ratios, because PRD §16 makes outdoor readability a hard constraint. If you change a colour and
that suite goes red, the colour is wrong — not the test.

## Type

Two bundled faces, loaded by `useAppFonts` in `apps/mobile/lib/fonts.ts`:

- **Playfair Display** — the display serif. The crest's "VIP", the destination title on Explore,
  "My Trips", the voucher headline. Nothing else.
- **DM Sans** — everything else.

They are bundled rather than named in a CSS stack so the demo renders identically wherever it is
opened. A stack that falls back to Georgia is close enough to fool a glance and wrong enough to be
obvious beside the mockup.

> **The defect that hid all of this.** `typography` tokens are spread straight into `Text` styles in
> ~180 places, and they used to expose `size`/`weight`/`lineHeight`. React Native silently ignores
> the first two, so **no font size or weight in the app was ever applied** — every screen rendered
> at the platform default, and nothing surfaced it because a spread of unknown keys is not an error.
> The tokens now expose real style props (`fontSize`, `fontWeight`, `fontFamily`, `letterSpacing`),
> and `tokens.test.ts` has a regression guard for both halves.

## Shape

The mockup is rounder than the old scale allowed. `radius`: `sm` 10, `md` 14 (buttons, tiles),
`lg` 18 (cards), `xl` 24 (modals, the detail page's content sheet), `pill` 999.

Pills are for the welcome screen's two actions, chips, badges and the search field. Deep green
actions inside a screen use `md`. Cards carry a hairline **and** a soft wide shadow (`elevation.card`)
— the mockup's cards read as lifted off the ivory, not outlined on it.

## The crest

`Crest` in `apps/mobile/components/kit.tsx`. Three details carry the mockup's version, and all
three were missing:

- **The disc is translucent** over a photograph — `rgba(12,43,37,0.86)`, so the water reads through
  it. That is what stops it looking like a sticker pasted onto the image. Pass `onPhoto`. On an
  ivory surface it goes opaque, because translucency over a flat background is just a lighter green.
- **There are two rings** — a heavy outer one in `goldLight` and a hairline inset a few points
  inside it.
- **The lettering is Playfair**, not the UI sans.

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
- **Money is formatted "US$89"**, as the mockup does, never a bare "$89". `formatUsd(minor, true)`
  spells out "USD" for the checkout summary. Local figures are always prefixed "≈" and are display
  only (OD-09).
- **Icons are Feather line icons**, via `Icon` in the kit. Not emoji and not text glyphs: emoji are
  full-colour, differently shaped on every platform, and cannot take the brand colour.
- **`pointerEvents` goes in the style, never as a prop.** react-native-web deprecated the prop form
  and `expo-linear-gradient` does not forward it — a full-bleed scrim with the prop form silently
  swallows every tap on the screen beneath it. This shipped on the welcome screen and made both
  buttons dead.
- **Demo content is labelled wherever it appears** — on cards, on the detail page, in the booking
  flow. Operating rule 9, and a card in a screenshot is exactly where it gets forgotten.

## Lists are single column

`ExperienceCard`'s default variant is `row`: thumbnail left, detail right, one per line. Explore,
Search, Nearby and Saved all use it.

Two 48%-wide cards side by side is a desktop grid habit. On a phone it produces two columns of
clipped titles and thumbnails too small to read, and it was the layout Explore shipped with. The
`grid` variant survives in exactly one place — inside an Irie AI answer, where three small cards
scrolling sideways is the intended shape rather than an accident of available width.

Card height is worth guarding. The row is sized to sit level with its 92pt thumbnail, and the demo
label is a two-letter `DEMO` mark on the price line rather than the sentence "Demo listing — not
live pricing", which added a fifth line to every card in the app.

## Loading and empty states

`ListSkeleton` and `EmptyState` in the kit. A bare centred spinner tells you nothing about what is
coming and makes the screen jump when it lands; a skeleton in the shape of the content holds the
layout still. Every empty list gets an icon, a reason and one action — an empty list that says
nothing reads as a bug.

## Screens against the mockups

| Screen | State |
|---|---|
| Welcome | built to the mockup |
| Explore Home | built — serif destination title, pill search, Nearby Discoveries hero, category tiles, rated cards |
| Experience Detail | built — hero with floating controls, rounded content sheet, badge pair, stat tiles, single full-width action |
| Voucher popup | built — gold ring, "TODAY ONLY!", serif headline, gold pill |
| Date & Guests | built — day strip, time chips, steppers |
| Review & Pay | built — summary card, itemized total, dual currency |
| Booking Confirmation | built |
| Trips | built — underlined tab row, photo cards with a status badge |
| Search Results | built — pill field with filter control, category chips, result count, row cards |
| Select Destination | built — Use My Location card, photo rows, island chips |
| Interests | built — eight tiles, two across; ranks rather than filters |
| Nearby | built — row cards, skeletons, empty state. **Map still blocked on OD-05** |
| Irie AI | built as a **guided demo** — chat UI, real catalogue cards, no model behind it |
| Vendor portal | **functional, unstyled** |
