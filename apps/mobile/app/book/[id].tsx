import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import type { PriceBreakdown } from '@cvip/types';
import { hasCatalogue } from '../../lib/mode';
import { useIsland } from '../../lib/island';
import { loadExperience, type ExperienceDetail } from '../../lib/catalogue';
import { createBooking, quoteBooking } from '../../lib/booking';
import { approxLocalPerUsd } from '../../lib/localCurrency';
import { demoImage } from '../../lib/demoMedia';
import { Notice } from '../../components/Notice';
import {
  Card,
  Photo,
  PrimaryButton,
  formatLocalApprox,
  formatUsd,
} from '../../components/kit';

/**
 * Booking — T-04 (choose a date, departure and party) and T-05 (pay).
 *
 * Two steps, matching mockups 8 and 9: pick a day, a time and a party size; then review and pay.
 * Splitting them keeps each screen to one decision, which is what the mockups' "clear actions on
 * every screen" note is asking for — a single scroll containing a calendar, steppers and a card
 * form is where people abandon.
 *
 * Three properties this screen is built around:
 *
 *   1. **The total is never computed here.** Every change re-quotes through `quoteBooking`, which
 *      runs the same `calculateBookingTotal` the charge will use. A locally-summed subtotal would
 *      eventually disagree with the charge, and the guest would be right to be angry about it.
 *   2. **Sold-out departures are visible, not hidden.** A picker that silently omits full times
 *      looks broken. They are shown, disabled and labelled.
 *   3. **Capacity is only consumed on pay.** Quoting reserves nothing.
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { island } = useIsland();

  const [detail, setDetail] = useState<ExperienceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'when' | 'pay'>('when');
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<PriceBreakdown | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !hasCatalogue) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { detail: d } = await loadExperience(id);
      if (!active) return;
      setDetail(d);
      // Default to one adult on the first bookable departure, so the screen opens with a real price
      // on it instead of "choose at least one guest".
      const firstOpen = d?.upcomingSlots.find((s) => s.capacity - s.bookedCount > 0);
      if (firstOpen) {
        setDayKey(dayKeyOf(firstOpen.startsAt));
        setSlotId(firstOpen.id);
      }
      const adult = d?.options.find((o) => o.kind === 'adult');
      if (adult) setQuantities({ [adult.id]: 1 });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const promotion = detail?.promotion ?? null;

  const refreshQuote = useCallback(async () => {
    if (!detail || !slotId) {
      setQuote(null);
      return;
    }
    if (!Object.values(quantities).some((n) => n > 0)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoting(true);
    const result = await quoteBooking({
      experienceId: detail.id,
      slotId,
      quantities,
      applyPromotion: promotion !== null,
    });
    setQuoting(false);
    if (result.ok) {
      setQuote(result.breakdown);
      setQuoteError(null);
    } else {
      setQuote(null);
      setQuoteError(result.reason);
    }
  }, [detail?.id, slotId, JSON.stringify(quantities), promotion?.id]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  // Group departures by day so the mockup's day strip and time chips have something to bind to.
  const days = useMemo(() => {
    const map = new Map<string, { key: string; date: Date; slots: ExperienceDetail['upcomingSlots'] }>();
    for (const slot of detail?.upcomingSlots ?? []) {
      const key = dayKeyOf(slot.startsAt);
      const entry = map.get(key) ?? { key, date: new Date(slot.startsAt), slots: [] };
      entry.slots.push(slot);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [detail]);

  const times = days.find((d) => d.key === dayKey)?.slots ?? [];
  const selectedSlot = detail?.upcomingSlots.find((s) => s.id === slotId) ?? null;
  const remaining = selectedSlot ? selectedSlot.capacity - selectedSlot.bookedCount : 0;
  const local = (minor: number) =>
    island ? formatLocalApprox(minor, island.currency, approxLocalPerUsd(island.currency) ?? 0) : null;

  const pay = async () => {
    if (!detail || !slotId || !quote) return;
    setPaying(true);
    setPayError(null);
    const result = await createBooking({
      experienceId: detail.id,
      slotId,
      quantities,
      applyPromotion: promotion !== null,
    });
    setPaying(false);
    if (!result.ok) {
      setPayError(result.reason);
      // The most likely failure is that someone took the last seats while this screen was open, so
      // re-quote: the guest needs to see the new availability, not just an error.
      void refreshQuote();
      return;
    }
    router.replace({ pathname: '/booking/[id]', params: { id: result.bookingId } });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: semantic.background, justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.brandActive} />
      </View>
    );
  }

  if (!detail) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg }}
      >
        <Notice
          tone="muted"
          title="This experience is not available"
          body="It may have been unpublished, or the link may be out of date."
          action={{ label: 'Back to Explore', onPress: () => router.replace('/') }}
        />
      </ScrollView>
    );
  }

  const hero = demoImage(detail.heroMediaKey);

  return (
    <>
      <Stack.Screen options={{ title: step === 'when' ? 'Select date & guests' : 'Review & pay' }} />
      <View style={{ flex: 1, backgroundColor: semantic.background }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 140 }}>
          {detail.isDemo ? (
            <Notice
              tone="alert"
              title="Demo booking"
              body="Nothing is charged and no vendor is notified. The price, the capacity check and the voucher are all real code running on sample data."
            />
          ) : null}

          {step === 'when' ? (
            <>
              <Text style={{ ...typography.title, color: semantic.textPrimary }}>
                {detail.title}
              </Text>

              <Section title="Select a date">
                {days.length === 0 ? (
                  <Text style={{ ...typography.body, color: semantic.textMuted }}>
                    No departures are published for this experience yet.
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.sm }}
                  >
                    {days.slice(0, 14).map((d) => {
                      const active = d.key === dayKey;
                      const full = d.slots.every((s) => s.capacity - s.bookedCount <= 0);
                      return (
                        <Pressable
                          key={d.key}
                          onPress={() => {
                            setDayKey(d.key);
                            const open = d.slots.find((s) => s.capacity - s.bookedCount > 0);
                            setSlotId(open?.id ?? null);
                          }}
                          disabled={full}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active, disabled: full }}
                          accessibilityLabel={`${d.date.toDateString()}${full ? ', sold out' : ''}`}
                          style={{
                            width: 62,
                            paddingVertical: spacing.sm,
                            borderRadius: radius.md,
                            alignItems: 'center',
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? semantic.brand : semantic.border,
                            backgroundColor: active ? semantic.surface : semantic.surface,
                            opacity: full ? 0.45 : 1,
                          }}
                        >
                          <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
                            {d.date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </Text>
                          <Text
                            style={{
                              ...typography.bodyStrong,
                              color: active ? semantic.brand : semantic.textPrimary,
                            }}
                          >
                            {d.date.getDate()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </Section>

              {times.length > 0 ? (
                <Section title="Available times">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {times.map((s) => {
                      const left = s.capacity - s.bookedCount;
                      const full = left <= 0;
                      const active = s.id === slotId;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => !full && setSlotId(s.id)}
                          disabled={full}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active, disabled: full }}
                          accessibilityLabel={`${formatTime(s.startsAt)}${
                            full ? ', sold out' : `, ${left} places left`
                          }`}
                          style={{
                            paddingVertical: spacing.sm + 2,
                            paddingHorizontal: spacing.md,
                            borderRadius: radius.md,
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? semantic.brand : semantic.border,
                            backgroundColor: full ? semantic.surfaceSunken : semantic.surface,
                            opacity: full ? 0.55 : 1,
                            gap: 2,
                          }}
                        >
                          <Text
                            style={{
                              ...typography.body,
                              fontWeight: active ? '700' : '400',
                              color: semantic.textPrimary,
                            }}
                          >
                            {formatTime(s.startsAt)}
                          </Text>
                          <Text
                            style={{
                              ...typography.caption,
                              fontSize: 11,
                              color: full ? semantic.textMuted : left <= 2 ? semantic.alert : semantic.textMuted,
                            }}
                          >
                            {full ? 'Sold out' : left <= 2 ? `${left} left` : `${left} places`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              ) : null}

              <Section title="Guests">
                {detail.options.map((option) => {
                  const value = quantities[option.id] ?? 0;
                  // Add-ons do not occupy capacity, so they are not capped by remaining seats.
                  const seatsUsed = detail.options.reduce(
                    (n, o) => (o.occupiesCapacity ? n + (quantities[o.id] ?? 0) : n),
                    0,
                  );
                  const atCapacity = option.occupiesCapacity && seatsUsed >= remaining;

                  return (
                    <View
                      key={option.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                          {option.label}
                          {option.occupiesCapacity ? '' : ' (add-on)'}
                        </Text>
                        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                          {formatUsd(option.unitAmountMinor)} each
                        </Text>
                      </View>
                      <Stepper
                        value={value}
                        label={option.label}
                        canIncrease={!atCapacity}
                        onChange={(next) =>
                          setQuantities((c) => ({ ...c, [option.id]: Math.max(0, next) }))
                        }
                      />
                    </View>
                  );
                })}
                {selectedSlot ? (
                  <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                    {remaining} {remaining === 1 ? 'place' : 'places'} left on this departure.
                  </Text>
                ) : null}
              </Section>

              {quoteError ? (
                <Notice tone="alert" title="Cannot price this booking" body={quoteError} />
              ) : null}
            </>
          ) : (
            <>
              {/* Review & Pay — mockup 9. */}
              <Card padded={false}>
                <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md }}>
                  {hero ? (
                    <View style={{ width: 76 }}>
                      <Photo source={hero} ratio={1} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                      {detail.title}
                    </Text>
                    {selectedSlot ? (
                      <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                        {formatWhen(selectedSlot.startsAt)}
                      </Text>
                    ) : null}
                    <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                      {quote?.seats ?? 0} {quote?.seats === 1 ? 'guest' : 'guests'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setStep('when')}
                    accessibilityRole="button"
                    accessibilityLabel="Edit date and guests"
                    hitSlop={10}
                  >
                    <Text style={{ ...typography.caption, fontWeight: '600', color: semantic.accent }}>
                      Edit
                    </Text>
                  </Pressable>
                </View>
              </Card>

              {quote ? (
                <Section title="Order summary">
                  {quote.lines.map((line) => (
                    <Row
                      key={line.optionId}
                      label={`${line.label} × ${line.quantity}`}
                      value={formatUsd(line.lineTotal.amountMinor, false)}
                    />
                  ))}
                  {quote.discountsApplied.map((d) => (
                    <Row
                      key={d.promotionId}
                      label={d.label}
                      // An in-kind offer is worth nothing off the total and everything to the guest.
                      value={d.amount.amountMinor === 0 ? 'Included' : `−${formatUsd(d.amount.amountMinor, false)}`}
                      muted
                    />
                  ))}
                  <Row label="Tax" value={formatUsd(quote.tax.amountMinor, false)} muted />
                  <Row
                    label="Service fee"
                    value={formatUsd(quote.serviceFee.amountMinor, false)}
                    muted
                  />
                  <View
                    style={{ height: 1, backgroundColor: semantic.border, marginVertical: spacing.xs }}
                  />
                  <Row label="Total" value={formatUsd(quote.total.amountMinor)} strong />
                  {local(quote.total.amountMinor) ? (
                    <Text
                      style={{ ...typography.caption, color: semantic.textMuted, textAlign: 'right' }}
                    >
                      {local(quote.total.amountMinor)} · charged in USD
                    </Text>
                  ) : null}
                </Section>
              ) : null}

              {payError ? <Notice tone="alert" title="Booking failed" body={payError} /> : null}

              <Text style={{ ...typography.caption, color: semantic.textMuted }}>
                Free cancellation up to {cancellationHours(detail)} hours before departure.
                Availability is confirmed at the moment you pay.
              </Text>
            </>
          )}
        </ScrollView>

        {/* Sticky total and action. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: spacing.md,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
            backgroundColor: semantic.surface,
            borderTopWidth: 1,
            borderTopColor: semantic.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ ...typography.caption, color: semantic.textMuted, flex: 1 }}>
              {step === 'when' ? 'Total price' : 'You pay'}
            </Text>
            {quoting ? (
              <ActivityIndicator color={semantic.brandActive} />
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...typography.heading, color: semantic.textPrimary }}>
                  {quote ? formatUsd(quote.total.amountMinor) : '—'}
                </Text>
                {quote && local(quote.total.amountMinor) ? (
                  <Text style={{ ...typography.caption, fontSize: 12, color: semantic.textMuted }}>
                    {local(quote.total.amountMinor)}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {step === 'when' ? (
            <PrimaryButton
              label="Continue to payment"
              disabled={!quote}
              onPress={() => setStep('pay')}
            />
          ) : paying ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <ActivityIndicator color={semantic.brandActive} />
            </View>
          ) : (
            <PrimaryButton
              label={quote ? `Pay ${formatUsd(quote.total.amountMinor)}` : 'Pay'}
              disabled={!quote}
              onPress={() => void pay()}
            />
          )}
        </View>
      </View>
    </>
  );
}

function Stepper({
  value,
  label,
  canIncrease,
  onChange,
}: {
  value: number;
  label: string;
  canIncrease: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <StepButton
        symbol="−"
        accessibilityLabel={`Remove one ${label}`}
        disabled={value === 0}
        onPress={() => onChange(value - 1)}
      />
      <Text
        style={{
          ...typography.bodyStrong,
          color: semantic.textPrimary,
          minWidth: 24,
          textAlign: 'center',
        }}
        accessibilityLabel={`${value} ${label}`}
      >
        {value}
      </Text>
      <StepButton
        symbol="+"
        accessibilityLabel={`Add one ${label}`}
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

function StepButton({
  symbol,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  symbol: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      // 44pt minimum: PRD §16 wants a mobile interface usable outdoors, and these are the controls
      // most likely to be tapped one-handed on a beach.
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: disabled ? semantic.border : semantic.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ ...typography.heading, color: semantic.accent }}>{symbol}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.heading, color: semantic.textPrimary }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  const style = strong ? typography.bodyStrong : muted ? typography.caption : typography.body;
  const color = muted ? semantic.textMuted : semantic.textPrimary;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Text style={{ ...style, color, flex: 1 }}>{label}</Text>
      <Text style={{ ...style, color }}>{value}</Text>
    </View>
  );
}

function cancellationHours(detail: ExperienceDetail): number {
  const hours = detail.cancellationPolicy.free_cancellation_hours;
  return typeof hours === 'number' ? hours : 24;
}

function dayKeyOf(iso: string): string {
  return new Date(iso).toDateString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
