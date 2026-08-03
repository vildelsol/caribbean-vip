import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyTicket } from '../data/ticket';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { DemoNote, PrimaryButton, SecondaryButton } from '../components/kit';
import './Redeem.css';

/**
 * The vendor side of the journey, on the guest's own device.
 *
 * The real product scans this from `apps/vendor-web` on a separate machine. Reproducing that inside
 * the tourist demo would need two devices and a network, so this stands in — and it is honest about
 * being the same device. What it does **not** fake is the interesting part:
 *
 *  - The signature is genuinely verified by `verifyVoucherToken` from `@cvip/types`, before any
 *    state is consulted. Change one character and it fails on the HMAC, not on a lookup.
 *  - Redemption is terminal. The second scan of the same token reports the original time and who
 *    took it, because the reducer refuses to move a `redeemed` voucher again. That transition —
 *    the one-way door — is the most convincing thing in the whole demonstration, and it is the
 *    thing a screenshot cannot fake.
 */
type Outcome =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; reference: string }
  | { kind: 'already'; at: string; by: string }
  | { kind: 'no_voucher' }
  | { kind: 'unknown' }
  | { kind: 'bad_signature' }
  | { kind: 'malformed' };

export function Redeem() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const [token, setToken] = useState(params.get('token') ?? '');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const check = async () => {
    setOutcome({ kind: 'checking' });
    // The beat is where a presenter says "this is the signature check, not a database call".
    await new Promise((r) => setTimeout(r, 450));

    const verdict = await verifyTicket(token.trim());
    if (!verdict.ok) {
      setOutcome({ kind: verdict.reason === 'invalid_signature' ? 'bad_signature' : 'malformed' });
      return;
    }

    const booking = state.bookings.find((b) => b.id === verdict.id);
    if (!booking) {
      // Correctly signed, but not a booking this device knows. A real deployment resolves this
      // against the database; here it is simply reported rather than adopted.
      setOutcome({ kind: 'unknown' });
      return;
    }

    const voucher = booking.voucherId ? state.vouchers.find((v) => v.id === booking.voucherId) : undefined;
    if (!voucher) {
      setOutcome({ kind: 'no_voucher' });
      return;
    }
    if (voucher.state === 'redeemed') {
      setOutcome({
        kind: 'already',
        at: voucher.redeemedAtISO ? new Date(voucher.redeemedAtISO).toLocaleString('en-GB') : 'earlier',
        by: voucher.redeemedBy ?? 'a staff member',
      });
      return;
    }

    dispatch({ type: 'redeemVoucher', voucherId: voucher.id, by: 'Front desk' });
    setOutcome({ kind: 'ok', reference: booking.reference });
  };

  const tamper = () => {
    // Flip the final character to demonstrate that the signature, not the lookup, is what rejects.
    const t = token.trim();
    if (!t) return;
    const last = t.slice(-1);
    setToken(t.slice(0, -1) + (last === 'A' ? 'B' : 'A'));
    setOutcome({ kind: 'idle' });
  };

  return (
    <main className="screen redeem">
      <header className="redeem__head">
        <button type="button" className="round-btn round-btn--light" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="chevron-left" size={17} strokeWidth={2.2} />
        </button>
        <div>
          <h1 className="t-body-strong">Validate a ticket</h1>
          <p className="t-micro c-faint">Vendor view · stands in for the scanner</p>
        </div>
      </header>

      <p className="redeem__note t-micro">
        <Icon name="shield-check" size={14} color="var(--green-900)" strokeWidth={2.2} />
        The signature is checked before anything is looked up, so a tampered code is rejected without
        touching a booking. In the real product this screen is the vendor&rsquo;s own device.
      </p>

      <section className="redeem__field">
        <label className="t-caption-strong" htmlFor="token">
          Scanned token
        </label>
        <textarea
          id="token"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setOutcome({ kind: 'idle' });
          }}
          rows={4}
          spellCheck={false}
          placeholder="cvip://v1/…"
        />
        <div className="redeem__buttons">
          <PrimaryButton onClick={check} disabled={!token.trim() || outcome.kind === 'checking'}>
            {outcome.kind === 'checking' ? 'Checking…' : 'Validate'}
          </PrimaryButton>
          <SecondaryButton onClick={tamper} disabled={!token.trim()}>
            Tamper with one character
          </SecondaryButton>
        </div>
      </section>

      {outcome.kind !== 'idle' && outcome.kind !== 'checking' ? (
        <section className={`verdict verdict--${tone(outcome.kind)}`} role="status" aria-live="polite">
          <span className="verdict__icon">
            <Icon
              name={tone(outcome.kind) === 'ok' ? 'check' : tone(outcome.kind) === 'warn' ? 'clock' : 'close'}
              size={20}
              color="var(--on-dark)"
              strokeWidth={2.6}
            />
          </span>
          <div className="grow">
            <h2 className="t-body-strong">{title(outcome)}</h2>
            <p className="t-caption">{body(outcome)}</p>
          </div>
        </section>
      ) : null}

      <DemoNote>Demonstration · one device standing in for two</DemoNote>
    </main>
  );
}

function tone(kind: Outcome['kind']): 'ok' | 'warn' | 'bad' {
  if (kind === 'ok') return 'ok';
  if (kind === 'already' || kind === 'unknown' || kind === 'no_voucher') return 'warn';
  return 'bad';
}

function title(o: Outcome): string {
  switch (o.kind) {
    case 'ok':
      return 'Valid — admit the guest';
    case 'already':
      return 'Already redeemed';
    case 'no_voucher':
      return 'Valid ticket, no voucher';
    case 'unknown':
      return 'Signed, but not known here';
    case 'bad_signature':
      return 'Invalid signature';
    default:
      return 'Not a Caribbean VIP ticket';
  }
}

function body(o: Outcome): string {
  switch (o.kind) {
    case 'ok':
      return `Booking ${o.reference}. The voucher is now redeemed, and a second scan will say so.`;
    case 'already':
      return `This voucher was taken ${o.at} by ${o.by}. Redemption is one-way and cannot be repeated.`;
    case 'no_voucher':
      return 'The booking is genuine but has no voucher attached, so there is nothing to redeem.';
    case 'unknown':
      return 'The signature is genuine but this device holds no such booking. A real deployment would resolve it against the database.';
    case 'bad_signature':
      return 'The code was altered after it was issued. It was rejected on the signature, before any booking was consulted.';
    default:
      return 'The code could not be read as a voucher token at all.';
  }
}
