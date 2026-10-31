'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { semantic, spacing, radius } from '@cvip/ui';
import { CURRENCIES } from '@cvip/types';
import { createPromotion, listVendorChoices, type VendorChoice } from '../../../lib/promotions';
import { buildPromotion, emptyDraft, type PromotionDraft, type PromotionValueKind } from '../../../lib/promotionDraft';

/**
 * Create a promotion for a vendor. Admin-only at launch: vendors do not create their own offers
 * yet. The offer starts pending and goes through the oversight queue like any other.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const input = {
  padding: '10px 12px',
  fontSize: 15,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  background: semantic.background,
  color: semantic.textPrimary,
  width: '100%',
} as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 14, color: semantic.textMuted }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 13, color: semantic.textFaint }}>{hint}</span> : null}
    </label>
  );
}

export default function NewPromotionPage() {
  const [vendors, setVendors] = useState<VendorChoice[] | null>(null);
  const [draft, setDraft] = useState<PromotionDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listVendorChoices()
      .then(setVendors)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const set = <K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Checked as you type, with the same rules the save path uses, so the button says why it is off.
  const problems = useMemo(() => {
    const vendor = vendors?.find((v) => v.id === draft.vendorId) ?? null;
    const r = buildPromotion(draft, vendor?.islandId ?? null, new Date());
    return r.ok ? [] : r.problems;
  }, [draft, vendors]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length > 0 || vendors === null) return;
    setBusy(true);
    setError(null);
    try {
      await createPromotion(draft, vendors);
      setCreated(draft.title.trim());
      setDraft(emptyDraft());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: spacing.lg }}>
      <p style={{ color: semantic.textMuted, margin: 0, fontSize: 14 }}>
        <Link href="/promotions" style={{ color: 'inherit' }}>
          Promotion oversight
        </Link>{' '}
        · New
      </p>
      <h1 style={{ color: semantic.brand, margin: `${spacing.xs}px 0` }}>New promotion</h1>
      <p style={{ color: semantic.textMuted, fontSize: 14, marginTop: 0 }}>
        The offer starts pending and still needs approval in the queue. Tourists never see it before then.
      </p>

      {created ? (
        <p role="status" style={{ padding: `${spacing.sm}px ${spacing.md}px`, background: semantic.locatorTintSoft, color: semantic.brand, borderRadius: radius.sm, fontSize: 14 }}>
          “{created}” was created and is waiting in the queue. <Link href="/promotions">Open the queue</Link>
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: semantic.urgentText, fontSize: 14 }}>
          {error}
        </p>
      ) : null}

      {vendors === null ? (
        <p style={{ color: semantic.textMuted }}>Loading…</p>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: spacing.md }}>
          <Field label="Vendor">
            <select value={draft.vendorId} onChange={(e) => set('vendorId', e.target.value)} style={input}>
              <option value="">Choose a vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={120} style={input} />
          </Field>
          <Field label="Description (optional)">
            <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={500} style={input} />
          </Field>
          <Field label="Terms" hint="Shown to the tourist before they claim. Required.">
            <textarea value={draft.terms} onChange={(e) => set('terms', e.target.value)} rows={2} maxLength={500} style={input} />
          </Field>

          <fieldset style={{ border: `1px solid ${semantic.border}`, borderRadius: radius.md, padding: spacing.md, display: 'grid', gap: spacing.sm }}>
            <legend style={{ color: semantic.brand, fontWeight: 600 }}>Value</legend>
            <Field label="Kind">
              <select value={draft.valueKind} onChange={(e) => set('valueKind', e.target.value as PromotionValueKind)} style={input}>
                <option value="in_kind">In kind (for example a free drink)</option>
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </Field>
            {draft.valueKind === 'percentage' ? (
              <Field label="Percent off">
                <input inputMode="decimal" value={draft.percent} onChange={(e) => set('percent', e.target.value)} style={input} />
              </Field>
            ) : null}
            {draft.valueKind === 'fixed' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: spacing.sm }}>
                <Field label="Amount off">
                  <input inputMode="decimal" value={draft.amount} onChange={(e) => set('amount', e.target.value)} style={input} />
                </Field>
                <Field label="Currency">
                  <select value={draft.currency} onChange={(e) => set('currency', e.target.value)} style={input}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm }}>
            <Field label="Starts">
              <input type="datetime-local" value={draft.startsAt} onChange={(e) => set('startsAt', e.target.value)} style={input} />
            </Field>
            <Field label="Ends">
              <input type="datetime-local" value={draft.endsAt} onChange={(e) => set('endsAt', e.target.value)} style={input} />
            </Field>
            <Field label="Inventory limit" hint="Blank for no limit.">
              <input inputMode="numeric" value={draft.inventoryLimit} onChange={(e) => set('inventoryLimit', e.target.value)} style={input} />
            </Field>
          </div>

          <fieldset style={{ border: `1px solid ${semantic.border}`, borderRadius: radius.md, padding: spacing.md, display: 'grid', gap: spacing.sm }}>
            <legend style={{ color: semantic.brand, fontWeight: 600 }}>Geofence</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: spacing.sm }}>
              <Field label="Latitude">
                <input inputMode="decimal" value={draft.centreLat} onChange={(e) => set('centreLat', e.target.value)} style={input} />
              </Field>
              <Field label="Longitude">
                <input inputMode="decimal" value={draft.centreLng} onChange={(e) => set('centreLng', e.target.value)} style={input} />
              </Field>
              <Field label="Radius (metres)" hint="50 to 20000.">
                <input inputMode="numeric" value={draft.radiusMetres} onChange={(e) => set('radiusMetres', e.target.value)} style={input} />
              </Field>
            </div>
            <div>
              <span style={{ fontSize: 14, color: semantic.textMuted }}>Active days (none ticked means every day)</span>
              <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginTop: 4 }}>
                {DAYS.map((label, day) => (
                  <label key={label} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={draft.days.includes(day)}
                      onChange={(e) => set('days', e.target.checked ? [...draft.days, day] : draft.days.filter((d) => d !== day))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: spacing.sm }}>
              <Field label="From (local time)" hint="Blank for all day.">
                <input type="time" value={draft.fromTime} onChange={(e) => set('fromTime', e.target.value)} style={input} />
              </Field>
              <Field label="To (local time)" hint="Earlier than From means past midnight.">
                <input type="time" value={draft.toTime} onChange={(e) => set('toTime', e.target.value)} style={input} />
              </Field>
              <Field label="Cooldown (minutes)" hint="1440 is once a day.">
                <input inputMode="numeric" value={draft.cooldownMinutes} onChange={(e) => set('cooldownMinutes', e.target.value)} style={input} />
              </Field>
            </div>
          </fieldset>

          <label style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={draft.isTest} onChange={(e) => set('isTest', e.target.checked)} />
            Test offer (marked so it can be found and removed)
          </label>

          {problems.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: spacing.lg, color: semantic.textMuted, fontSize: 14 }} aria-label="What is still needed">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={busy || problems.length > 0}
              style={{ padding: `${spacing.sm}px ${spacing.md}px`, fontSize: 15, fontWeight: 600, color: semantic.textOnDark, background: semantic.brandActive, border: 'none', borderRadius: radius.sm, cursor: busy || problems.length > 0 ? 'default' : 'pointer', opacity: busy || problems.length > 0 ? 0.55 : 1 }}
            >
              {busy ? 'Creating…' : 'Create promotion'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
