import { describe, expect, it } from 'vitest';
import {
  createBrowserClient,
  createLazyBrowserClient,
  createServiceClient,
  looksLikeServiceRoleKey,
} from './client';

/** Build a JWT-shaped string with the given role claim. Not signed — only the shape matters. */
function fakeKey(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.signature`;
}

const URL = 'https://example.supabase.co';

describe('service-role key detection (PRD §14)', () => {
  it('recognises a service-role key', () => {
    expect(looksLikeServiceRoleKey(fakeKey('service_role'))).toBe(true);
  });

  it('does not flag an anon key', () => {
    expect(looksLikeServiceRoleKey(fakeKey('anon'))).toBe(false);
  });

  it('never throws on malformed input', () => {
    for (const junk of ['', 'not-a-jwt', 'a.b', 'a.b.c', '...', '%%%.%%%.%%%']) {
      expect(() => looksLikeServiceRoleKey(junk)).not.toThrow();
      expect(looksLikeServiceRoleKey(junk)).toBe(false);
    }
  });
});

describe('createBrowserClient', () => {
  it('refuses a service-role key — this is the misconfiguration that would disable all RLS', () => {
    expect(() => createBrowserClient({ url: URL, anonKey: fakeKey('service_role') })).toThrow(
      /service-role key/i,
    );
  });

  it('accepts an anon key', () => {
    expect(() => createBrowserClient({ url: URL, anonKey: fakeKey('anon') })).not.toThrow();
  });

  it('fails loudly on missing configuration rather than starting half-configured', () => {
    expect(() => createBrowserClient({ url: '', anonKey: fakeKey('anon') })).toThrow(/required/i);
    expect(() => createBrowserClient({ url: URL, anonKey: '' })).toThrow(/required/i);
  });
});

describe('createLazyBrowserClient', () => {
  it('does not construct — or throw — at creation time', () => {
    // The point of the lazy wrapper: an unconfigured app must still import and prerender.
    expect(() => createLazyBrowserClient({ url: '', anonKey: '' })).not.toThrow();
  });

  it('throws on first use instead, so the failure is accurate rather than silent', () => {
    const client = createLazyBrowserClient({ url: '', anonKey: '' });
    expect(() => client.from('islands')).toThrow(/required/i);
  });

  it('still refuses a service-role key, just at first use', () => {
    const client = createLazyBrowserClient({ url: URL, anonKey: fakeKey('service_role') });
    expect(() => client.from('islands')).toThrow(/service-role key/i);
  });

  it('works normally once configured', () => {
    const client = createLazyBrowserClient({ url: URL, anonKey: fakeKey('anon') });
    expect(() => client.from('islands')).not.toThrow();
  });
});

describe('createServiceClient', () => {
  it('refuses to run in a browser', () => {
    const g = globalThis as { window?: unknown };
    g.window = {};
    try {
      expect(() => createServiceClient({ url: URL, serviceRoleKey: fakeKey('service_role') })).toThrow(
        /browser/i,
      );
    } finally {
      delete g.window;
    }
  });

  it('works server-side', () => {
    expect(() =>
      createServiceClient({ url: URL, serviceRoleKey: fakeKey('service_role') }),
    ).not.toThrow();
  });
});
