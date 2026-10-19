# 008 — The redemption verdict arrives with no motion, and the portal's only live flow is the one with none

- **Status**: TODO
- **Severity**: HIGH
- **Category**: Missed opportunity
- **Estimated scope**: 1 file, ~30 lines (2 rules extended, 2 keyframes added).

## Problem

Voucher redemption is the **only vendor flow wired end to end** — every other
page in the portal writes to in-memory state. `lib/redeem.ts` calls the
`redeem_voucher` RPC, and its answer is rendered here:

```tsx
/* apps/vendor-web/components/Scanner.tsx:175-178 — current */
{outcome && copy ? (
  <div className={`verdict verdict--${verdictTone}`} role="status" aria-live="polite">
    <p className="verdict__headline">{copy.headline}</p>
    <p className="verdict__detail">{copy.detail}</p>
```

```css
/* apps/vendor-web/app/vendor.css:235-255 — current */
.verdict {
  border-radius: var(--r-xl);
  padding: var(--s-lg);
  display: grid;
  gap: var(--s-md);
  color: var(--on-dark);
  box-shadow: var(--e-raised);
}
.verdict--ok {
  background: var(--green-900);
}
.verdict--warn {
  background: var(--gold-text);
}
.verdict--bad {
  background: var(--coral-text);
}
```

No `transition`, no `animation`, and no `@keyframes` anywhere in the file. The
transport-error panel beside it is the same:

```css
/* apps/vendor-web/app/vendor.css:310-317 — current */
.transport {
  /* …no motion… */
}
```

Why this is the portal's worst motion gap rather than a cosmetic one:

1. **This is the one screen where the vendor is looking at a stranger, not the
   phone.** The sequence is: tap *Check voucher* → the label becomes `Checking…`
   (`Scanner.tsx:160`) → an answer replaces nothing with a full-width coloured
   panel. The vendor glances down once. If the panel was already there when they
   looked, they cannot tell a fresh answer from a stale one left over from the
   previous guest, and the decision they are about to make — let this person
   through or not — rests on that distinction.
2. **A second scan of the same code is the acceptance criterion of V-05** and
   renders through the identical path (`Scanner.tsx:181-193`). "Already
   redeemed" and "Valid" differ only in colour and words. In sunlight, with a
   queue, the vendor needs the panel's *arrival* to register as an event before
   they read which event it was.
3. **A verdict replacing a previous verdict does not re-run anything.** React
   reuses the same `<div>` and only swaps the `verdict--*` class and the text, so
   even an entrance animation on mount would not fire on the second scan. That is
   the detail that makes this a correctness problem and not a taste one — see the
   `key` note in Steps.

`.transport` has the same gap for the connection-failure case, which is the one
the comment at `Scanner.tsx:169-170` specifically asks the vendor to notice and
retry.

## Target

```css
/* apps/vendor-web/app/vendor.css — target, .verdict at line 235 extended */

/*
 * The verdict's arrival has to register before it is read. A vendor taps Check,
 * looks at the guest, and glances back — without an arrival they cannot
 * distinguish this answer from the previous guest's, which is the distinction
 * the whole screen exists to make.
 *
 * `--ease-entrance` is a strong expo-out: most of the distance is covered in the
 * first third, so the panel has visibly landed by the time the eye reaches it.
 * `scale` is deliberately absent — the headline is 30px display type read in
 * sunlight and must be crisp from the first frame.
 */
.verdict {
  border-radius: var(--r-xl);
  padding: var(--s-lg);
  display: grid;
  gap: var(--s-md);
  color: var(--on-dark);
  box-shadow: var(--e-raised);
  animation: vendor-verdict-in var(--dur-base) var(--ease-entrance) both;
}

@keyframes vendor-verdict-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
```

```css
/* apps/vendor-web/app/vendor.css — target, .transport at line 310 extended */

/*
 * A transport failure is not a decision about the voucher — Scanner.tsx asks the
 * vendor to retry rather than turn anyone away. It gets the same arrival as a
 * verdict so that "something came back" is unambiguous, and the same curve so
 * the two cannot be told apart by their motion, only by their content.
 */
.transport {
  /* …existing declarations unchanged… */
  animation: vendor-verdict-in var(--dur-base) var(--ease-entrance) both;
}
```

Both reuse one keyframe. Do not write a second.

## Repo conventions to follow

- Motion values from `packages/ui/tokens.css`: `--ease-entrance`, `--dur-base`.
  No literals, no new tokens — this plan needs none.
- `globals.css:12` imports `@cvip/ui/tokens.css`; the variables are in scope. No
  new import.
- Prefix keyframe names in `vendor.css` with `vendor-`.
- `vendor.css` uses `--- Name ---` banners in its upper half, where both of these
  rules live. Do not add a new banner; both rules already sit under the scanner's
  section.
