'use client';

import { useEffect, useRef, type HTMLAttributes } from 'react';
import { attachDialogFocus } from '@cvip/ui';

/**
 * A `div` that behaves as a modal dialog for the keyboard: focus moves in when it mounts, Tab stays
 * inside, Escape calls `onClose`, and focus returns to the opener when it unmounts. Render it only
 * while the dialog is open.
 */
export function DialogSurface({ onClose, ...props }: HTMLAttributes<HTMLDivElement> & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => (ref.current ? attachDialogFocus(ref.current, () => close.current()) : undefined), []);
  return <div ref={ref} {...props} />;
}
