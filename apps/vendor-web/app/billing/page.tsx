'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function formatCardNumber(raw: string): string {
  return raw
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function cardBrand(number: string): 'visa' | 'mastercard' | 'amex' | null {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]|^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  return null;
}

export default function BillingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    cardNumber: '',
    cardName: '',
    expiry: '',
    cvc: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const brand = cardBrand(form.cardNumber);
  const lastFour = form.cardNumber.replace(/\s/g, '').slice(-4);
  const displayName = form.cardName || 'YOUR NAME';
  const displayExpiry = form.expiry || 'MM / YY';

  const complete =
    form.cardNumber.replace(/\s/g, '').length >= 15 &&
    form.cardName.trim().length > 0 &&
    form.expiry.replace(/\D/g, '').length === 4 &&
    form.cvc.length >= 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 1200));
    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <>
        <header className="masthead">
          <div className="masthead__inner">
            <span className="crest" aria-hidden="true">
              <span className="crest__vip">VIP</span>
              <span className="crest__role">VENDOR</span>
            </span>
            <div>
              <p className="masthead__sub">All done</p>
              <h1 className="masthead__title">You&rsquo;re on the list</h1>
            </div>
          </div>
        </header>
        <main className="page">
          <div className="verdict verdict--ok">
            <p className="verdict__headline">Application submitted ✓</p>
            <p className="verdict__detail">
              Our team will review your profile and reach out within 1–2 business days. You&rsquo;ll
              receive an email at the address you signed up with when you&rsquo;re approved.
            </p>
            <div className="verdict__record">
              <span className="verdict__recordLabel">What happens next</span>
              <span className="verdict__recordValue">Account review</span>
              <span className="verdict__recordBy">
                Once approved, you can add listings and start accepting bookings.
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--full"
            onClick={() => router.push('/')}
          >
            Go to vendor portal
          </button>
          <p className="footnote">Demo build — no card was charged.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <span className="crest" aria-hidden="true">
            <span className="crest__vip">VIP</span>
            <span className="crest__role">VENDOR</span>
          </span>
          <div>
            <p className="masthead__sub">Step 2 of 2</p>
            <h1 className="masthead__title">Billing setup</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="onboard-progress">
          <div className="onboard-progress__bar" style={{ width: '100%' }} />
        </div>

        {/* Card preview */}
        <div className="card-preview" aria-hidden="true">
          <div className="card-preview__top">
            <span className="card-preview__brand">CARIBBEAN VIP</span>
            <CardBrandMark brand={brand} />
          </div>
          <div className="card-preview__number">
            {form.cardNumber || '•••• •••• •••• ••••'}
          </div>
          <div className="card-preview__bottom">
            <div>
              <p className="card-preview__label">Card holder</p>
              <p className="card-preview__value">{displayName}</p>
            </div>
            <div>
              <p className="card-preview__label">Expires</p>
              <p className="card-preview__value">{displayExpiry}</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'contents' }}>
          <section className="card">
            <div className="card__head">
              <h2>Payment method</h2>
              <p className="card__note">
                Used for platform fees only. You receive payouts separately via bank transfer.
                Caribbean VIP never stores raw card numbers.
              </p>
            </div>

            <label className="field">
              <span className="field__label">Card number</span>
              <input
                type="text"
                inputMode="numeric"
                className="input input--card"
                value={form.cardNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cardNumber: formatCardNumber(e.target.value) }))
                }
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                autoComplete="cc-number"
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Name on card</span>
              <input
                type="text"
                className="input"
                value={form.cardName}
                onChange={(e) => setForm((f) => ({ ...f, cardName: e.target.value.toUpperCase() }))}
                placeholder="AS PRINTED ON CARD"
                autoComplete="cc-name"
                required
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              />
            </label>

            <div className="card-row">
              <label className="field">
                <span className="field__label">Expiry</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input"
                  value={form.expiry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expiry: formatExpiry(e.target.value) }))
                  }
                  placeholder="MM / YY"
                  maxLength={7}
                  autoComplete="cc-exp"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">CVC</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input input--code"
                  value={form.cvc}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                  }
                  placeholder="•••"
                  maxLength={4}
                  autoComplete="cc-csc"
                  required
                />
              </label>
            </div>

            <div className="billing-trust">
              <LockIcon />
              <p className="billing-trust__text">
                Encrypted with TLS · PCI-DSS compliant · Never stored on Caribbean VIP servers
              </p>
            </div>
          </section>

          <button type="submit" disabled={busy || !complete} className="btn btn--primary btn--full">
            {busy ? 'Submitting application…' : 'Submit application →'}
          </button>

          <button type="button" className="btn btn--text" onClick={() => router.back()}>
            ← Back to business profile
          </button>
        </form>

        <p className="footnote">Demo build — no card is charged or stored.</p>
      </main>
    </>
  );
}

function CardBrandMark({ brand }: { brand: 'visa' | 'mastercard' | 'amex' | null }) {
  if (brand === 'visa') {
    return <span className="card-preview__brandmark card-preview__brandmark--visa">VISA</span>;
  }
  if (brand === 'mastercard') {
    return (
      <span className="card-preview__brandmark">
        <span className="mc-circle mc-circle--left" />
        <span className="mc-circle mc-circle--right" />
      </span>
    );
  }
  if (brand === 'amex') {
    return <span className="card-preview__brandmark card-preview__brandmark--amex">AMEX</span>;
  }
  return null;
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
