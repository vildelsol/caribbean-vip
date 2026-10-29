'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crest } from '../../components/Crest';
import { useActiveMembership, useCanManageListings } from '../../lib/session';
import { useIslandTimezone } from '../../lib/island';
import { loadListings, type VendorListing } from '../../lib/listings';
import { dayKey } from '../../lib/operations';
import { NO_LISTING_PERMISSION } from '../../lib/permissions';
import { vendorListings } from '../../lib/vendorData';
import {
  SlotInvalid,
  addSlots,
  isDemoAvailability,
  loadAvailability,
  setSlotCapacity,
  type Day,
  type Slot,
} from '../../lib/availability';

/** `${iso}|${time}` — stable across a reload of the same day, unlike a slot's array index. */
type SlotKey = string;

/**
 * Availability — V-03.
 *
 * Reads and writes through `lib/availability`, which decides between Supabase and the generated
 * demo calendar. Capacity below what is already booked is refused in words here rather than
 * reaching `availability_slots_not_oversold` and coming back as a constraint name.
 *
 * Capacity is a listing write, so it is gated on `can_manage_listings` (an owner always counts —
 * see `lib/permissions.ts`). The calendar itself is not: RLS leaves SELECT open to every member
 * because scan-only staff need to see what they are scanning. So an ungranted member reads the
 * week exactly as an owner does; the slots simply stop being buttons, and a line above says why.
 */
