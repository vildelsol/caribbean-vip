#!/usr/bin/env bash
# Fail if a tracked file contains something shaped like a live secret.
# Patterns are deliberately narrow (live Stripe keys, private keys, Supabase service-role JWTs,
# webhook secrets, AWS keys) so a hit is real. `--self-test` proves each pattern still matches.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PATTERNS=(
  'sk_live_[0-9A-Za-z]{16,}'
  'rk_live_[0-9A-Za-z]{16,}'
  'whsec_[0-9A-Za-z]{24,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
  'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}'
)

if [[ "${1:-}" == "--self-test" ]]; then
  samples=(
    "sk_live_$(printf 'a%.0s' {1..24})"
    "rk_live_$(printf 'b%.0s' {1..24})"
    "whsec_$(printf 'c%.0s' {1..32})"
    "-----BEGIN PRIVATE KEY-----"
    "AKIA$(printf 'A%.0s' {1..16})"
    "eyJhbGciOiJIUzI1NiIsInR5cCI.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.$(printf 'd%.0s' {1..30})"
  )
  for i in "${!PATTERNS[@]}"; do
    echo "${samples[$i]}" | grep -Eq -- "${PATTERNS[$i]}" || { echo "self-test: pattern $i does not match its sample"; exit 1; }
  done
  echo "self-test ok (${#PATTERNS[@]} patterns)"; exit 0
fi

status=0
for p in "${PATTERNS[@]}"; do
  # This script and its docs name the patterns; exclude only those files.
  rc=0
  git grep -nIE -e "$p" -- . ':!scripts/scan-secrets.sh' ':!pnpm-lock.yaml' >/tmp/scan-hit 2>/dev/null || rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "::error::Possible secret matching /$p/ (value hidden):"
    cut -d: -f1,2 /tmp/scan-hit
    status=1
  elif [[ $rc -ne 1 ]]; then
    echo "::error::scan failed on pattern /$p/ (grep exit $rc); a broken pattern must not read as clean"
    status=1
  fi
done
rm -f /tmp/scan-hit
[[ $status -eq 0 ]] && echo "no secret-shaped strings in tracked files"
exit $status
