'use client';

import { useState } from 'react';
import { Crest } from '../../components/Crest';
import { formatUsd, vendorListings } from '../../lib/vendorData';
import type { DemoExperience } from '@cvip/demo';

type ListingStatus = 'approved' | 'draft';

interface LocalListing {
  id: string;
  title: string;
  summary: string;
  fromAmountMinor: number;
  durationMinutes: number;
  ratingCount: number;
  status: ListingStatus;
}

function toLocal(e: DemoExperience): LocalListing {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    fromAmountMinor: e.fromAmountMinor,
    durationMinutes: e.durationMinutes,
    ratingCount: e.ratingCount,
    status: e.status === 'approved' ? 'approved' : 'draft',
  };
}

const EMPTY_FORM = { title: '', summary: '', price: '', duration: '' };

/**
 * Listings — V-02.
 *
 * Write path runs in local state so edit, publish/unpublish and new listings all work in the demo
 * without a Supabase round-trip. The initial data seeds from the demo catalogue; mutations are
 * in-memory and reset on reload, which is the correct behaviour for a demonstration.
 */
export default function Listings() {
  const [listings, setListings] = useState<LocalListing[]>(() =>
    vendorListings().map(toLocal),
  );
  const [editing, setEditing] = useState<LocalListing | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState<string | null>(null);

  const flashSaved = (id: string) => {
    setSaved(id);
    setTimeout(() => setSaved(null), 1800);
  };

  const toggle = (id: string) => {
    setListings((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, status: l.status === 'approved' ? 'draft' : 'approved' }
          : l,
      ),
    );
  };

  const saveEdit = () => {
    if (!editing) return;
    setListings((prev) => prev.map((l) => (l.id === editing.id ? editing : l)));
    flashSaved(editing.id);
    setEditing(null);
  };

  const addListing = () => {
    const title = newForm.title.trim();
    const summary = newForm.summary.trim();
    if (!title || !summary) return;
    const price = Math.round(parseFloat(newForm.price || '0') * 100) || 9900;
    const duration = parseInt(newForm.duration || '120', 10) || 120;
    const id = `new-${Date.now()}`;
    setListings((prev) => [
      ...prev,
      { id, title, summary, fromAmountMinor: price, durationMinutes: duration, ratingCount: 0, status: 'draft' },
    ]);
    setNewForm(EMPTY_FORM);
    setAdding(false);
    flashSaved(id);
  };

  const live = listings.filter((l) => l.status === 'approved').length;
  const draft = listings.filter((l) => l.status !== 'approved').length;

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">Vendor Portal</p>
            <h1 className="masthead__title">Listings</h1>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="card">
          <div className="card__head card__head--row">
            <div>
              <h2>Your experiences</h2>
              <p className="card__note">
                {live} live · {draft} in draft
              </p>
            </div>
            <button type="button" className="btn btn--secondary" onClick={() => setAdding(true)}>
              New listing
            </button>
          </div>

          <ul className="listing-list">
            {listings.map((l) => (
              <li key={l.id} className={`listing ${saved === l.id ? 'listing--saved' : ''}`}>
                <div className="listing__main">
                  <div className="listing__head">
                    <span className={`pill ${l.status === 'approved' ? 'pill--live' : 'pill--draft'}`}>
                      {l.status === 'approved' ? 'Live' : 'Draft'}
                    </span>
                    <h3 className="listing__title">{l.title}</h3>
                  </div>
                  <p className="listing__summary">{l.summary}</p>
                  <p className="listing__meta">
                    {formatUsd(l.fromAmountMinor)} per adult ·{' '}
                    {Math.round(l.durationMinutes / 60)} hr{l.durationMinutes >= 120 ? 's' : ''} ·{' '}
                    {l.ratingCount.toLocaleString('en-US')} reviews
                  </p>
                </div>
                <div className="listing__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setEditing(l)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${l.status === 'approved' ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => toggle(l.id)}
                  >
                    {l.status === 'approved' ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
                {saved === l.id && (
                  <p className="listing__saved-notice" aria-live="polite">Saved</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* ── Edit modal ── */}
      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit listing">
          <div className="modal">
            <div className="modal__head">
              <h2>Edit listing</h2>
              <button type="button" className="modal__close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
            </div>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                type="text"
                className="input"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="input"
                rows={3}
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </label>

            <label className="field">
              <span className="field__label">Price per adult (US$)</span>
              <input
                type="number"
                className="input"
                value={(editing.fromAmountMinor / 100).toFixed(0)}
                min={1}
                onChange={(e) =>
                  setEditing({ ...editing, fromAmountMinor: Math.round(parseFloat(e.target.value || '0') * 100) })
                }
              />
            </label>

            <label className="field">
              <span className="field__label">Duration (minutes)</span>
              <input
                type="number"
                className="input"
                value={editing.durationMinutes}
                min={30}
                step={30}
                onChange={(e) =>
                  setEditing({ ...editing, durationMinutes: parseInt(e.target.value || '60', 10) })
                }
              />
            </label>

            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={saveEdit}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New listing modal ── */}
      {adding && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New listing">
          <div className="modal">
            <div className="modal__head">
              <h2>New listing</h2>
              <button type="button" className="modal__close" onClick={() => { setAdding(false); setNewForm(EMPTY_FORM); }} aria-label="Close">✕</button>
            </div>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                type="text"
                className="input"
                value={newForm.title}
                onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                placeholder="e.g. Sunset Catamaran Cruise"
              />
            </label>

            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="input"
                rows={3}
                value={newForm.summary}
                onChange={(e) => setNewForm({ ...newForm, summary: e.target.value })}
                placeholder="What makes this experience special…"
                style={{ resize: 'vertical' }}
              />
            </label>

            <label className="field">
              <span className="field__label">Price per adult (US$)</span>
              <input
                type="number"
                className="input"
                value={newForm.price}
                min={1}
                onChange={(e) => setNewForm({ ...newForm, price: e.target.value })}
                placeholder="85"
              />
            </label>

            <label className="field">
              <span className="field__label">Duration (minutes)</span>
              <input
                type="number"
                className="input"
                value={newForm.duration}
                min={30}
                step={30}
                onChange={(e) => setNewForm({ ...newForm, duration: e.target.value })}
                placeholder="120"
              />
            </label>

            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => { setAdding(false); setNewForm(EMPTY_FORM); }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!newForm.title.trim() || !newForm.summary.trim()}
                onClick={addListing}
              >
                Create draft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
