'use client';

import { useState } from 'react';
import { LISTING_LIMITS, listingTextSchema } from '@cvip/types';
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
    // Nullable in Postgres. The new-listing form asks for one, editing does not enforce it, so a
    // blank summary here is a seeded or API-created row for the operator to fill.
    summary: e.summary ?? '',
    fromAmountMinor: e.fromAmountMinor,
    durationMinutes: e.durationMinutes,
    ratingCount: e.ratingCount,
    status: e.status === 'approved' ? 'approved' : 'draft',
  };
}

const EMPTY_FORM = { title: '', summary: '', price: '', duration: '' };

/**
 * The two text fields this form actually edits, validated by the same schema the database
 * constraints mirror.
 *
 * Both save paths persist `parsed.data`, not the raw input, and that is the point rather than a
 * detail: `listingTextSchema` trims before it measures length, while the Postgres check measures
 * what is stored. Save the raw string and a title of exactly `LISTING_LIMITS.title` characters
 * followed by a space passes here and violates `experiences_title_length` on the way in.
 */
const formTextSchema = listingTextSchema.pick({ title: true, summary: true });

/**
 * The first problem, in words the operator can act on. Zod always reports at least one issue on a
 * failure, but the index is unchecked, so the fallback is here to keep a silent save impossible:
 * no message must never mean no error.
 *
 * Typed structurally rather than as `z.ZodError`, because `zod` is not a dependency of this app —
 * the schema arrives through `@cvip/types`.
 */
function firstMessage(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? 'That listing cannot be saved as it is.';
}

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
  const [error, setError] = useState<string | null>(null);

  const openEdit = (l: LocalListing) => {
    setError(null);
    setEditing(l);
  };

  const closeEdit = () => {
    setError(null);
    setEditing(null);
  };

  const openAdd = () => {
    setError(null);
    setAdding(true);
  };

  const closeAdd = () => {
    setError(null);
    setNewForm(EMPTY_FORM);
    setAdding(false);
  };

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
    const parsed = formTextSchema.safeParse({ title: editing.title, summary: editing.summary });
    if (!parsed.success) {
      setError(firstMessage(parsed.error));
      return;
    }
    const next = { ...editing, title: parsed.data.title, summary: parsed.data.summary ?? '' };
    setListings((prev) => prev.map((l) => (l.id === next.id ? next : l)));
    setError(null);
    flashSaved(next.id);
    setEditing(null);
  };

  const addListing = () => {
    const parsed = formTextSchema.safeParse({ title: newForm.title, summary: newForm.summary });
    if (!parsed.success) {
      setError(firstMessage(parsed.error));
      return;
    }
    const title = parsed.data.title;
    const summary = parsed.data.summary ?? '';
    const price = Math.round(parseFloat(newForm.price || '0') * 100) || 9900;
    const duration = parseInt(newForm.duration || '120', 10) || 120;
    const id = `new-${Date.now()}`;
    setListings((prev) => [
      ...prev,
      { id, title, summary, fromAmountMinor: price, durationMinutes: duration, ratingCount: 0, status: 'draft' },
    ]);
    setNewForm(EMPTY_FORM);
    setAdding(false);
    setError(null);
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
            <button type="button" className="btn btn--secondary" onClick={openAdd}>
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
                  <p className="listing__summary">{l.summary || 'No summary yet — add one so guests know what this is.'}</p>
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
                    onClick={() => openEdit(l)}
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
              <button type="button" className="modal__close" onClick={closeEdit} aria-label="Close">✕</button>
            </div>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                type="text"
                className="input"
                maxLength={LISTING_LIMITS.title}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                className="input"
                rows={3}
                maxLength={LISTING_LIMITS.summary}
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

            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}

            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={closeEdit}>
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
              <button type="button" className="modal__close" onClick={closeAdd} aria-label="Close">✕</button>
            </div>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                type="text"
                className="input"
                maxLength={LISTING_LIMITS.title}
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
                maxLength={LISTING_LIMITS.summary}
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

            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}

            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={closeAdd}>
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
