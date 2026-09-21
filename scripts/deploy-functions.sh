#!/usr/bin/env bash
#
# Deploy the four Edge Functions.
#
# Two flags here are not optional and are not discoverable from the error messages:
#
#   --import-map supabase/functions/deno.json
#       `checkout-session` and `stripe-webhook` import `@cvip/payments` and `@cvip/types`. The CLI
#       does NOT pick up `supabase/functions/deno.json` on its own; without this flag the bundle
#       fails with 'Relative import path "@cvip/payments" not prefixed with / or ./ or ../'.
#
#   --no-verify-jwt   (stripe-webhook only)
#       Stripe signs with `Stripe-Signature`, not a Supabase JWT. With JWT verification on, the
#       platform rejects the request before our handler runs: the signature is never checked, the
#       booking is never confirmed, and the guest is charged for a booking stuck on
#       `pending_payment`. The HMAC signature is the authentication.
#
# The other three keep JWT verification on and are called with the anon key.
#
# Usage: ./scripts/deploy-functions.sh <project-ref>

set -euo pipefail

REF="${1:-}"
if [[ -z "$REF" ]]; then
  echo "usage: $0 <project-ref>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MAP="supabase/functions/deno.json"

echo "==> Deploying to $REF"

for fn in resolve-slot booking-status checkout-session; do
  echo "--> $fn"
  npx supabase functions deploy "$fn" --project-ref "$REF" --import-map "$MAP"
done

echo "--> stripe-webhook (JWT verification off — see the note at the top of this file)"
npx supabase functions deploy stripe-webhook --project-ref "$REF" --import-map "$MAP" --no-verify-jwt

echo "==> Done. Secrets are set in the dashboard, not here:"
echo "    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VOUCHER_HMAC_SECRET, APP_URL"
