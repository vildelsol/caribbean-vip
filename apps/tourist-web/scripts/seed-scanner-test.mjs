// Seed a real Supabase project for the first live scanner test.
//
//   pnpm scanner:seed
//
// Needs, in the environment (never in a file that is committed):
//   SUPABASE_URL              project URL
//   SUPABASE_SERVICE_ROLE_KEY secret; bypasses RLS
//   VOUCHER_HMAC_SECRET       the SAME value the project's Edge Functions use
//   SCANNER_EMAIL             an inbox you can open on your phone; the vendor portal signs in by
//                             magic link, so no password is created or printed
//   SCANNER_NOPERM_EMAIL      optional second inbox: staff WITHOUT can_scan_vouchers
//
// Writes one QR PNG per scenario to ./scanner-test-out (gitignored) and an index.html that
// lists them with the outcome the scanner should show. Open index.html on a laptop and scan the
// QR codes with the phone running the vendor portal.
//
// Refuses to run against a non-hosted URL and against anything but a staging project, because it
// mints real accounts and vouchers.

import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { generateVoucherId, hashVoucherToken, signVoucherToken } from '@cvip/types';

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See the header of this script.`);
    process.exit(64);
  }
  return v;
};

const url = need('SUPABASE_URL');
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY');
const hmacSecret = need('VOUCHER_HMAC_SECRET');
const scannerEmail = need('SCANNER_EMAIL').toLowerCase();
const nopermEmail = process.env.SCANNER_NOPERM_EMAIL?.toLowerCase();
if (nopermEmail && nopermEmail === scannerEmail) {
  console.error('SCANNER_EMAIL and SCANNER_NOPERM_EMAIL must be different addresses.');
  process.exit(64);
}

if (hmacSecret.length < 32) {
  console.error('VOUCHER_HMAC_SECRET is shorter than 32 characters; that is not the real secret.');
  process.exit(64);
}
// Hard allowlist. This script mints accounts, fake confirmed bookings and redeemable vouchers, so
// it must never reach a project that is not named here. Add a staging ref; never a production one.
const STAGING_HOSTS = ['fsnkzpxgrckfifmhwsff.supabase.co'];
let host = '';
try {
  host = new URL(url).hostname;
} catch {
  // falls through to the refusal below
}
if (!STAGING_HOSTS.includes(host)) {
  console.error(`Refusing: ${host || url} is not an allowlisted staging project.`);
  process.exit(64);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const must = (label, { data, error }) => {
  if (error) {
    console.error(`${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
};

// No email_confirm: a mistyped address must not become a confirmed account. The magic link
// confirms the address when its owner clicks it.
async function ensureUser(email) {
  const created = await db.auth.admin.createUser({ email });
  if (created.data?.user) return created.data.user.id;
  // Already registered: find it. perPage is generous; a staging project has few users.
  const list = must('listUsers', await db.auth.admin.listUsers({ perPage: 1000 }));
  const found = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!found) {
    console.error(`createUser(${email}): ${created.error?.message}`);
    process.exit(1);
  }
  return found.id;
}

// The seeded demo vendors. Two are needed so one voucher can belong to somebody else.
const orgs = must(
  'vendor_organizations',
  await db
    .from('vendor_organizations')
    .select('id, trading_name')
    .in('trading_name', ['[Demo] Negril Sunset Cruises', '[Demo] Blue Mountain Coffee Tours'])
    .order('trading_name'),
);
const home = orgs.find((o) => o.trading_name === '[Demo] Negril Sunset Cruises');
let other = orgs.find((o) => o.id !== home?.id);
if (!home) {
  console.error('The Jamaica seed is not applied to this project (no [Demo] Negril Sunset Cruises).');
  process.exit(1);
}
if (!other) {
  other = must(
    'vendor_organizations',
    await db
      .from('vendor_organizations')
      .select('id, trading_name')
      .neq('id', home.id)
      .limit(1)
      .single(),
  );
}

const scannerId = await ensureUser(scannerEmail);
const nopermId = nopermEmail ? await ensureUser(nopermEmail) : null;

// Never change an existing person's role or permissions: only a membership this script would
// create, or one that already matches what it would write, is acceptable.
const existing = must(
  'vendor_members',
  await db
    .from('vendor_members')
    .select('user_id, role, can_scan_vouchers')
    .eq('vendor_org_id', home.id)
    .in('user_id', [scannerId, ...(nopermId ? [nopermId] : [])]),
);
for (const m of existing) {
  const want = m.user_id === scannerId;
  if (m.role !== 'vendor_staff' || m.can_scan_vouchers !== want) {
    console.error(
      `Refusing: user ${m.user_id} already has role ${m.role}, can_scan_vouchers ${m.can_scan_vouchers} at ${home.trading_name}. Use a fresh email.`,
    );
    process.exit(1);
  }
}
const touristId = await ensureUser(`scanner-test-guest-${randomUUID().slice(0, 8)}@example.invalid`);

