import { Crest } from '../../components/Crest';
import { Scanner } from '../../components/Scanner';

export default function ScanPage() {
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
      </main>
    </>
  );
}
