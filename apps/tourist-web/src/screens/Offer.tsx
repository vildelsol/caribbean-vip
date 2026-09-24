import { useNavigate } from 'react-router-dom';
import {
  PROMOTION,
  destinationBySlug,
  heroUrl,
  promotedExperienceNear,
  simulatedPosition,
  travelToExperience,
  vendorFor,
} from '../data/catalogue';
import { useStore } from '../state/store';
import { Icon } from '../components/Icon';
import { GoldButton, Photo, PrimaryButton } from '../components/kit';
import './Offer.css';

/**
 * The geofenced offer.
 *
 * The design is emphatic that this is **a gift from nearby, not an advertisement**: it is drawn as
 * a ticket with notched edges and a dashed perforation, it names the place the guest is standing
 * next to, it states the walk, and it expires today. One reward at a time, so it reads as local
 * hospitality rather than as inventory being sold.
 *
 * ## What is simulated
 *
 * The trigger. A real geofence needs a background location subscription and a push channel, both of
 * which are M6 and neither of which exists here; the browser's own geolocation is deliberately not
 * requested either, because a presenter who declines the prompt — or a desktop that answers with an
 * office in another country — turns the whole proximity story off mid-demonstration. So this fires
 * on a timer from Explore, once per island, and the screen says on its face that the trigger is
 * simulated. The *consent* rule it would obey is real and lives in `states.ts`.
 */
export function Offer() {
  const navigate = useNavigate();
  const { state, dispatch } = useStore();

  const destination = destinationBySlug(state.destinationSlug);
  /*
   * The promoted listing *here* — not merely the one somewhere on this island.
   *
   * Selecting by island put the Negril jetty on screen under the words "A few minutes from Ocho
   * Rios", 130 km away. The dataset had the coordinates right the whole time; the screen was
   * asserting a proximity nobody had checked, on the one screen whose entire claim is proximity.
   * `promotedExperienceNear` matches the issuing vendor's own destination, and returns nothing
   * when the guest is not in it — see the note there for why a metre radius cannot do this job
   * against a simulated town centroid.
   */
  const experience = destination
    ? promotedExperienceNear(state.islandId, state.destinationSlug)
    : undefined;
  const vendor = experience ? vendorFor(experience) : undefined;

  /*
   * The walk or the drive, measured rather than asserted.
   *
   * Even inside the right town the distance is a real number — the Negril jetty is 2.4 km from the
   * centre of Negril, which is a short drive and not "a few minutes" on foot. Stating what it is
   * costs nothing and means the line survives someone checking it.
   */
  const trip =
    experience && destination
      ? travelToExperience(simulatedPosition(destination), experience)
      : undefined;

  const held = state.vouchers.find(
    (v) => v.promotionId === PROMOTION.id && (v.state === 'available' || v.state === 'attached'),
  );

  const dismiss = () => navigate(-1);

  if (!experience) {
    // Nothing *near the guest* qualifies. Better to leave than to invent proximity.
    navigate('/', { replace: true });
    return null;
  }

  return (
    <main className="screen screen--deep offer">
      <div className="offer__rings" aria-hidden>
        <span className="offer__ring offer__ring--out" />
        <span className="offer__ring offer__ring--in" />
        <span className="offer__dot" />
      </div>

      {/*
        * The screen's own headline, above the ticket.
        *
        * "Caribbean VIP · nearby now" in 11px gold caps was a label, and a label
        * is not an opening line. This is the reference board's, and the script
        * on the last word is the whole point of it: the sentence turns from a
        * statement into a flourish exactly where the offer does.
        *
        * The script is `--font-script` (Parisienne), used here and nowhere else
        * — one word on one screen. A second use makes it a typeface; one use
        * keeps it a moment.
        */}
      <header className="offer__intro">
        <h1 className="offer__title">
          You&rsquo;re Near Something
          <span className="offer__title-script">Special</span>
        </h1>
        <span className="offer__pin" aria-hidden="true">
          <Icon name="pin" size={15} color="var(--green-950)" strokeWidth={2} />
        </span>
      </header>

      <article className="voucher">
        <button type="button" className="voucher__close" onClick={dismiss} aria-label="Dismiss this offer">
          <Icon name="close" size={13} strokeWidth={2.2} />
        </button>

        <div className="voucher__top">
          <span className="voucher__mark">
            <Icon name="ticket" size={20} color="var(--on-dark)" />
          </span>
          {/* "YOU'RE NEAR" used to sit here. The screen's own headline now opens
              with those words, and a card that repeats its screen's first three
              words reads as a template rather than as a message. */}
          <h2 className="t-display-md voucher__place">{vendor?.location.name ?? experience.title}</h2>
          <p className="voucher__walk">
            <Icon
              name={trip?.travel.mode === 'drive' ? 'car' : 'walk'}
              size={13}
              color="var(--teal-text)"
              strokeWidth={2.2}
            />
            <span className="t-micro-strong">
              {trip && destination
                ? `${trip.travel.minutes} min ${trip.travel.mode} from ${destination.name}`
                : destination
                  ? `In ${destination.name}`
                  : 'Nearby'}
            </span>
          </p>
        </div>

        <div className="voucher__photo">
          <Photo
            src={heroUrl(experience)}
            mediaKey={experience.media[0]}
            alt={experience.title}
            ratio="21 / 9"
            radius="var(--r-md)"
          />
        </div>

        <div className="voucher__perf" aria-hidden>
          <span className="voucher__notch voucher__notch--l" />
          <span className="voucher__notch voucher__notch--r" />
        </div>

        <div className="voucher__bottom">
          <p className="t-overline voucher__label">A little something nearby</p>
          <h2 className="t-display-sm voucher__headline">
            Complimentary rum punch
            <br />
            with today&rsquo;s booking
          </h2>
          <p className="voucher__expiry t-micro-strong">
            <span className="voucher__expiry-dot" />
            Offer expires today at 6:00 PM
          </p>

          <div className="voucher__actions">
            <PrimaryButton onClick={() => navigate(`/experience/${experience.id}`)}>
              View experience
            </PrimaryButton>
            <GoldButton
              onClick={() => {
                dispatch({ type: 'saveVoucher', promotionId: PROMOTION.id });
                navigate('/profile');
              }}
              disabled={Boolean(held)}
            >
              <Icon name="bookmark" size={15} color="var(--gold-text)" strokeWidth={2} />
              {held ? 'Saved to your wallet' : 'Save offer'}
            </GoldButton>
            {/*
              * "Not now" used to sit here, and it did exactly what the × in the
              * corner does. Two controls for one action cost ~52px on a card
              * that has to float on an 812pt phone with map visible above and
              * below it, which is the screen's entire composition. The × is
              * kept: it carries a 44px target from the hit-area rule in
              * global.css and an aria-label, so nothing was lost but the
              * duplicate.
              */}
          </div>

          {/*
            * The terms collapse.
            *
            * They were four lines of body copy at the foot of the ticket, and
            * on an 812pt phone those four lines were the difference between a
            * card that floats on the map and a card that runs off the bottom of
            * it. They are a real disclosure, so they stay on the screen and stay
            * one tap from the price — but closed by default. The summary names
            * the restriction that actually catches people out, so the closed
            * state is not a shrug.
            */}
          <details className="voucher__terms">
            <summary className="voucher__terms-summary t-micro">
              One drink per adult, 18+. Offer terms
            </summary>
            <p className="voucher__terms-body t-micro">{PROMOTION.terms}</p>
          </details>
        </div>
      </article>

    </main>
  );
}