- Comment the reason, not the rule. The two comments above are the deliverable.
- `translateY` distance: **10px**. Smaller than the sheet's 16px in plan 007
  because this panel does not travel from off-screen — it is already in the
  document flow and only needs to assert that it is new.

## Steps

1. Add the `animation:` line as the last declaration of `.verdict`
   (`apps/vendor-web/app/vendor.css:235-242`). Change nothing else in the rule
   and nothing in `.verdict--ok` / `--warn` / `--bad`.
2. Add the `@keyframes vendor-verdict-in` block, with its comment, immediately
   after `.verdict--bad` (which ends at `vendor.css:255`) and before
   `.verdict__headline` at line 256.
3. Add the same `animation:` line as the last declaration of `.transport`
   (`vendor.css:310-317`), with its own comment above the rule. Do **not**
   duplicate the keyframe.
4. **Make the verdict re-animate on a second scan.** React reuses the element
   across outcomes, so the keyframe fires on mount only. Add a `key` derived from
   the outcome so a new answer is a new element:

   ```tsx
   /* apps/vendor-web/components/Scanner.tsx:176 — target */
   <div
     key={`${outcome.result}-${outcome.redeemedAt ?? outcome.originalRedeemedAt ?? ''}`}
     className={`verdict verdict--${verdictTone}`}
     role="status"
     aria-live="polite"
   >
   ```

   This is the only TSX change in this plan and it is one added prop. It does not
   alter behaviour for a first scan. Read `Scanner.tsx:175-199` before editing to
   confirm `outcome.result`, `outcome.redeemedAt` and `outcome.originalRedeemedAt`
   are still the field names; if any has been renamed, use whatever fields the
   type actually exposes and keep the intent — a key that changes whenever the
   answer changes.
5. Run the checks in the Verification section.

## Boundaries

- Do NOT change `--green-900`, `--gold-text` or `--coral-text`, or the mapping of
  tone to colour. The colour carries the decision; this plan only makes its
  arrival visible.
- Do NOT add `scale` or a bounce to the verdict. Stated above with the reason. A
  panel that overshoots reads as celebration, and one of the three tones is a
  refusal.
- Do NOT animate the `verdict--*` background between tones. A colour crossfade
  between "valid" and "already redeemed" passes through an intermediate colour
  that means neither, on the one screen where ambiguity is unacceptable.
- Do NOT add motion to `.verdict__record`, `.verdict__stamp` or any child. A
  staggered reveal of the redemption record delays the exact information V-05
  exists to deliver.
- Do NOT touch `lib/redeem.ts`, the camera lifecycle (`Scanner.tsx:22-40`), or
  any other part of `Scanner.tsx` beyond the single `key` prop in step 4.
- Do NOT touch `apps/tourist-web` or `apps/admin-web`.
- Do NOT add a library.
- If `vendor.css:235` does not begin `.verdict {`, or `Scanner.tsx:176` does not
  contain `className={\`verdict verdict--${verdictTone}\`}`, STOP and report the
  drift rather than guessing.

## Verification

- **Mechanical**:
  - `pnpm lint` → passes.
  - `pnpm --filter @cvip/vendor-web typecheck` → passes (step 4 touches TSX).
  - `pnpm --filter @cvip/vendor-web build` → succeeds.
  - `grep -c "@keyframes vendor-verdict-in" apps/vendor-web/app/vendor.css` → `1`.
    `2` means the keyframe was duplicated for `.transport`.
  - `grep -n "vendor-verdict-in" apps/vendor-web/app/vendor.css` → 3 hits: the
    keyframe and the two `animation:` declarations.
  - `grep -n "key=" apps/vendor-web/components/Scanner.tsx` → the verdict `key`
    is present.
- **Feel check**: `npx pnpm@9 demo`, open `http://localhost:3001/scan`. Demo mode
  needs no camera — use the manual code field.
  - Enter a valid demo voucher code. The verdict must rise and fade in, not
    appear.
  - **Enter the same code again without reloading.** The verdict must animate a
    second time, now in the "already redeemed" tone. If it changes colour and text
    without moving, the `key` from step 4 is not changing — that is the whole
    point of step 4 and the plan is not done.
  - Enter a malformed code to reach `.transport`. Same arrival, same timing.
  - In DevTools → Animations at 10% playback, confirm the panel covers most of its
    10px in the first third of the timeline. Symmetric motion means
    `--ease-entrance` was not applied.
  - Read the 30px headline during the animation at 10%. It must be crisp and
    settled in position before it is legible — if it is readable while still
    moving, the distance is too large for the duration; report rather than retune.
  - Enable `prefers-reduced-motion: reduce` and scan twice. Both verdicts must
    appear instantly and in the correct tone. The vendor who asked for less motion
    still gets the answer; they just do not get the arrival.
- **Done when**: a second scan of the same code animates, all three tones animate
  identically, and the headline is never legible mid-motion.
