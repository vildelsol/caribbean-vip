'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ISLANDS = [
  { id: 'jamaica',    label: 'Jamaica' },
  { id: 'barbados',   label: 'Barbados' },
  { id: 'st_lucia',   label: 'St. Lucia' },
  { id: 'trinidad',   label: 'Trinidad & Tobago' },
  { id: 'bahamas',    label: 'The Bahamas' },
  { id: 'antigua',    label: 'Antigua & Barbuda' },
  { id: 'grenada',    label: 'Grenada' },
  { id: 'bvi',        label: 'British Virgin Islands' },
  { id: 'cayman',     label: 'Cayman Islands' },
  { id: 'other',      label: 'Other / Multiple islands' },
];

const BUSINESS_TYPES = [
  { id: 'tour',       label: 'Tours & Excursions' },
  { id: 'food',       label: 'Restaurant / Food & Drink' },
  { id: 'wellness',   label: 'Wellness & Spa' },
  { id: 'water',      label: 'Water Sports' },
  { id: 'culture',    label: 'Cultural Experience' },
  { id: 'transport',  label: 'Transportation' },
  { id: 'retail',     label: 'Retail / Shopping' },
  { id: 'other',      label: 'Other' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    phone: '',
    island: '',
    businessType: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 800));
    setBusy(false);
    router.push('/billing');
  };

  const complete = form.businessName && form.contactName && form.phone && form.island && form.businessType;

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
                placeholder="+1 876 000 0000"
                required
                autoComplete="tel"
              />
            </label>

            <label className="field">
              <span className="field__label">Island / Territory</span>
              <select className="input" value={form.island} onChange={set('island')} required>
                <option value="" disabled>Select your island…</option>
                {ISLANDS.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Business type</span>
              <select className="input" value={form.businessType} onChange={set('businessType')} required>
                <option value="" disabled>Select a category…</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Short description <span className="field__optional">optional</span></span>
              <textarea
                className="input"
                value={form.description}
                onChange={set('description')}
                rows={3}
                placeholder="Tell guests what makes your experience special…"
                style={{ resize: 'vertical' }}
              />
              <p className="field__hint">{form.description.length}/280 characters</p>
            </label>
          </section>

          <button type="submit" disabled={busy || !complete} className="btn btn--primary btn--full">
            {busy ? 'Saving…' : 'Continue to billing →'}
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
