'use client';

import { useState } from 'react';
import { Crest } from '../../components/Crest';
import { capacityFor, vendorListings } from '../../lib/vendorData';

type SlotKey = string; // `${iso}|${time}`

/**
 * Availability — V-03.
 *
 * Capacity overrides are held in local state so tapping a slot to change it works in the demo.
 * The listing selector switches which experience's calendar is shown.
 */
export default function Availability() {
  const listings = vendorListings();
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? '');
  const [capacityOverrides, setCapacityOverrides] = useState<Record<SlotKey, number>>({});
  const [editingSlot, setEditingSlot] = useState<SlotKey | null>(null);
  const [editValue, setEditValue] = useState('');

  const primary = listings.find((l) => l.id === selectedId) ?? listings[0];

  if (!primary) {
    return (
      <main className="page">
        <p className="empty-line">No listings yet.</p>
      </main>
    );
  }

  const days = capacityFor(primary, 7);

  const openEdit = (key: SlotKey, currentCapacity: number) => {
    setEditingSlot(key);
    setEditValue(String(capacityOverrides[key] ?? currentCapacity));
  };

  const saveEdit = (key: SlotKey) => {
    const val = parseInt(editValue, 10);
    if (!isNaN(val) && val > 0) {
      setCapacityOverrides((prev) => ({ ...prev, [key]: val }));
    }
    setEditingSlot(null);
  };

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
            </div>
            <select
              className="input select-sm"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setCapacityOverrides({}); }}
              aria-label="Choose listing"
            >
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>

          <div className="avail">
            {days.map((d) => (
              <div key={d.iso} className="avail__day">
                <p className="avail__date">{d.label}</p>
                <div className="avail__slots">
                  {d.slots.map((s) => {
                    const key: SlotKey = `${d.iso}|${s.time}`;
                    const capacity = capacityOverrides[key] ?? s.capacity;
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
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(key); if (e.key === 'Escape') setEditingSlot(null); }}
                            autoFocus
                          />
                          <button type="button" className="slot__save" onClick={() => saveEdit(key)}>✓</button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={s.time}
                        type="button"
                        className={`slot slot--${state}`}
                        onClick={() => openEdit(key, capacity)}
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
