import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import { loadBookings, type BookingSummary } from '../../lib/booking';
import { loadSavedExperienceIds, searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { hasCatalogue } from '../../lib/mode';
import { useSession } from '../../lib/session';
import { useIsland } from '../../lib/island';
import { useSaved } from '../../lib/saved';
import { demoImage } from '../../lib/demoMedia';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';
import {
  Badge,
  Divider,
  FactRow,
  Photo,
  PrimaryButton,
  SectionHeader,
  formatUsd,
} from '../../components/kit';

/**
 * Bottom padding that clears the floating tab bar.
 *
 * The Irie AI button sits proud of the bar (PRD §16 puts it at the centre of five tabs), so
 * without this the last card is partly underneath it — unreadable and untappable.
 */
const TAB_BAR_CLEARANCE = spacing.xxl * 2;

type Tab = 'upcoming' | 'past' | 'cancelled' | 'saved';

const TABS: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'saved', label: 'Saved' },
];

/**
 * Trips — T-06, T-09, and the saved list from T-03.
 *
 * Reloads on focus rather than only on mount: the most common way into this screen is straight back
 * from cancelling a booking, and a stale "Upcoming" list after that is a bug the guest sees
 * immediately.
 *
 * "Upcoming" is derived from the departure time, not from the status, so a confirmed booking whose
 * departure has passed moves to Completed on its own — no job has to run for the list to be right.
 */
export default function Trips() {
  const { state, profile } = useSession();
  const { island } = useIsland();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [tab, setTab] = useState<Tab>('upcoming');
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [saved, setSaved] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(hasCatalogue);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasCatalogue) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ bookings: rows, error: err }, savedIds] = await Promise.all([
      loadBookings(),
      loadSavedExperienceIds(profile?.id ?? 'demo-tourist'),
    ]);
    setBookings(rows);
    setError(err);

    if (savedIds.size > 0) {
      // Saved items are stored as ids; this catalogue read turns them back into cards. It is the
      // same RLS-governed read as everywhere else, so a listing unpublished after being saved
      // simply stops coming back rather than needing to be cleaned up.
      const { items } = await searchCatalogue({
        query: '',
        categories: [],
        sort: 'recommended',
        ...(island ? { islandId: island.id } : {}),
      });
      setSaved(items.filter((i) => savedIds.has(i.id)));
    } else {
      setSaved([]);
    }
    setLoading(false);
  }, [island?.id, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && (!b.startsAt || new Date(b.startsAt).getTime() > now),
  );
  const past = bookings.filter(
    (b) =>
      b.status === 'completed' ||
      (b.status === 'confirmed' && !!b.startsAt && new Date(b.startsAt).getTime() <= now),
  );
  const cancelled = bookings.filter((b) => b.status === 'cancelled' || b.status === 'refunded');

  const counts: Record<Tab, number> = {
    upcoming: upcoming.length,
    past: past.length,
    cancelled: cancelled.length,
    saved: saved.length,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.display, color: semantic.textPrimary }}>My Trips</Text>
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          {state === 'guest'
            ? 'Your bookings and saved experiences will live here.'
            : 'Your bookings, vouchers and saved experiences.'}
        </Text>
      </View>

      {/* The mockup's tab row: plain labels on the ivory, the active one bold above a short deep
          green rule, with a hairline running the full width beneath. It was a filled pill inside a
          sand track — a heavier control than the mockup uses, and one that fought the segmented
          look of the trip cards below it. */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: semantic.border }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t.label}, ${counts[t.key]} items`}
              style={{
                flex: 1,
                paddingVertical: spacing.sm + 2,
                alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: active ? semantic.brand : 'transparent',
                marginBottom: -1,
              }}
            >
              <Text
                style={{
                  ...(active ? typography.bodyStrong : typography.caption),
                  fontSize: 14,
                  color: active ? semantic.textPrimary : semantic.textMuted,
                }}
              >
                {t.label}
                {counts[t.key] > 0 ? ` ${counts[t.key]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Notice tone="alert" title="Could not load your trips" body={error} onRetry={load} />
      ) : null}
      {loading ? <ActivityIndicator color={semantic.brandActive} /> : null}

      {!loading && tab === 'upcoming' && upcoming.length > 0 ? (
        <SectionHeader title="Upcoming trips" />
      ) : null}

      {!loading && tab === 'upcoming' ? (
        upcoming.length === 0 ? (
          <Notice
            tone="muted"
            title="Nothing booked yet"
            body="When you book an experience it appears here with its QR voucher."
            action={{ label: 'Explore experiences', onPress: () => router.push('/') }}
          />
        ) : (
          upcoming.map((b) => <BookingRow key={b.id} booking={b} showVoucher />)
        )
      ) : null}

      {!loading && tab === 'past' ? (
        past.length === 0 ? (
          <Empty text="Nothing completed yet." />
        ) : (
          past.map((b) => <BookingRow key={b.id} booking={b} />)
        )
      ) : null}

      {!loading && tab === 'cancelled' ? (
        cancelled.length === 0 ? (
          <Empty text="No cancelled bookings." />
        ) : (
          cancelled.map((b) => <BookingRow key={b.id} booking={b} />)
        )
      ) : null}

      {!loading && tab === 'saved' ? (
        saved.length === 0 ? (
          <Notice
            tone="muted"
            title="Nothing saved"
            body="Tap the star on any experience to keep it here."
            action={{ label: 'Explore experiences', onPress: () => router.push('/') }}
          />
        ) : (
          saved.map((item) => (
            <ExperienceCard
              key={item.id}
              item={item}
              saved={isSaved(item.id)}
              {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
            />
          ))
        )
      ) : null}
    </ScrollView>
  );
}

