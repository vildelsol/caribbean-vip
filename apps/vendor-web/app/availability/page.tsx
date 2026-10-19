'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crest } from '../../components/Crest';
import { vendorListings } from '../../lib/vendorData';
import {
  SlotInvalid,
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
 */
export default function Availability() {
  const listings = vendorListings();
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? '');
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<SlotKey | null>(null);
  const [editValue, setEditValue] = useState('');

  const primary = listings.find((l) => l.id === selectedId) ?? listings[0];

  useEffect(() => {
    if (!primary) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const rows = await loadAvailability(primary, 7);
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
  }, [primary]);

  const openEdit = (key: SlotKey, slot: Slot) => {
    setError(null);
    setEditingSlot(key);
    setEditValue(String(slot.capacity));
  };

  const saveEdit = useCallback(
    async (iso: string, slot: Slot) => {
      const parsed = Number.parseInt(editValue, 10);
      try {
        const next = await setSlotCapacity(slot, parsed);
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
    [editValue],
  );

  if (!primary) {
    return (
      <main className="page">
        <p className="empty-line">No listings yet.</p>
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
              <p className="card__note">Next seven days. Tap a slot to change its capacity.</p>
              {isDemoAvailability && (
                <p className="card__note card__note--demo">
                  Demo mode — capacity changes reset when you reload.
                </p>
              )}
            </div>
            <select
              className="input select-sm"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setEditingSlot(null); setError(null); }}
              aria-label="Choose listing"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>

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
