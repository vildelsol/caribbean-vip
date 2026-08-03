import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import {
  distanceMetres,
  formatDistance,
  regionForMarkers,
  type Coordinates,
  type LocationPermission,
  type MapMarker,
} from '@cvip/types';
import { hasCatalogue } from '../../lib/mode';
import { locationProvider, mapProvider } from '../../lib/location';
import { useIsland } from '../../lib/island';
import { useSession } from '../../lib/session';
import { useSaved } from '../../lib/saved';
import { loadVendorLocations, searchCatalogue, type CatalogueItem } from '../../lib/catalogue';
import { ExperienceCard } from '../../components/ExperienceCard';
import { Chip, EmptyState, ListSkeleton, ScreenTitle } from '../../components/kit';
import { Notice } from '../../components/Notice';

/**
 * Bottom padding that clears the floating tab bar.
 *
 * The Irie AI button sits proud of the bar (PRD §16 puts it at the centre of five tabs), so
 * without this the last card is partly underneath it — unreadable and untappable.
 */
const TAB_BAR_CLEARANCE = spacing.xxl * 2;

/**
 * Nearby — list and map, with manual discovery as a first-class fallback.
 *
 * PRD §9: manual nearby discovery must exist as a fallback, and the experience "must never depend
 * on continuous tracking". So this screen is fully usable with location denied — it falls back to
 * the selected destination and omits distances. Location is requested only when the user presses
 * the button, never on mount.
 *
 * The map sits behind `mapProvider.canRenderMap` because the provider is still an open decision
 * (OD-05). With the mock, the list is the whole feature rather than a broken map.
 */
export default function Nearby() {
  const { island, destination } = useIsland();
  const { profile } = useSession();
  const { isSaved, toggle, requiresSignIn } = useSaved();

  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [vendorPins, setVendorPins] = useState<
    { vendorOrgId: string; name: string; lat: number; lng: number }[]
  >([]);
  const [loading, setLoading] = useState(hasCatalogue);
  const [error, setError] = useState<string | null>(null);

  // Reads the CURRENT permission without requesting it. Prompting on mount would be a permission
  // request the user never asked for.
  useEffect(() => {
    void locationProvider.getPermission().then(setPermission);
  }, []);

  const load = useCallback(async () => {
    if (!hasCatalogue || !island) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ items: rows, error: err }, pins] = await Promise.all([
      searchCatalogue({
        query: '',
        categories: [],
        sort: 'recommended',
        islandId: island.id,
        ...(destination ? { destinationId: destination.id } : {}),
      }),
      loadVendorLocations(island.id),
    ]);
    setItems(rows);
    setVendorPins(pins);
    setError(err);
    setLoading(false);
  }, [island?.id, destination?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const useMyLocation = async () => {
    let next = await locationProvider.getPermission();
    if (next !== 'granted') next = await locationProvider.requestPermission();
    setPermission(next);

    if (next !== 'granted') return;
    const fix = await locationProvider.getCurrentPosition();
    setOrigin(fix?.coordinates ?? null);
  };

  // Vendor coordinates give each listing a location. A listing whose vendor has no mapped
  // location gets no distance and sorts last, rather than pretending to sit at 0,0.
  const pinByVendor = useMemo(
    () => new Map(vendorPins.map((p) => [p.vendorOrgId, p])),
    [vendorPins],
  );

  const ranked = useMemo(() => {
    const withDistance = items.map((item) => {
      const pin = pinByVendor.get(item.vendorOrgId);
      const coords: Coordinates | null = pin ? { lat: pin.lat, lng: pin.lng } : null;
      return {
        item,
        coords,
        distance: origin && coords ? distanceMetres(origin, coords) : undefined,
      };
    });

    return withDistance.sort((a, b) => {
      const da = a.distance ?? Number.POSITIVE_INFINITY;
      const db = b.distance ?? Number.POSITIVE_INFINITY;
      return da - db || a.item.title.localeCompare(b.item.title);
    });
  }, [items, pinByVendor, origin]);

  const markers: MapMarker[] = useMemo(
    () =>
      ranked
        .filter((r) => r.coords !== null)
        .map((r) => ({
          id: r.item.id,
          coordinates: r.coords as Coordinates,
          title: r.item.title,
          ...(r.distance !== undefined ? { subtitle: formatDistance(r.distance) } : {}),
        })),
    [ranked],
  );

  const fallbackCentre: Coordinates =
    origin ??
    (destination
      ? { lat: destination.centre_lat, lng: destination.centre_lng }
      : { lat: 18.1096, lng: -77.2975 }); // Jamaica
  const region = regionForMarkers(markers, fallbackCentre);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: semantic.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm + 4, paddingBottom: TAB_BAR_CLEARANCE }}
    >
      <ScreenTitle
        title="Nearby"
        subtitle={
          origin
            ? 'Sorted by distance from where you are now.'
            : `Showing ${destination?.name ?? island?.name ?? 'this island'}. Share your location to sort by distance, or keep browsing by destination.`
        }
      />

      {!origin ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {permission !== 'denied' ? (
            <Chip label="Use my location" selected onPress={() => void useMyLocation()} />
          ) : null}
          <Chip label="Choose a destination" onPress={() => router.push('/select-destination')} />
        </View>
      ) : null}

      {permission === 'denied' ? (
        <Notice
          tone="muted"
          title="Location is off"
          body="That is fine — Nearby still works. Pick a destination and browse what is there. You can turn location on later in Profile."
          action={{
            label: 'Choose a destination',
            onPress: () => router.push('/select-destination'),
          }}
        />
      ) : null}

      {/* OD-05: with the mock provider there is no map to draw, so the list IS the feature. */}
      {mapProvider.canRenderMap ? (
        <View
          style={{
            height: 220,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: semantic.border,
            backgroundColor: semantic.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          <Text style={{ ...typography.body, color: semantic.textMuted }}>
            {markers.length} places on the map
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textMuted }}>
            {region.centre.lat.toFixed(3)}, {region.centre.lng.toFixed(3)} ·{' '}
            {mapProvider.attribution}
          </Text>
        </View>
      ) : (
        <Notice
          tone="info"
          title="Map view unavailable"
          body={`No maps provider is configured, so this is the list view. ${markers.length} places have coordinates. Set EXPO_PUBLIC_MAPS_PROVIDER to enable the map.`}
        />
      )}

      {error ? (
        <Notice tone="alert" title="Could not load nearby" body={error} onRetry={load} />
      ) : null}
      {loading ? <ListSkeleton count={3} /> : null}

      {!loading && ranked.length === 0 && !error ? (
        <EmptyState
          icon="map-pin"
          title="Nothing nearby"
          body="No approved experiences around here yet. Another destination will have more."
          actionLabel="Choose a destination"
          onAction={() => router.push('/select-destination')}
        />
      ) : null}

      {/* One card per line, thumbnail left — the same row card the rest of the app lists with. */}
      {ranked.map(({ item, distance }) => (
        <ExperienceCard
          key={item.id}
          item={item}
          {...(distance !== undefined ? { distanceMetres: distance } : {})}
          saved={isSaved(item.id)}
          {...(requiresSignIn ? {} : { onToggleSave: () => void toggle(item.id) })}
        />
      ))}

      {profile && !profile.location_consent ? (
        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          Location sharing is off in your profile. Nearby offers stay off until you turn both
          location and offers on.
        </Text>
      ) : null}
    </ScrollView>
  );
}