function BookingRow({ booking, showVoucher }: { booking: BookingSummary; showVoucher?: boolean }) {
  const hero = demoImage(booking.heroMediaKey);
  const cancelled = booking.status === 'cancelled' || booking.status === 'refunded';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${booking.experienceTitle}, reference ${booking.reference}`}
      style={{
        backgroundColor: semantic.surface,
        borderWidth: 1,
        borderColor: semantic.border,
        borderRadius: radius.lg,
        overflow: 'hidden',
        opacity: cancelled ? 0.6 : 1,
      }}
    >
      {/* Photo, then a status pill floated on its top-left corner — the mockup's "UPCOMING"
          badge. It was a pill in the text block competing with the title. */}
      {hero ? (
        <View>
          <Photo source={hero} height={150} radius={0} />
          <View style={{ position: 'absolute', top: spacing.sm + 2, left: spacing.sm + 2 }}>
            <Badge
              label={
                cancelled
                  ? booking.status === 'refunded'
                    ? 'Refunded'
                    : 'Cancelled'
                  : showVoucher
                    ? 'Upcoming'
                    : 'Completed'
              }
              tone={cancelled ? 'pending' : 'brand'}
            />
          </View>
        </View>
      ) : null}

      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <Text style={{ ...typography.title, fontSize: 21, color: semantic.textPrimary }}>
          {booking.experienceTitle}
        </Text>

        <View style={{ gap: spacing.sm + 2, marginTop: 2 }}>
          {booking.startsAt ? (
            <FactRow icon="calendar">
              <Text style={{ ...typography.caption, color: semantic.textPrimary }}>
                {formatWhen(booking.startsAt)}
              </Text>
            </FactRow>
          ) : null}
          <FactRow icon="users">
            <Text style={{ ...typography.caption, color: semantic.textPrimary }}>
              {`${booking.seats} ${booking.seats === 1 ? 'guest' : 'guests'}`}
            </Text>
          </FactRow>
          <FactRow icon="tag">
            <Text style={{ ...typography.caption, color: semantic.textPrimary }}>
              Booking Ref: {booking.reference}
            </Text>
          </FactRow>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ ...typography.caption, color: semantic.textMuted, flex: 1 }}>
            Total paid
          </Text>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
            {formatUsd(booking.totalMinor)}
          </Text>
        </View>

        {showVoucher ? (
          <>
            <Divider />
            <PrimaryButton
              label="View Ticket"
              onPress={() => router.push({ pathname: '/voucher/[id]', params: { id: booking.id } })}
              accessibilityLabel={`Show voucher for ${booking.experienceTitle}`}
            />
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Text style={{ ...typography.body, color: semantic.textMuted, paddingVertical: spacing.lg }}>
      {text}
    </Text>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
