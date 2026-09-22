import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { formatBookingReference, generateVoucherId } from '@cvip/types';
import { ISLANDS, destinationsFor, type PartySelection } from '../data/catalogue';

/**
 * Application state, persisted to LocalStorage.
 *
 * The brief requires that nothing is lost on refresh, which is a harder constraint than it sounds:
 * it means the *whole* journey has to be reconstructible from serialisable data. So no live object
 * — no Date, no Map, no class instance — is ever put in state. Everything is a string, a number, a
 * boolean or a plain array of those, and the screens derive the rest.
 *
 * This is a deliberate departure from the React Native demo, where state is in memory and a reload
 * resets the walkthrough on purpose. Here a refresh mid-presentation must not lose the booking that
 * was just made, so persistence is the feature rather than the hazard. `reset()` exists to put the
 * demonstration back to the beginning explicitly.
 *
 * ## Versioning
 *
 * `VERSION` is checked on load and a mismatch discards the stored state rather than merging it. A
 * half-migrated shape is a much worse failure than a demonstration that starts fresh once, and this
 * app's state shape will keep moving while it is being built.
 */

const STORAGE_KEY = 'cvip.tourist.v1';
const VERSION = 1;

export type VoucherState = 'available' | 'attached' | 'redeemed' | 'expired';

export interface SavedVoucher {
  id: string;
  promotionId: string;
  /** The listing the voucher was earned against, once attached to a booking. */
  experienceId: string | null;
  state: VoucherState;
  savedAtISO: string;
  redeemedAtISO: string | null;
  /** Where it was redeemed, shown in the redeemed state so it reads as a real record. */
  redeemedBy: string | null;
}

export interface Booking {
  id: string;
  reference: string;
  experienceId: string;
  islandId: string;
  /** ISO date, no time component — the chosen day. */
  dateISO: string;
  /** "09:00" — the chosen departure. */
  time: string;
  party: PartySelection;
  /** The guest total in USD minor units, from `calculateBookingTotal`. Never recomputed ad hoc. */
  totalMinor: number;
  /** A frozen copy of the itemisation, so the confirmation and trip show what was actually agreed. */
  lines: { label: string; quantity: number; amountMinor: number }[];
  taxMinor: number;
  serviceFeeMinor: number;
  subtotalMinor: number;
  status: 'confirmed' | 'cancelled';
  createdAtISO: string;
  /** The signed voucher token behind the QR. */
  ticketToken: string;
  voucherId: string | null;
}

export interface AppState {
  version: number;
  islandId: string;
  destinationSlug: string;
  savedExperienceIds: string[];
  vouchers: SavedVoucher[];
  bookings: Booking[];
  /** Listings added to the day plan from Irie without a booking — "suggested" timeline entries. */
  plannedExperienceIds: string[];
  /** The geofenced offer fires once per island per session-of-state, not on every Explore visit. */
  offerShownForIslands: string[];
  /**
   * Whether the guest has agreed to the app using their location — T-07's first gate.
   *
   * Persisted so a guest who consented once is not asked on every visit, and checked *before* any
   * fix is read rather than after: a position obtained while consent stood must stop being used the
   * moment it is withdrawn. Withdrawing it here is enough; nothing caches a fix past this flag.
   */
  locationConsent: boolean;
  onboarded: boolean;
  guestName: string;
}

function initialState(): AppState {
  const island = ISLANDS[0];
  const destination = island ? destinationsFor(island.id)[0] : undefined;
  return {
    version: VERSION,
    islandId: island?.id ?? 'island-jm',
    destinationSlug: destination?.slug ?? 'ocho-rios',
    savedExperienceIds: [],
    vouchers: [],
    bookings: [],
    plannedExperienceIds: [],
    offerShownForIslands: [],
    locationConsent: false,
    onboarded: false,
    guestName: '',
  };
}

