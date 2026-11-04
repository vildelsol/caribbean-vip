import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminHeaders, touristHeaders, vendorHeaders } from './securityHeaders.mjs';

const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value ?? '';

describe.each([
  ['tourist', touristHeaders],
  ['admin', adminHeaders],
  ['vendor', vendorHeaders],
])('%s security headers', (_n, headers) => {
  it.each(['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy',
    'Content-Security-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy'])('sets %s', (k) => {
    expect(get(headers, k)).not.toBe('');
  });
  const csp = get(headers, 'Content-Security-Policy');
  it('forbids framing, plugins and base-tag injection', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
  it('never allows a wildcard or eval for scripts', () => {
    const script = csp.split('; ').find((d) => d.startsWith('script-src')) ?? '';
    expect(script).not.toMatch(/\*|unsafe-eval|https?:/);
  });
  it('connects only to self and Supabase', () => {
    const c = csp.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
    expect(c).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
  });
});

describe('tourist app', () => {
  it('allows no inline script', () => {
    const script = get(touristHeaders, 'Content-Security-Policy').split('; ').find((d) => d.startsWith('script-src'));
    expect(script).toBe("script-src 'self'");
  });
  it('vercel.json carries exactly the generated headers', () => {
    const cfg = JSON.parse(readFileSync(new URL('../apps/tourist-web/vercel.json', import.meta.url), 'utf8'));
    const all = cfg.headers.find((h: { source: string }) => h.source === '/(.*)');
    expect(all?.headers).toEqual(touristHeaders);
  });
  it('index.html has no inline script the CSP would block', () => {
    const html = readFileSync(new URL('../apps/tourist-web/index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  });
});

describe('next apps', () => {
  it.each(['admin-web', 'vendor-web'])('%s applies the shared headers and hides x-powered-by', (a) => {
    const src = readFileSync(new URL(`../apps/${a}/next.config.mjs`, import.meta.url), 'utf8');
    expect(src).toContain(`headers: nextHeaders('${a.split('-')[0]}')`);
    expect(src).toContain('poweredByHeader: false');
  });
});

describe('camera permission', () => {
  it('is granted only to the vendor scanner', () => {
    expect(get(vendorHeaders, 'Permissions-Policy')).toContain('camera=(self)');
    expect(get(adminHeaders, 'Permissions-Policy')).toContain('camera=()');
    expect(get(touristHeaders, 'Permissions-Policy')).toContain('camera=()');
  });
});

describe('CI scans', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  it('runs the secret scan and the dependency audit', () => {
    expect(ci).toContain('scripts/scan-secrets.sh');
    expect(ci).toContain('pnpm audit --prod --audit-level=high');
  });
});