must(
  'vendor_members',
  await db.from('vendor_members').upsert(
    [
      { vendor_org_id: home.id, user_id: scannerId, role: 'vendor_staff', can_scan_vouchers: true },
      ...(nopermId
        ? [{ vendor_org_id: home.id, user_id: nopermId, role: 'vendor_staff', can_scan_vouchers: false }]
        : []),
    ],
    { onConflict: 'vendor_org_id,user_id' },
  ),
);
must(
  'profiles',
  await db
    .from('profiles')
    .update({ display_name: 'Scanner Test' })
    .eq('id', scannerId)
    .is('display_name', null),
);

// A booking must point at an experience and slot the booking's own vendor owns.
async function experienceAndSlot(orgId) {
  const experience = must(
    'experiences',
    await db.from('experiences').select('id').eq('vendor_org_id', orgId).limit(1).single(),
  );
  const slot = must(
    'availability_slots',
    await db.from('availability_slots').select('id').eq('experience_id', experience.id).limit(1).single(),
  );
  return { experienceId: experience.id, slotId: slot.id };
}
const subjects = new Map([
  [home.id, await experienceAndSlot(home.id)],
  [other.id, await experienceAndSlot(other.id)],
]);

const day = 24 * 60 * 60 * 1000;
const bookingIds = [];
async function mintVoucher({ orgId, validFrom, validUntil, secret = hmacSecret, persist = true }) {
  const token = await signVoucherToken({ v: 1, id: generateVoucherId() }, secret);
  if (!persist) return token;
  const { experienceId, slotId } = subjects.get(orgId);
  const booking = must(
    'bookings',
    await db
      .from('bookings')
      .insert({
        user_id: touristId,
        vendor_org_id: orgId,
        experience_id: experienceId,
        availability_slot_id: slotId,
        reference: `VIPJ-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
        status: 'confirmed',
        currency: 'USD',
        subtotal_minor: 10000,
        tax_minor: 1500,
        service_fee_minor: 500,
        total_minor: 12000,
        commission_minor: 1200,
        seats: 1,
      })
      .select('id')
      .single(),
  );
  bookingIds.push(booking.id);
  must(
    'vouchers',
    await db.from('vouchers').insert({
      token_hash: await hashVoucherToken(token),
      user_id: touristId,
      booking_id: booking.id,
      vendor_org_id: orgId,
      state: 'active',
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
    }),
  );
  return token;
}

const now = Date.now();
const scenarios = [
  {
    file: '1-valid.png',
    title: 'Valid voucher',
    expect: 'ok. Admit the guest. Voucher is now burned.',
    token: await mintVoucher({ orgId: home.id, validFrom: new Date(now - day), validUntil: new Date(now + 7 * day) }),
  },
  {
    file: '2-scan-twice.png',
    title: 'Valid voucher, scan it TWICE',
    expect: 'First scan: ok. Second scan: already_redeemed, naming the first scan time and scanner.',
    token: await mintVoucher({ orgId: home.id, validFrom: new Date(now - day), validUntil: new Date(now + 7 * day) }),
  },
  {
    file: '3-expired.png',
    title: 'Expired voucher',
    expect: 'expired. Do not admit.',
    token: await mintVoucher({ orgId: home.id, validFrom: new Date(now - 8 * day), validUntil: new Date(now - day) }),
  },
  {
    file: '4-other-vendor.png',
    title: `Voucher for ${other.trading_name}`,
    expect: 'wrong_vendor. Do not admit.',
    token: await mintVoucher({ orgId: other.id, validFrom: new Date(now - day), validUntil: new Date(now + 7 * day) }),
  },
  {
    file: '5-forged.png',
    title: 'Forged QR (signed with the wrong secret, never stored)',
    expect: 'unknown_token. Do not admit. The attempt is still logged in voucher_redemptions.',
    token: await mintVoucher({ orgId: home.id, secret: 'x'.repeat(32), persist: false }),
  },
];

const out = new URL('../scanner-test-out/', import.meta.url);
await mkdir(out, { recursive: true });
for (const s of scenarios) {
  await writeFile(new URL(s.file, out), await QRCode.toBuffer(s.token, { width: 420, margin: 2 }));
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const rows = scenarios
  .map(
    (s) =>
      `<section><h2>${esc(s.title)}</h2><img src="${s.file}" width="320" height="320" alt="${esc(s.title)}"><p>${s.expect}</p></section>`,
  )
  .join('\n');
await writeFile(
  new URL('index.html', out),
  `<!doctype html><meta charset="utf-8"><title>Scanner test QR codes</title>
<style>body{font:16px system-ui;max-width:760px;margin:2rem auto;padding:0 1rem}section{margin:2rem 0}</style>
<h1>Scanner test QR codes</h1><p>Staging only. Scan with the vendor portal on a phone.</p>
${rows}`,
);

console.log(`Done. Signed in as ${scannerEmail}: scanner has can_scan_vouchers at ${home.trading_name}.`);
if (nopermEmail) console.log(`${nopermEmail} is staff WITHOUT can_scan_vouchers (expect the scanner to withhold itself).`);
console.log(`Guest user ${touristId}; bookings ${bookingIds.join(', ')}`);
console.log('Cleanup (SQL editor, staging):');
console.log(`  delete from vouchers where booking_id in (${bookingIds.map((b) => `'${b}'`).join(', ')});`);
console.log(`  delete from bookings where id in (${bookingIds.map((b) => `'${b}'`).join(', ')});`);
console.log(`Open ${new URL('index.html', out).pathname} and scan from the phone.`);
