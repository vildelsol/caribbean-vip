# Design language

Where the visual language comes from, and the rules that keep it consistent.

## Provenance

**The governing design is the Caribbean VIP Journey**, a nine-screen prototype exported from Claude
Design and archived at [`design-source/Screen.dc.html`](design-source/Screen.dc.html). Read that file
for pixel questions; read this one for the rules and the reasoning.

It **supersedes the VIP Cayman mockup** and the three Caribbean VIP images that governed until
2026-08-03, and it reverses two earlier rulings deliberately:

- **Turquoise is back**, as *ocean teal*, with a specific job: location, distance and discovery. The
  previous pass removed it because it appeared nowhere in the VIP Cayman interface. Here it is not
  decoration — it is the colour that means "where", which is the role PRD §16 always implied.
- **Green is darker and colder** — `#0C4A3F` against the old `#173A31` — and the display face is
  Cormorant Garamond over Manrope, replacing Playfair Display over DM Sans.

The design's own thesis, in its words: the product does not show a catalogue, it composes the best
version of today. Every screen answers one question in sequence — where am I, what is worth doing
right now, why should I trust it, how do I pay calmly, and what happens after the money leaves.

## Tokens

All colour lives in `packages/ui/src/tokens.ts`. The web app mirrors it into CSS custom properties
in `apps/tourist-web/src/design/tokens.css`, and `tokens.test.ts` beside it fails if the two drift —
so there is one source of truth despite there being two representations of it.

Components reference `semantic.*`, never a hex literal.

| Token | Value | Use |
|---|---|---|
| `ivory` | `#FBF6EC` | App background |
| `ivoryRaised` | `#FFFDF7` | Cards, and the bottom navigation |
| `ivorySunken` | `#F4EFE4` | Sunken strips, disabled chips, "suggested" |
| `ivoryTicket` | `#FDFAF1` | Voucher and ticket stock |
| `green900` | `#0C4A3F` | Brand, primary action, prices. 9.4:1 on ivory |
| `green950` | `#073229` | Full-bleed dark screens — offer, ticket, Irie |
| `teal` | `#1E7F86` | Pins, proximity rings, the "you are here" dot |
| `tealText` | `#1A6E74` | The same role, carrying copy. 5.1:1 on ivory |
| `aqua` / `aquaSoft` | `#DDEDE8` / `#EAF3EF` | Selected and informational chips |
| `gold` | `#B98D2F` | Offer fills, the rating star, the voucher tile |
| `goldLight` | `#E3C271` | Gold on dark green — headings, sparkles, the crest ring |
| `goldText` | `#7A6420` | The only gold that may carry text on ivory |
| `sand` | `#FBF1DA` | The offer chip and the voucher-applied strip |
| `coral` | `#CE5F44` | Scarcity and urgency **only** — never a general alert |
| `coralText` | `#B04227` | The same role, carrying copy |
| `ink` / `inkMuted` / `inkFaint` | `#16302A` / `#4A5F58` / `#5E7269` | Copy, in three weights |
| `map*` | six values | The stylised map's land, water, greens and roads |

### The fill/text split, and why it exists

The source design is a web prototype rendered on a desktop display, and **seven of its thirteen text
pairings fail WCAG AA** when measured:

| Pairing | Measured |
|---|---|
| ocean teal on ivory | 4.40:1 |
| muted gold on ivory | 2.82:1 |
| soft coral on ivory | 3.65:1 |
| its three greys on ivory/card | 4.18:1, 3.52:1, **2.74:1** |

None of the type carrying those colours is large enough for the 3:1 allowance — the design sets card
meta at 10–12px and its demo labels at 9.5px. PRD §16 makes outdoor readability a hard constraint, so
the raw values cannot carry text.

Rather than repaint the design, **each role keeps its colour for fills, icons, rings and decoration,
and gains a darkened sibling for text**: `locator`/`locatorText`, `premium`/`premiumText`,
`urgent`/`urgentText`. They read as the same hue at a glance; the difference only appears where it
has to. Both halves are asserted — the fill must *fail* AA and still clear 3:1 as a UI boundary, the
text sibling must pass — so the split cannot be quietly collapsed later by someone reaching for the
"real" design colour.

The worst of these deserves naming: the design sets **"DEMO INVENTORY · SAMPLE PRICING" in its
faintest grey at 2.74:1**. That is the one line that must survive being photographed in sunlight,
because it is what stops a screenshot being mistaken for live pricing.

**Contrast is tested, not eyeballed.** If you change a colour and `tokens.test.ts` goes red, the
colour is wrong — not the test.

## Type

Two faces, loaded from Google Fonts in `apps/tourist-web/index.html`:

- **Cormorant Garamond** — the editorial voice. Destination titles, experience names, the
  celebration on the confirmation screen, "Wah Gwaan!". Nothing else.
- **Manrope** — the interface. Cards, prices, navigation, and every number a guest acts on.

