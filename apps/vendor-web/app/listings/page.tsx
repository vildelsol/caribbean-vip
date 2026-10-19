'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crest } from '../../components/Crest';
import { formatUsd } from '../../lib/vendorData';
import { useActiveMembership } from '../../lib/session';
import {
  LISTING_CATEGORIES,
  LISTING_LIMITS,
  ListingInvalid,
  createListing,
  isDemoListings,
  loadDestinations,
  loadListings,
  saveListing,
  setListingStatus,
  type DestinationOption,
  type VendorListing,
} from '../../lib/listings';

const EMPTY_FORM = {
  title: '',
  summary: '',
  price: '',
  duration: '',
  category: LISTING_CATEGORIES[0],
  destinationId: '',
};

/** `waterfalls` reads as `Waterfalls`, `day_trips` as `Day trips`. */
function categoryLabel(c: string): string {
  const spaced = c.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Listings — V-02.
 *
 * Reads and writes through `lib/listings`, which decides between Supabase and the demo store.
 * This screen does not know which one it is talking to: every mutation is awaited, every failure
 * arrives as an exception, and a `ListingInvalid` is the operator's to fix while anything else is
 * reported as a problem on our side rather than theirs.
 *
 * `description` and `pickup_info` are bounded in Postgres but still have no input here, so a
 * vendor cannot set them from this screen. That is a gap in the form, not in the constraints.
 */
export default function Listings() {
  const membership = useActiveMembership();
  const orgId = membership?.vendor_org_id ?? null;
  const islandId = membership?.vendor_organizations?.island_id ?? null;

  const [listings, setListings] = useState<VendorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [editing, setEditing] = useState<VendorListing | null>(null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const rows = await loadListings(orgId);
        if (active) {
          setListings(rows);
          setLoadError(null);
        }
      } catch (e) {
        if (active) setLoadError(e instanceof Error ? e.message : 'Could not load your listings.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await loadDestinations(islandId);
        if (active) setDestinations(rows);
      } catch {
        /* The create form falls back to a free choice of nothing; the insert will say so. */
      }
    })();
    return () => {
      active = false;
    };
  }, [islandId]);

  const flashSaved = (id: string) => {
    setSaved(id);
    setTimeout(() => setSaved(null), 1800);
  };

  /**
   * One place where a failed write becomes something the operator reads.
   *
   * `ListingInvalid` is their problem and says what to change. Anything else reached the network
   * or the database, so it is reported as ours — a vendor told "your title is wrong" because a
   * connection dropped goes and rewrites text that was already fine.
   */
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setError(null);
    } catch (e) {
      if (e instanceof ListingInvalid) setError(e.message);
      else setError(`Could not save. ${e instanceof Error ? e.message : 'Please try again.'}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const openEdit = (l: VendorListing) => {
    setError(null);
    setEditing(l);
  };

  const closeEdit = () => {
    setError(null);
    setEditing(null);
  };

  const openAdd = () => {
    setError(null);
    setNewForm({ ...EMPTY_FORM, destinationId: destinations[0]?.id ?? '' });
    setAdding(true);
  };

  const closeAdd = () => {
    setError(null);
    setNewForm(EMPTY_FORM);
    setAdding(false);
  };

  const toggle = (l: VendorListing) =>
    run(async () => {
      const next = await setListingStatus(orgId, l.id, l.status === 'approved' ? 'draft' : 'approved');
      setListings((prev) => prev.map((x) => (x.id === next.id ? next : x)));
    });

  const saveEdit = () => {
    if (!editing) return;
    void run(async () => {
      const next = await saveListing(orgId, editing);
      setListings((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      flashSaved(next.id);
      setEditing(null);
    });
  };

  const addListing = () =>
    void run(async () => {
      const next = await createListing(orgId, islandId, {
        title: newForm.title,
        summary: newForm.summary,
        // The placeholders the form shows are the values an operator gets by leaving these blank.
        fromAmountMinor: Math.round(parseFloat(newForm.price || '0') * 100) || 9900,
        durationMinutes: parseInt(newForm.duration || '120', 10) || 120,
        category: newForm.category,
        destinationId: newForm.destinationId,
      });
      setListings((prev) => [...prev, next]);
      setNewForm(EMPTY_FORM);
      setAdding(false);
      flashSaved(next.id);
    });

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
            <button type="button" className="btn btn--secondary" onClick={openAdd} disabled={loading}>
              New listing
            </button>
          </div>

          {/* Operating rule 9: demo content is never passed off as live. An operator who edits
              here and finds the change gone tomorrow should have been told why today. */}
          {isDemoListings && (
            <p className="card__note card__note--demo">
              Demo mode — changes stay in this browser and reset when you reload.
            </p>
          )}

          {loading && <p className="card__note">Loading your listings…</p>}

          {loadError && (
            <p className="field-error" role="alert">
              Could not load your listings. {loadError}
            </p>
          )}

          {!loading && !loadError && listings.length === 0 && (
            <p className="card__note">
              No listings yet. Use <strong>New listing</strong> to add your first experience.
            </p>
          )}

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
                    onClick={() => void toggle(l)}
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
              <span className="field__label">Summary</span>
              <textarea
                className="input"
                rows={3}
                maxLength={LISTING_LIMITS.summary}
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                style={{ resize: 'vertical' }}
              />
              <p className="field__hint">
                The line guests read on the card. {LISTING_LIMITS.summary} characters.
              </p>
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
              <button type="button" className="btn btn--primary" onClick={saveEdit} disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
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
              <span className="field__label">Summary</span>
              <textarea
                className="input"
                rows={3}
                maxLength={LISTING_LIMITS.summary}
                value={newForm.summary}
                onChange={(e) => setNewForm({ ...newForm, summary: e.target.value })}
                placeholder="What makes this experience special…"
                style={{ resize: 'vertical' }}
              />
              <p className="field__hint">
                The line guests read on the card. {LISTING_LIMITS.summary} characters.
              </p>
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

            {/* `experiences` requires a category and a destination, so the form has to ask. The
                island is not asked: it is the vendor's own, and offering a choice invites a
                listing filed under an island the operator does not trade in. */}
            <label className="field">
              <span className="field__label">Category</span>
              <select
                className="input"
                value={newForm.category}
                onChange={(e) =>
                  setNewForm({ ...newForm, category: e.target.value as typeof newForm.category })
                }
              >
                {LISTING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Where it runs</span>
              <select
                className="input"
                value={newForm.destinationId}
                onChange={(e) => setNewForm({ ...newForm, destinationId: e.target.value })}
              >
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
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
                disabled={busy || !newForm.title.trim() || !newForm.summary.trim()}
                onClick={addListing}
              >
                {busy ? 'Creating…' : 'Create draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
