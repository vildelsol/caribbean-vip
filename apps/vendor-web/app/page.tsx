import { Scanner } from '../components/Scanner';

/**
 * Vendor portal home.
 *
 * The scanner is the landing page rather than a section inside a dashboard, because the moment a
 * vendor opens this on their phone they are standing in front of a guest holding up a QR code
 * (PRD §6). Everything else can wait a tap.
 */
const remaining = [
  { id: 'V-01', text: 'Submit an onboarding application with documents', milestone: 'M4' },
  { id: 'V-02', text: 'Publish listings once approved', milestone: 'M4' },
  { id: 'V-03', text: 'Define capacity and availability by date and time', milestone: 'M4' },
  { id: 'V-06', text: 'Create a geofenced promotion with expiry and rules', milestone: 'M6' },
  { id: 'V-07', text: 'See gross, platform fee and estimated net separately', milestone: 'M4' },
];

export default function VendorHome() {
  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">Vendor Portal</p>
            <h1 className="masthead__title">Redeem a voucher</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="card">
          <div className="card__head">
            <h2>Scan the guest&rsquo;s code</h2>
            <p className="card__note">
              Point the camera at their QR code, or type the code they read out. A voucher can only
              be redeemed once.
            </p>
          </div>
          <Scanner />
        </section>

        <section className="card">
          <div className="card__head">
            <h2>Still to come</h2>
            <p className="card__note">
              The portal ships with redemption because that is the half of the journey a guest
              stands in front of. The rest arrives with M4 and M6.
            </p>
          </div>
          <ul className="roadmap">
            {remaining.map((m) => (
              <li key={m.id} className="roadmap__item">
                <strong className="roadmap__id">{m.id}</strong>
                <span className="roadmap__text">{m.text}</span>
                <span className="roadmap__milestone">{m.milestone}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="footnote">
          Demo build — not connected to a live payment account or verified vendor records.
        </p>
      </main>
    </>
  );
}

/**
 * One mark, never redrawn per surface — the same disc, ring and serif lettering the tourist app
 * uses, with VENDOR where a guest sees their island. Drawn in type rather than shipped as an
 * image, so it stays crisp at any size and costs nothing in the bundle.
 */
function Crest() {
  return (
    <span className="crest" aria-hidden="true">
      <span className="crest__vip">VIP</span>
      <span className="crest__role">VENDOR</span>
    </span>
  );
}
