import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSavedExperienceIds, toggleSavedExperience } from './catalogue';
import { useSession } from './session';

/**
 * Saved items.
 *
 * Saving requires an account — `saved_items` is per-user and RLS-scoped, so there is nowhere to
 * put a guest's favourites. Rather than hiding the control, `requiresSignIn` lets the UI show it
 * and prompt, which keeps T-01's promise (browse freely) while being honest about the boundary.
 *
 * State is updated optimistically and rolled back on failure: a star that takes a round trip to
 * fill in feels broken, but a star that stays filled after a failed write is a lie.
 */

interface SavedContextValue {
  savedIds: Set<string>;
  requiresSignIn: boolean;
  isSaved: (experienceId: string) => boolean;
  toggle: (experienceId: string) => Promise<void>;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const userId = profile?.id;

  useEffect(() => {
    if (!userId) {
      setSavedIds(new Set());
      return;
    }
    let active = true;
    void loadSavedExperienceIds(userId).then((ids) => {
      if (active) setSavedIds(ids);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<SavedContextValue>(
    () => ({
      savedIds,
      requiresSignIn: !userId,
      isSaved: (id: string) => savedIds.has(id),
      toggle: async (id: string) => {
        if (!userId) return;

        const wasSaved = savedIds.has(id);
        const optimistic = new Set(savedIds);
        if (wasSaved) optimistic.delete(id);
        else optimistic.add(id);
        setSavedIds(optimistic);

        const { error } = await toggleSavedExperience(userId, id, wasSaved);
        if (error) {
          console.warn('[saved] could not update saved item:', error);
          // Roll back rather than leaving the UI asserting something that did not happen.
          setSavedIds((current) => {
            const reverted = new Set(current);
            if (wasSaved) reverted.add(id);
            else reverted.delete(id);
            return reverted;
          });
        }
      },
    }),
    [savedIds, userId],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error('useSaved must be used inside <SavedProvider>');
  return ctx;
}