Cormorant is a lighter, higher-contrast garalde than Playfair, and it is why the new screens read
editorial rather than luxe-hotel. Manrope is squarer and more legible at small sizes than DM Sans,
which matters because this design puts a great deal of meaning into small type.

### The floor is 11px, and the design's is not

The source goes down to **8.5px** for chip labels. That is not reproduced. PRD §16 requires the app
to be usable one-handed, outdoors, in sun, and a 9px letterspaced cap fails that regardless of its
contrast ratio. The design's *proportions* are kept; its floor is not. `tokens.test.ts` asserts that
nothing in the scale is below 11.

> **The defect that once hid everything.** `typography` tokens are spread straight into style objects,
> and they used to expose `size`/`weight`/`lineHeight`. React Native silently ignores the first two,
> so no font size or weight in the app was ever applied — every screen rendered at the platform
> default, and nothing surfaced it, because a spread of unknown keys is not an error. The tokens now
> expose real style props and there is a regression guard for both halves.
>
> It recurred in a second form on 2026-08-03: the tokens began naming `CormorantGaramond_*` and
> `Manrope_*` while the Expo app still loaded Playfair and DM Sans, so every `Text` fell back to the
> platform default — with type-check, lint and all tests green. A font family that resolves to
> nothing is silent in both directions. That regression is part of why the Expo app was retired.

## Shape

`radius`: `xs` 6, `sm` 10, `md` 14 (buttons), `lg` 18, `xl` 22 (cards), `xxl` 26 (sheets, modals),
`pill` 999. Chips and the search field are pills. Cards carry a soft, wide, nearly colourless shadow
so they lift off the ivory rather than being outlined on it.

## Layout rules

- **Tap targets are 44px minimum**, primary buttons 52px and full width.
- **The frame is phone-width.** Every screen is composed for 390pt, so a desktop letterboxes around
  a centred column rather than stretching a layout nobody drew.
- **Wide content scrolls inside its own container.** The design's side-scrolling card rows are
  `.rail`; the page itself must never scroll sideways.
- **Nothing sits under the bottom navigation.** `.screen` reserves `--nav-clearance`, which is the
  bar plus `env(safe-area-inset-bottom)`, so no screen has to remember.
- **Attribution ships with the image.** Most of the photography is CC BY or CC BY-SA, which require
  credit wherever the work appears — so it renders on the card, not only in `media-credits.md`.
- **Demo content is labelled wherever it appears.** Operating rule 9, and a card in a screenshot is
  exactly where it gets forgotten.

### Grids are allowed here, and were not before

The previous design ruled single-column everywhere, because two 48%-wide cards on a phone gave two
columns of clipped titles. The Journey design uses two-up deliberately and at a size that works — the
four mood tiles and the pair of hidden gems — alongside full-width feature cards and side-scrolling
rails. The rule is now **one column for anything with a price and a title to read; two-up only for
image-led tiles whose label is a single short phrase.**

## The crest

Drawn in type and views rather than shipped as an image, so it stays crisp at any size and costs
nothing in the bundle. A deep green disc, a gold ring, "VIP" in the display serif, and the island
beneath it in letterspaced caps.

**The mark never changes; only the word underneath does** — "VIP JAMAICA", "VIP CAYMAN",
"VIP BARBADOS". That is what lets the design's per-island lockup exist without contradicting PRD §3,
which says the app is never renamed per island. Do not introduce a second crest, and do not remove
the island line to "simplify" it — the localization is the point.

## Irie AI is gold on green, always

The concierge's mark is a gold sparkle on deep green: the raised centre nav badge, the header on its
own tab, the prompt on Explore, the callout on Trips. Built the other way round — a gold disc with a
green sparkle — it throws away the one motif that carries Irie across the whole journey.

Its screen also carries a **GUIDED DEMO** label that the source design does not have. That is
deliberate and is not a style choice: the design shows Irie giving contextual, reasoned answers, and
it is the screen an audience is most likely to mistake for something it is not.

## The kit

`apps/tourist-web/src/components/kit.tsx` holds everything the design repeats — both button weights,
chips, badges, the rating row, the photo frame and its credit, the card surface, skeletons, empty
states, the stepper and the money formatters.

**Add to the kit rather than restyling inside a screen.** Six screens each growing their own card
style is the exact failure the design's own notes call out.

## Screens against the design

| Screen | State |
|---|---|
| Explore | built — hero, island switcher, mood tiles, feature card, near-you rail, gems, tonight |
| Nearby | built — stylised map with proximity rings, filters, distance-sorted list |
| Irie AI | built as a **guided demo** — context chips, rule-matched answers with stated reasons |
| Trips | built — day timeline, next-up card, day total |
| Profile | built — crest, island switching, voucher wallet, saved, simulation disclosure |
| Experience detail | **not built** |
| Geofenced offer | **not built** |
| Checkout | **not built** |
| Confirmation | **not built** |
| QR ticket | **not built** |
