import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { radius, semantic, spacing, typography } from '@cvip/ui';
import type { PriceBreakdown } from '@cvip/types';
import { hasCatalogue } from '../../lib/mode';
import { loadExperience, type ExperienceDetail } from '../../lib/catalogue';
import { createBooking, quoteBooking } from '../../lib/booking';
import { formatFrom } from '../../components/ExperienceCard';
import { Notice } from '../../components/Notice';

/**
 * Booking — T-04 (choose a date, departure and party), T-05 (pay).
 *
 * Three properties this screen is built around:
 *
 *   1. **The total is never computed here.** Every change re-quotes through `quoteBooking`, which
 *      runs the same `calculateBookingTotal` the charge will use. A locally-summed subtotal would
 *      eventually disagree with the charge, and the guest would be right to be angry about it.
 *   2. **Sold-out departures are visible, not hidden.** A picker that silently omits full dates
 *      looks broken. They are shown, disabled, and labelled.
 *   3. **Capacity is only consumed on pay.** Quoting reserves nothing.
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<ExperienceDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
      // Default to one adult on the first bookable departure, so the screen opens with a real
      // price on it instead of "choose at least one guest".
      const firstOpen = d?.upcomingSlots.find((s) => s.capacity - s.bookedCount > 0);
      setSlotId(firstOpen?.id ?? null);
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
    const anySelected = Object.values(quantities).some((n) => n > 0);
    if (!anySelected) {
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

  const selectedSlot = useMemo(
    () => detail?.upcomingSlots.find((s) => s.id === slotId) ?? null,
    [detail, slotId],
  );
  const remaining = selectedSlot ? selectedSlot.capacity - selectedSlot.bookedCount : 0;

  const setQuantity = (optionId: string, next: number) => {
    setQuantities((current) => ({ ...current, [optionId]: Math.max(0, next) }));
  };

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
      // The most likely failure is that someone took the last seats while this screen was open,
      // so re-quote: the guest needs to see the new availability, not just an error.
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

  return (
    <>
      <Stack.Screen options={{ title: 'Book' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: semantic.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
      >
        <View style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.title, color: semantic.textPrimary }}>{detail.title}</Text>
          {detail.vendorName ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              Operated by {detail.vendorName}
            </Text>
          ) : null}
        </View>

        {detail.isDemo ? (
          <Notice
            tone="alert"
            title="Demo booking"
            body="Nothing is charged and no vendor is notified. The price, the capacity check and the voucher are all real code running on sample data."
          />
        ) : null}

        <Section title="Choose a departure">
          {detail.upcomingSlots.length === 0 ? (
            <Text style={{ ...typography.body, color: semantic.textMuted }}>
              No departures are published for this experience yet.
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {detail.upcomingSlots.map((slot) => {
                const left = slot.capacity - slot.bookedCount;
                const full = left <= 0;
                const selected = slot.id === slotId;
                return (
                  <Pressable
                    key={slot.id}
                    onPress={() => !full && setSlotId(slot.id)}
                    disabled={full}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: full }}
                    accessibilityLabel={`${formatSlot(slot.startsAt)}, ${
                      full ? 'sold out' : `${left} places left`
                    }`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? semantic.brand : semantic.border,
                      backgroundColor: full ? semantic.surfaceSunken : semantic.surface,
                      opacity: full ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        ...typography.body,
                        color: semantic.textPrimary,
                        flex: 1,
                        fontWeight: selected ? '600' : '400',
                      }}
                    >
                      {formatSlot(slot.startsAt)}
                    </Text>
                    <Text
                      style={{
                        ...typography.caption,
                        color: full
                          ? semantic.textMuted
                          : left <= 2
                            ? semantic.alert
                            : semantic.textMuted,
                      }}
                    >
                      {full ? 'Sold out' : left <= 2 ? `${left} left` : `${left} places`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Who is coming?">
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
                    {formatFrom(option.unitAmountMinor, option.currency)} each
                  </Text>
                </View>
                <Stepper
                  value={value}
                  label={option.label}
                  canIncrease={!atCapacity}
                  onChange={(next) => setQuantity(option.id, next)}
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

        {promotion ? (
          <Notice tone="muted" title={promotion.title} body={promotion.terms} />
        ) : null}

        <Section title="Price">
          {quoting ? <ActivityIndicator color={semantic.brandActive} /> : null}
          {quoteError ? <Notice tone="alert" title="Cannot price this booking" body={quoteError} /> : null}
          {quote ? <Breakdown breakdown={quote} /> : null}
          {!quote && !quoteError && !quoting ? (
            <Text style={{ ...typography.caption, color: semantic.textMuted }}>
              Choose at least one guest to see the total.
            </Text>
          ) : null}
        </Section>

        {payError ? <Notice tone="alert" title="Booking failed" body={payError} /> : null}

        <Pressable
          onPress={() => void pay()}
          disabled={!quote || paying}
          accessibilityRole="button"
          accessibilityState={{ disabled: !quote || paying }}
          accessibilityLabel={
            quote
              ? `Pay ${formatFrom(quote.total.amountMinor, quote.currency)} and confirm`
              : 'Pay and confirm'
          }
          style={{
            backgroundColor: quote && !paying ? semantic.brand : semantic.surfaceSunken,
            borderRadius: radius.md,
            padding: spacing.md,
            alignItems: 'center',
          }}
        >
          {paying ? (
            <ActivityIndicator color={semantic.textOnDark} />
          ) : (
            <Text
              style={{
                ...typography.bodyStrong,
                color: quote ? semantic.textOnDark : semantic.textMuted,
              }}
            >
              {quote
                ? `Pay ${formatFrom(quote.total.amountMinor, quote.currency)}`
                : 'Pay and confirm'}
            </Text>
          )}
        </Pressable>

        <Text style={{ ...typography.caption, color: semantic.textMuted }}>
          Free cancellation up to {describeCancellation(detail.cancellationPolicy)} hours before
          departure. Availability is confirmed at the moment you pay.
        </Text>
      </ScrollView>
    </>
  );
}

/**
 * The itemized total, in the order PRD §10 requires it to be shown: everything that makes up the
 * charge is visible before the guest pays, not summarized into one number.
 */
