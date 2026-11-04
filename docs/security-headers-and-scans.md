# Security headers and automated scans

## Headers
`config/securityHeaders.mjs` is the single source. Next apps (admin, vendor) import it; the tourist app's `vercel.json` is generated from it (`node config/securityHeaders.mjs --write-vercel`) and `config/securityHeaders.test.ts` fails if they drift.

- CSP: self-only, connect to Supabase only, no framing, no plugins. Tourist allows no inline script. Admin and vendor allow `'unsafe-inline'` scripts because Next injects bootstrap scripts without a nonce; moving to nonces is a later step.
- Camera is granted only to the vendor app (QR scanner). Location only to the tourist app.
- When a new third party is added (maps, notifications, analytics), it must be added to `connect-src`/`img-src` deliberately; the test pins the connect list so this is a visible change.
- Not yet checked on the deployed apps: confirm no CSP violations in the browser console on staging after deploy.

## Scans (CI `verify`)
- `scripts/scan-secrets.sh`: narrow secret patterns over tracked files, with a self-test so a broken pattern cannot read as clean.
- `pnpm audit --prod --audit-level=high`. Known exception: zod 3.x (GHSA-mrhx-c7xc-m3w5, memory use on oversized collections). Fixing needs the zod 4 major upgrade across packages; input sizes are bounded at the Edge Function boundary. Revisit and remove the ignore in `package.json` when upgraded.
- Dependabot opens weekly update PRs.
