import { useNavigate } from 'react-router-dom';
import {
  ISLANDS,
  destinationBySlug,
  destinationsFor,
  experienceById,
  heroUrl,
  islandById,
  allInFromMinor,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { Badge, Card, EmptyState, Photo, SecondaryButton, formatUsd } from '../components/kit';
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
  const destination = destinationBySlug(state.destinationSlug);
  const saved = state.savedExperienceIds
    .map((id) => experienceById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const confirmed = state.bookings.filter((b) => b.status === 'confirmed');
  const spentMinor = confirmed.reduce((s, b) => s + b.totalMinor, 0);

  return (
    <main className="screen profile">
      {/* Premium dark hero — full-bleed, centered VIP crest + name */}
      <div className="profile__hero">
        <div className="profile__hero-inner">
          <span className="profile__hero-crest" aria-hidden>
            <span className="profile__crest-vip">VIP</span>
            <span className="profile__crest-island">{island?.name.toUpperCase() ?? 'CARIBBEAN'}</span>
          </span>
          <h1 className="profile__hero-name">{state.guestName || 'Guest'}</h1>
          {/*
            * The subtitle used to read "Guest · VIP Jamaica" directly beneath a
            * heading that already said "Guest" — the app told an unnamed visitor
            * their own non-name twice in two lines. It states where they are
            * instead, which is the one thing this header can usefully add.
            */}
          <p className="profile__hero-sub">
            {island?.in_app_brand}
            {destination ? ` · ${destination.name}` : ''}
          </p>
        </div>

        {/* Stats glass row inside the hero */}
        <div className="profile__stats-glass">
          <div className="profile__stat-pill">
            <span className="profile__stat-value">{confirmed.length}</span>
            <span className="profile__stat-label">Bookings</span>
          </div>
          <span className="profile__stat-divider" aria-hidden />
          <div className="profile__stat-pill">
            <span className="profile__stat-value">{formatUsd(spentMinor)}</span>
            <span className="profile__stat-label">Spent</span>
          </div>
          <span className="profile__stat-divider" aria-hidden />
          <div className="profile__stat-pill">
            <span className="profile__stat-value">{state.vouchers.length}</span>
            <span className="profile__stat-label">Vouchers</span>
          </div>
        </div>
      </div>

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
                    <p className="t-micro c-muted">One per adult guest</p>
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
            {/*
              The row carries two independent actions — open, and remove — so the card itself is a
              plain container with two sibling buttons inside it. Making the card tappable and
              nesting the remove control in it puts a <button> inside a <button>, which is invalid
              HTML: React warns, and the browser's own parser recovery moves the inner control out
              of the outer one, so what ships is not the tree that was written.
            */}
            {saved.map((e) => (
              <Card key={e.id} className="saved-row">
                <div className="row saved-row__inner">
                  <button
                    type="button"
                    className="row grow saved-row__open"
                    onClick={() => navigate(`/experience/${e.id}`)}
                  >
                    <Photo
                      src={heroUrl(e)}
                      mediaKey={e.media[0]}
                      alt=""
                      ratio="1 / 1"
                      radius="var(--r-sm)"
                      className="saved-row__photo"
                    />
                    <span className="grow saved-row__text">
                      <span className="t-caption-strong">{e.title}</span>
                      <span className="t-micro c-locator">from {formatUsd(allInFromMinor(e))}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="saved-row__remove"
                    onClick={() => dispatch({ type: 'toggleSaved', experienceId: e.id })}
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

      <section className="pad profile__block">
        <h2 className="t-section">Photography</h2>
        <p className="t-caption c-muted profile__hint">
          Every photograph in the app, with the photographer and the licence it is used under.
        </p>
        <SecondaryButton onClick={() => navigate('/credits')}>Photo credits</SecondaryButton>
      </section>

      <section className="pad profile__block">
        <h2 className="t-section">Start over</h2>
        <SecondaryButton onClick={reset}>Reset this device</SecondaryButton>
        <p className="t-micro c-faint profile__reset-note">
          Clears bookings, vouchers, saved items and the day plan, and returns to {ISLANDS[0]?.in_app_brand}.
        </p>
      </section>

    </main>
  );
}
