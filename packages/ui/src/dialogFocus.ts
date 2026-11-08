/**
 * Keyboard behaviour for a modal dialog, with no framework in it.
 *
 * A dialog marked `aria-modal` promises that nothing behind it can be reached. Without this, Tab
 * walks out of the dialog into the page underneath, Escape does nothing, and focus stays on the
 * button that opened it, which may have just disappeared. Axe cannot see any of that.
 *
 * `attachDialogFocus` does four things: moves focus into the dialog, keeps Tab inside it, closes on
 * Escape, and gives focus back to where it was when the dialog goes away.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Where Tab should go next, wrapping at both ends.
 *
 * Pure so it can be tested without a browser. `current` that is not in `items` (focus has escaped,
 * or sits on the dialog itself) goes to the first item, or the last for Shift+Tab. An empty list
 * returns null: there is nowhere to go, and the caller keeps focus where it is.
 */
export function nextTabTarget<T>(items: readonly T[], current: T | null, shift: boolean): T | null {
  if (items.length === 0) return null;
  const at = current === null ? -1 : items.indexOf(current);
  if (at === -1) return shift ? (items[items.length - 1] ?? null) : (items[0] ?? null);
  const next = shift ? at - 1 : at + 1;
  return items[(next + items.length) % items.length] ?? null;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  );
}

/** Returns a cleanup. Call it when the dialog unmounts. */
export function attachDialogFocus(root: HTMLElement, onClose: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusableWithin(root)[0];
  if (first) {
    first.focus();
  } else {
    root.tabIndex = -1;
    root.focus();
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableWithin(root);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = nextTabTarget(items, active, event.shiftKey);
    event.preventDefault();
    (target ?? root).focus();
  };
  document.addEventListener('keydown', onKeyDown);

  return () => {
    document.removeEventListener('keydown', onKeyDown);
    if (opener && opener.isConnected) opener.focus();
  };
}
