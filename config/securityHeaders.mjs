/* global process, URL */
// One source of truth for the browser security headers of all three web apps.
//
// The tourist app is a static Vite build served by Vercel, so its headers live in vercel.json, which
// cannot import code. `config/securityHeaders.test.ts` therefore asserts vercel.json equals what this
// module generates; edit here, then run `node config/securityHeaders.mjs --write-vercel`.
// The Next apps (admin, vendor) call `nextHeaders()` from next.config.mjs.

const supabase = 'https://*.supabase.co';

// Tourist: a static bundle, so no inline script is needed and none is allowed.
const touristCsp = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style attributes are used by the UI; Google Fonts serves the stylesheet.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabase} wss://*.supabase.co`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Next apps inject inline bootstrap scripts without a nonce, so script-src must allow 'unsafe-inline'.
// Every other directive stays tight; moving to nonces is a later hardening step.
const nextCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabase} wss://*.supabase.co`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const common = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

export const touristHeaders = [
  ...common,
  { key: 'Content-Security-Policy', value: touristCsp },
  // Location for geofenced offers; nothing else.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(self), microphone=(), payment=()' },
];

const nextHeadersFor = (camera) => [
  ...common,
  { key: 'Content-Security-Policy', value: nextCsp },
  { key: 'Permissions-Policy', value: `camera=${camera}, geolocation=(), microphone=(), payment=()` },
];

export const adminHeaders = nextHeadersFor('()');
// The vendor scanner reads voucher QR codes with the camera.
export const vendorHeaders = nextHeadersFor('(self)');

export const nextHeaders = (app) => async () => [
  { source: '/(.*)', headers: app === 'vendor' ? vendorHeaders : adminHeaders },
];

if (process.argv.includes('--write-vercel')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const p = new URL('../apps/tourist-web/vercel.json', import.meta.url);
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  cfg.headers = [
    { source: '/(.*)', headers: touristHeaders },
    ...cfg.headers.filter((h) => h.source !== '/(.*)'),
  ];
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
}