type Action =
  | { type: 'selectIsland'; islandId: string }
  | { type: 'selectDestination'; slug: string }
  | { type: 'toggleSaved'; experienceId: string }
  | { type: 'saveVoucher'; promotionId: string }
  | { type: 'markOfferShown'; islandId: string }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'cancelBooking'; bookingId: string }
  | { type: 'redeemVoucher'; voucherId: string; by: string }
  | { type: 'expireVoucher'; voucherId: string }
  | { type: 'planExperience'; experienceId: string }
  | { type: 'unplanExperience'; experienceId: string }
  | { type: 'setLocationConsent'; granted: boolean }
  | { type: 'setOnboarded'; name: string }
  | { type: 'reset' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'selectIsland': {
      if (action.islandId === state.islandId) return state;
      const first = destinationsFor(action.islandId)[0];
      // Switching island moves the guest to that island's first destination. Keeping the previous
      // destination would leave the app claiming the guest is in Ocho Rios while showing Barbados.
      return {
        ...state,
        islandId: action.islandId,
        destinationSlug: first?.slug ?? state.destinationSlug,
      };
    }

    case 'selectDestination':
      return { ...state, destinationSlug: action.slug };

    case 'toggleSaved':
      return {
        ...state,
        savedExperienceIds: state.savedExperienceIds.includes(action.experienceId)
          ? state.savedExperienceIds.filter((id) => id !== action.experienceId)
          : [...state.savedExperienceIds, action.experienceId],
      };

    case 'saveVoucher': {
      // One live voucher per promotion. Saving twice is a no-op rather than a duplicate, which is
      // what the offer's own terms say ("one drink per adult guest on a confirmed booking").
      const existing = state.vouchers.find(
        (v) => v.promotionId === action.promotionId && v.state !== 'redeemed' && v.state !== 'expired',
      );
      if (existing) return state;
      return {
        ...state,
        vouchers: [
          ...state.vouchers,
          {
            id: generateVoucherId(),
            promotionId: action.promotionId,
            experienceId: null,
            state: 'available',
            savedAtISO: new Date().toISOString(),
            redeemedAtISO: null,
            redeemedBy: null,
          },
        ],
      };
    }

    case 'markOfferShown':
      return state.offerShownForIslands.includes(action.islandId)
        ? state
        : { ...state, offerShownForIslands: [...state.offerShownForIslands, action.islandId] };

    case 'addBooking': {
      const { booking } = action;
      // A booking claims the guest's live voucher for this promotion, if they hold one. That is
      // what turns "available" into "attached" and puts it on the ticket.
      const vouchers = state.vouchers.map((v) =>
        v.id === booking.voucherId
          ? { ...v, state: 'attached' as const, experienceId: booking.experienceId }
          : v,
      );
      return {
        ...state,
        bookings: [...state.bookings, booking],
        vouchers,
        // A booked listing is no longer merely planned.
        plannedExperienceIds: state.plannedExperienceIds.filter((id) => id !== booking.experienceId),
      };
    }

    case 'cancelBooking': {
      const booking = state.bookings.find((b) => b.id === action.bookingId);
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.bookingId ? { ...b, status: 'cancelled' as const } : b,
        ),
        // Cancelling releases the attached voucher back to the wallet rather than destroying it.
        vouchers: state.vouchers.map((v) =>
          booking && v.id === booking.voucherId && v.state === 'attached'
            ? { ...v, state: 'available' as const, experienceId: null }
            : v,
        ),
      };
    }

    case 'redeemVoucher':
      return {
        ...state,
        vouchers: state.vouchers.map((v) =>
          // Redemption is terminal and one-way. A second scan must not re-redeem, which is the
          // property the vendor-side demo exists to show.
          v.id === action.voucherId && (v.state === 'available' || v.state === 'attached')
            ? {
                ...v,
                state: 'redeemed' as const,
                redeemedAtISO: new Date().toISOString(),
                redeemedBy: action.by,
              }
            : v,
        ),
      };

    case 'expireVoucher':
      return {
        ...state,
        vouchers: state.vouchers.map((v) =>
          v.id === action.voucherId && v.state !== 'redeemed'
            ? { ...v, state: 'expired' as const }
            : v,
        ),
      };

    case 'planExperience':
      return state.plannedExperienceIds.includes(action.experienceId)
        ? state
        : { ...state, plannedExperienceIds: [...state.plannedExperienceIds, action.experienceId] };

    case 'unplanExperience':
      return {
        ...state,
        plannedExperienceIds: state.plannedExperienceIds.filter((id) => id !== action.experienceId),
      };

    case 'setLocationConsent':
      return { ...state, locationConsent: action.granted };

    case 'setOnboarded':
      return { ...state, onboarded: true, guestName: action.name };

    case 'reset':
      return initialState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function load(): AppState {
  if (typeof window === 'undefined') return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== VERSION) return initialState();
    // Merge over a fresh baseline so a key added since the state was written is present and typed
    // rather than undefined — the failure mode is otherwise a screen crashing on `.map` of nothing.
    return { ...initialState(), ...parsed, version: VERSION };
  } catch {
    // Corrupt or unreadable storage (private mode, quota, a half-written value) must not stop the
    // app from opening. Starting fresh is always recoverable; failing to render is not.
    return initialState();
  }
}

function save(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage being unavailable degrades persistence, not the app. Swallow deliberately.
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** Builds a reference and signed ticket token, then commits the booking. */
  createBooking: (input: Omit<Booking, 'id' | 'reference' | 'ticketToken' | 'createdAtISO'>) => Promise<Booking>;
  reset: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    save(state);
  }, [state]);

  const createBooking = useCallback<StoreValue['createBooking']>(async (input) => {
    const id = generateVoucherId();
    const island = ISLANDS.find((i) => i.id === input.islandId);
    const reference = formatBookingReference(island?.code ?? 'JM', id);
    const { signTicket } = await import('../data/ticket');
    const ticketToken = await signTicket(id);
    const booking: Booking = { ...input, id, reference, ticketToken, createdAtISO: new Date().toISOString() };
    dispatch({ type: 'addBooking', booking });
    return booking;
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do — the reducer reset below is what the user actually sees.
    }
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, createBooking, reset }),
    [state, createBooking, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