function Breakdown({ breakdown }: { breakdown: PriceBreakdown }) {
  const currency = breakdown.currency;
  return (
    <View style={{ gap: spacing.xs }}>
      {breakdown.lines.map((line) => (
        <Row
          key={line.optionId}
          label={`${line.label} × ${line.quantity}`}
          value={formatFrom(line.lineTotal.amountMinor, currency)}
        />
      ))}
      <Row label="Subtotal" value={formatFrom(breakdown.subtotal.amountMinor, currency)} />
      {breakdown.discountsApplied.map((d) => (
        <Row
          key={d.promotionId}
          label={d.label}
          // An in-kind offer is worth nothing off the total and everything to the guest — showing
          // it as "included" rather than "−$0.00" is the honest rendering.
          value={d.amount.amountMinor === 0 ? 'Included' : `−${formatFrom(d.amount.amountMinor, currency)}`}
          muted
        />
      ))}
      <Row label="Tax" value={formatFrom(breakdown.tax.amountMinor, currency)} muted />
      <Row label="Service fee" value={formatFrom(breakdown.serviceFee.amountMinor, currency)} muted />
      <View style={{ height: 1, backgroundColor: semantic.border, marginVertical: spacing.xs }} />
      <Row label="Total" value={formatFrom(breakdown.total.amountMinor, currency)} strong />
      <Text style={{ ...typography.caption, color: semantic.textMuted }}>
        {breakdown.seats} {breakdown.seats === 1 ? 'guest' : 'guests'} · charged in {currency}
      </Text>
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
        style={{ ...typography.bodyStrong, color: semantic.textPrimary, minWidth: 24, textAlign: 'center' }}
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
      // 44pt minimum: PRD §16 calls for a mobile interface usable outdoors, and these are the
      // controls most likely to be tapped one-handed on a beach.
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

function describeCancellation(policy: Record<string, unknown>): number {
  const hours = policy.free_cancellation_hours;
  return typeof hours === 'number' ? hours : 24;
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
