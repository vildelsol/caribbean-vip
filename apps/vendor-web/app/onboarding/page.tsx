'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVendorSession } from '../../lib/session';
import {
  ApplicationInvalid,
  ONBOARDING_BUSINESS_TYPES,
  ONBOARDING_LIMITS,
  loadIslands,
  submitApplication,
  type IslandOption,
} from '../../lib/onboarding';

/**
 * Step 1 of vendor onboarding — the application that creates the organisation.
 *
 * This screen used to collect six fields, sleep 800ms and route to /billing with nothing stored.
 * The write now goes through `lib/onboarding.ts`, which validates against `vendorApplicationSchema`
 * and calls one `security definer` RPC; see that module for why a single call rather than two
 * inserts, and why the island list is read from the database instead of hardcoded here.
 *
 * Every `maxLength` below is the third live layer under a limit that is also a Zod maximum and a
 * Postgres check constraint. A form that accepts what the database rejects is a submit button that
 * fails for reasons the applicant cannot see.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { refreshMemberships } = useVendorSession();
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    phone: '',
    islandId: '',
    businessType: '',
    description: '',
  });
  const [islands, setIslands] = useState<IslandOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The applicant cannot choose an island before the list arrives, so the select stays disabled
     until it does rather than briefly offering an empty dropdown. A failure here is reported in
     the same place as a failed submit: without an island there is no application to make. */
  useEffect(() => {
    let live = true;
    loadIslands()
      .then((rows) => {
        if (live) setIslands(rows);
      })
      .catch((e: unknown) => {
        if (live) {
          setError(
            `Could not load the island list. ${e instanceof Error ? e.message : 'Please reload.'}`,
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  /**
   * `ApplicationInvalid` is the applicant's to fix and says what to change. Anything else reached
   * the network or the database, so it is reported as ours — the same split `listings.ts` makes,
   * because telling someone their business name is wrong after a dropped connection sends them
   * rewriting a field that was already fine.
   *
   * Only a successful write routes on. The old handler always advanced, so a vendor reached
   * /billing believing they had applied.
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitApplication(form);
      // The new vendor_members row is not in the session's cached list; without this the gate
      // still sees no organisation and sends the applicant back to /onboarding.
      refreshMemberships();
      router.push('/billing');
    } catch (err) {
      if (err instanceof ApplicationInvalid) setError(err.message);
      else {
        setError(
          `Could not submit your application. ${err instanceof Error ? err.message : 'Please try again.'}`,
        );
      }
      setBusy(false);
    }
  };

  const complete =
    form.businessName && form.contactName && form.phone && form.islandId && form.businessType;

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <span className="crest" aria-hidden="true">
            <span className="crest__vip">VIP</span>
            <span className="crest__role">VENDOR</span>
          </span>
          <div>
            <p className="masthead__sub">Step 1 of 2</p>
            <h1 className="masthead__title">Business profile</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="onboard-progress">
          <div className="onboard-progress__bar" style={{ width: '50%' }} />
        </div>

        <form onSubmit={submit} style={{ display: 'contents' }}>
          <section className="card">
            <div className="card__head">
              <h2>About your business</h2>
              <p className="card__note">
                This information appears on your Caribbean VIP listing and is reviewed by our team
                before your account goes live.
              </p>
            </div>

            <label className="field">
              <span className="field__label">Business name</span>
              <input
                type="text"
                className="input"
                value={form.businessName}
                onChange={set('businessName')}
                maxLength={ONBOARDING_LIMITS.businessName}
                placeholder="e.g. Blue Lagoon Adventures"
                required
                autoComplete="organization"
              />
            </label>

            <label className="field">
              <span className="field__label">Your name</span>
              <input
                type="text"
                className="input"
                value={form.contactName}
                onChange={set('contactName')}
                maxLength={ONBOARDING_LIMITS.contactName}
                placeholder="Primary contact"
                required
                autoComplete="name"
              />
            </label>

            <label className="field">
              <span className="field__label">Phone number</span>
              <input
                type="tel"
                className="input"
                value={form.phone}
                onChange={set('phone')}
                maxLength={ONBOARDING_LIMITS.phone}
                placeholder="+1 876 000 0000"
                required
                autoComplete="tel"
              />
            </label>

            <label className="field">
              <span className="field__label">Island / Territory</span>
              {/* The options are the active islands, read through `islands_public_read`. The list
                  used to be ten hardcoded slugs against a not-null FK to a four-row table, so six
                  of them named a market that does not exist. */}
              <select
                className="input"
                value={form.islandId}
                onChange={set('islandId')}
                required
                disabled={islands.length === 0}
              >
                <option value="" disabled>
                  {islands.length === 0 ? 'Loading islands…' : 'Select your island…'}
                </option>
                {islands.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Business type</span>
              <select className="input" value={form.businessType} onChange={set('businessType')} required>
                <option value="" disabled>Select a category…</option>
                {ONBOARDING_BUSINESS_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Short description <span className="field__optional">optional</span></span>
              <textarea
                className="input"
                maxLength={ONBOARDING_LIMITS.description}
                value={form.description}
                onChange={set('description')}
                rows={3}
                placeholder="Tell guests what makes your experience special…"
                style={{ resize: 'vertical' }}
              />
              {/* Both numbers come from the constant the Postgres constraint mirrors. The counter
                  read /280 while the column allowed 600, so it called a valid blurb over-length. */}
              <p className="field__hint">
                {form.description.length}/{ONBOARDING_LIMITS.description} characters
              </p>
            </label>

            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>

          <button type="submit" disabled={busy || !complete} className="btn btn--primary btn--full">
            {busy ? 'Submitting…' : 'Continue to billing →'}
          </button>
        </form>

        <p className="footnote">
          Your information is reviewed within 1–2 business days. You&rsquo;ll receive an email
          when your account is approved.
        </p>
      </main>
    </>
  );
}
