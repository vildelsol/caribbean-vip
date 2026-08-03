import { useNavigate } from 'react-router-dom';
import { ISLANDS, destinationsFor, experienceById, heroUrl, islandById } from '../data/catalogue';
import { useStore } from '../state/store';
import { Badge, Card, DemoNote, EmptyState, Photo, SecondaryButton, formatUsd } from '../components/kit';
import { Icon } from '../components/Icon';
import './Profile.css';

/**
 * Profile — island switching, the wallet, saved listings, and the demonstration controls.
 *
 * The island switcher lives here as well as on Explore because switching island is the single most
 * important thing this product does that a single-market competitor cannot, and an investor
 * audience should never have to hunt for it.
 */
export function Profile() {
  const { state, dispatch, reset } = useStore();
  const navigate = useNavigate();

  const island = islandById(state.islandId);
  const saved = state.savedExperienceIds
    .map((id) => experienceById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const confirmed = state.bookings.filter((b) => b.status === 'confirmed');
  const spentMinor = confirmed.reduce((s, b) => s + b.totalMinor, 0);

  return (
    <main className="screen profile">
      <header className="profile__head">
        <span className="crest" aria-hidden>
          <span className="crest__vip">VIP</span>
          <span className="crest__island">{island?.name.toUpperCase() ?? 'CARIBBEAN'}</span>
        </span>
        <div>
          <h1 className="t-display-md">Alex Bennett</h1>
          <p className="t-caption c-muted">Guest · {island?.in_app_brand}</p>
        </div>
      </header>

      <section className="pad profile__stats">
        <div className="stat">
          <span className="t-amount-sm c-brand">{confirmed.length}</span>
          <span className="t-micro c-muted">Bookings</span>
        </div>
        <div className="stat">
          <span className="t-amount-sm c-brand">{formatUsd(spentMinor)}</span>
          <span className="t-micro c-muted">Total</span>
        </div>
        <div className="stat">
          <span className="t-amount-sm c-brand">{state.vouchers.length}</span>
          <span className="t-micro c-muted">Vouchers</span>
        </div>
      </section>

      {/* --- Island switching --- */}
      <section className="pad profile__block">
        <h2 className="t-section">Your island</h2>
        <p className="t-caption c-muted profile__hint">
          One app, every island. The brand, navigation and card system never change — only the
          destination, imagery, currency and local inventory do.
        </p>
        <div className="col profile__islands">
          {ISLANDS.map((i) => {
            const on = i.id === state.islandId;
            const first = destinationsFor(i.id)[0];
            return (
              <button
                key={i.id}
                type="button"
                className={`island-row ${on ? 'is-on' : ''}`}
                onClick={() => dispatch({ type: 'selectIsland', islandId: i.id })}
                aria-pressed={on}
              >
                <Photo
                  src={`${import.meta.env.BASE_URL}demo/${i.hero_media_path ?? 'jm-hero'}.jpg`}
                  alt=""
                  ratio="1 / 1"
                  radius="var(--r-sm)"
                  className="island-row__photo"
                />
                <span className="grow island-row__text">
                  <span className="t-micro-strong c-premium">CARIBBEAN VIP</span>
                  <span className="t-caption-strong island-row__name">{i.in_app_brand}</span>
                  <span className={`t-micro ${on ? 'c-locator' : 'c-muted'}`}>
                    {first?.name}
                    {on ? ' · current' : ''}
                  </span>
                </span>
                {on ? <Icon name="check" size={18} color="var(--green-900)" strokeWidth={2.4} /> : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* --- Vouchers --- */}
      <section className="pad profile__block">
        <h2 className="t-section">Voucher wallet</h2>
        {state.vouchers.length === 0 ? (
          <p className="t-caption c-muted profile__hint">
            No vouchers yet. Offers appear when you are near a participating vendor.
          </p>
        ) : (
          <div className="col profile__vouchers">
            {state.vouchers.map((v) => (
              <Card key={v.id} className="voucher-row">
                <div className="row voucher-row__inner">
                  <span className="voucher-row__icon">
                    <Icon name="ticket" size={18} color="var(--on-dark)" />
                  </span>
                  <div className="grow">
                    <p className="t-caption-strong">Complimentary Rum Punch</p>
                    <p className="t-micro c-muted">One per adult guest · demo offer</p>
                  </div>
                  <Badge
                    tone={
                      v.state === 'redeemed' ? 'muted' : v.state === 'expired' ? 'muted' : v.state === 'attached' ? 'brand' : 'aqua'
                    }
                  >
                    {v.state}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- Saved --- */}
      <section className="pad profile__block">
        <h2 className="t-section">Saved</h2>
        {saved.length === 0 ? (
          <EmptyState
            icon="heart"
            title="Nothing saved yet"
            body="Tap the heart on any experience to keep it here."
            action="Browse experiences"
            onAction={() => navigate('/')}
          />
        ) : (
          <div className="col profile__saved">
            {saved.map((e) => (
              <Card key={e.id} className="saved-row" onClick={() => navigate(`/experience/${e.id}`)}>
                <div className="row saved-row__inner">
                  <Photo
                    src={heroUrl(e)}
                    mediaKey={e.media[0]}
                    alt=""
                    ratio="1 / 1"
                    radius="var(--r-sm)"
                    className="saved-row__photo"
                  />
                  <div className="grow">
                    <p className="t-caption-strong">{e.title}</p>
                    <p className="t-micro c-locator">from {formatUsd(e.fromAmountMinor)}</p>
                  </div>
                  <button
                    type="button"
                    className="saved-row__remove"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      dispatch({ type: 'toggleSaved', experienceId: e.id });
                    }}
                    aria-label={`Remove ${e.title} from saved`}
                  >
                    <Icon name="close" size={16} color="var(--ink-faint)" strokeWidth={2.2} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* --- Demonstration controls --- */}
      <section className="pad profile__block">
        <h2 className="t-section">Demonstration</h2>
        <div className="sim-note">
          <p className="t-caption-strong">What is simulated</p>
          <ul className="t-caption c-muted sim-note__list">
            <li>Payment is simulated — no card is charged and no payment processor is contacted.</li>
            <li>Position is simulated at the centre of the selected destination, not from your device.</li>
            <li>The offer is triggered on a timer rather than by a real geofence.</li>
            <li>Irie AI is rule-matched over the demo catalogue — there is no language model.</li>
            <li>Inventory, ratings and review counts are seeded demonstration data.</li>
          </ul>
        </div>
        <SecondaryButton onClick={reset}>Reset the demonstration</SecondaryButton>
        <p className="t-micro c-faint profile__reset-note">
          Clears bookings, vouchers, saved items and the day plan, and returns to {ISLANDS[0]?.in_app_brand}.
        </p>
      </section>

      <DemoNote>Demonstration build · not a live account</DemoNote>
    </main>
  );
}