export default function Availability() {
  const canManage = useCanManageListings();
  const orgId = useActiveMembership()?.vendor_org_id ?? null;
  const timeZone = useIslandTimezone();
  // Live reads the organisation's own listings. Demo keeps its generated catalogue.
  const [liveListings, setLiveListings] = useState<VendorListing[] | null>(null);
  const listings = isDemoAvailability ? vendorListings() : (liveListings ?? []);
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? '');
  const [reload, setReload] = useState(0);
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<SlotKey | null>(null);
  const [editValue, setEditValue] = useState('');

  const primary = listings.find((l) => l.id === selectedId) ?? listings[0];

  useEffect(() => {
    if (isDemoAvailability || !orgId) return;
    let active = true;
    loadListings(orgId)
      .then((rows) => {
        if (active) setLiveListings(rows);
      })
      .catch((e) => {
        if (active) {
          setLiveListings([]);
          setError(e instanceof Error ? e.message : 'Could not load your listings.');
        }
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!primary) return;
    // Live times are the island's: wait for its timezone instead of guessing the browser's.
    if (!isDemoAvailability && !timeZone) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const rows = await loadAvailability(primary, 7, timeZone ?? undefined);
        if (active) {
          setDays(rows);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load the calendar.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [primary, timeZone, reload]);

  const openEdit = (key: SlotKey, slot: Slot) => {
    setError(null);
    setEditingSlot(key);
    setEditValue(String(slot.capacity));
  };

  const saveEdit = useCallback(
    async (iso: string, slot: Slot) => {
      const parsed = Number.parseInt(editValue, 10);
      try {
        const next = await setSlotCapacity(canManage, slot, parsed);
        setDays((prev) =>
          prev.map((d) =>
            d.iso === iso
              ? { ...d, slots: d.slots.map((s) => (s.time === slot.time ? next : s)) }
              : d,
          ),
        );
        setError(null);
        setEditingSlot(null);
      } catch (e) {
        // The row stays in edit mode: the operator has a number to correct, and closing the
        // editor under them would discard it along with the explanation.
        if (e instanceof SlotInvalid) setError(e.message);
        else setError(`Could not save. ${e instanceof Error ? e.message : 'Please try again.'}`);
      }
    },
    [canManage, editValue],
  );

  if (!primary) {
    return (
      <main className="page">
        <p className="empty-line">
          {!isDemoAvailability && liveListings === null ? 'Loading your listings…' : 'No listings yet.'}
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">Vendor Portal</p>
            <h1 className="masthead__title">Availability</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="card">
          <div className="card__head card__head--row">
            <div>
              <h2>{primary.title}</h2>
              <p className="card__note">
                {canManage
                  ? 'Next seven days. Tap a slot to change its capacity.'
                  : 'Next seven days.'}
              </p>
              {!canManage && (
                <p className="card__note">
                  View only. {NO_LISTING_PERMISSION}
                </p>
              )}
              {!isDemoAvailability && primary.status !== 'approved' && (
                <p className="card__note">
                  Guests cannot see this experience until it is approved, so nobody can book these
                  departures yet.
                </p>
              )}
              {isDemoAvailability && (
                <p className="card__note card__note--demo">
                  Demo mode — capacity changes reset when you reload.
                </p>
              )}
            </div>
            <select
              className="input select-sm"
              value={primary.id}
              onChange={(e) => { setSelectedId(e.target.value); setEditingSlot(null); setError(null); }}
              aria-label="Choose listing"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>

          {!isDemoAvailability && canManage && timeZone ? (
            <AddDeparture
              key={primary.id}
              experienceId={primary.id}
              durationMinutes={primary.durationMinutes}
              timeZone={timeZone}
              onAdded={() => setReload((k) => k + 1)}
            />
          ) : null}

          {loading && <p className="card__note">Loading the calendar…</p>}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          {!loading && days.every((d) => d.slots.length === 0) && (
            <p className="card__note">
              No slots scheduled in the next seven days for this experience.
            </p>
          )}

          <div className="avail">
            {days.map((d) => (
              <div key={d.iso} className="avail__day">
                <p className="avail__date">{d.label}</p>
                <div className="avail__slots">
                  {d.slots.map((s) => {
                    const key: SlotKey = `${d.iso}|${s.time}`;
                    const capacity = s.capacity;
                    const left = Math.max(0, capacity - s.sold);
                    const state = left === 0 ? 'full' : left <= 3 ? 'tight' : 'open';

                    if (!canManage) {
                      return (
                        <div key={s.time} className={`slot slot--${state} slot--readonly`}>
                          <span className="slot__time">{s.time}</span>
                          <span className="slot__count">{s.sold}/{capacity}</span>
                          <span className="slot__state">{left === 0 ? 'Full' : `${left} left`}</span>
                        </div>
                      );
                    }

                    if (editingSlot === key) {
                      return (
                        <div key={s.time} className="slot slot--editing">
                          <span className="slot__time">{s.time}</span>
                          <input
                            type="number"
                            className="slot__input"
                            value={editValue}
                            min={s.sold}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(d.iso, s);
                              if (e.key === 'Escape') { setEditingSlot(null); setError(null); }
                            }}
                            autoFocus
                          />
                          <button type="button" className="slot__save" onClick={() => void saveEdit(d.iso, s)}>✓</button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={s.time}
                        type="button"
                        className={`slot slot--${state}`}
                        onClick={() => openEdit(key, s)}
                        title="Tap to change capacity"
                      >
                        <span className="slot__time">{s.time}</span>
                        <span className="slot__count">{s.sold}/{capacity}</span>
                        <span className="slot__state">{left === 0 ? 'Full' : `${left} left`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

/**
 * Schedule a departure, optionally repeated daily. Live only: the calendar is generated in demo
 * mode, so there is nothing to add to.
 */
function AddDeparture({
  experienceId,
  durationMinutes,
  timeZone,
  onAdded,
}: {
  experienceId: string;
  durationMinutes: number;
  timeZone: string;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(() => dayKey(new Date(), timeZone));
  const [time, setTime] = useState('09:00');
  const [capacity, setCapacity] = useState('12');
  const [repeat, setRepeat] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const added = await addSlots(true, {
        experienceId,
        date,
        time,
        capacity: Number(capacity),
        durationMinutes,
        repeatDays: Number(repeat),
        timeZone,
      });
      setMessage({ ok: true, text: `Added ${added} ${added === 1 ? 'departure' : 'departures'}.` });
      onAdded();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof SlotInvalid ? err.message : `Could not add. ${err instanceof Error ? err.message : 'Please try again.'}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--s-sm)', marginBottom: 'var(--s-md)' }}>
      <p className="card__note">
        <strong>Add a departure</strong> ({timeZone.replace('_', ' ')} time)
      </p>
      <div style={{ display: 'grid', gap: 'var(--s-sm)', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <label className="field">
          <span className="field__label">First date</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">Time</span>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">Seats</span>
          <input type="number" className="input" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">Repeat for (days)</span>
          <input type="number" className="input" min={1} max={60} value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
      </div>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        {busy ? 'Adding…' : 'Add departure'}
      </button>
      {message ? (
        <p className={message.ok ? 'card__note' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
