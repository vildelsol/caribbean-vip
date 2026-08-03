import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A real, scannable QR code for the signed ticket token.
 *
 * Not a decorative grid. The design draws a fake one — understandable in a prototype — but a
 * demonstration whose central claim is "the vendor scans this" has to survive someone actually
 * pointing a phone at the screen. This encodes the `cvip://v1/<payload>.<hmac>` token that
 * `signTicket` produced, so a scan yields the token that `verifyTicket` checks.
 *
 * Rendered to a canvas at 2× and scaled down, because a QR resampled by the browser from a
 * too-small bitmap is exactly the one that will not scan under fluorescent light.
 *
 * Error correction is `M`. `H` would survive a logo in the middle, which this does not have, and
 * would make the modules smaller for the same physical size — the wrong trade for a code that is
 * scanned off a phone screen at arm's length.
 */
export function QR({ value, size = 176, label }: { value: string; size?: number; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    QRCode.toCanvas(el, value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        // Deep green on the ticket's warm white. Both are well past the 3:1 that scanners need,
        // and pure black on this stock reads colder than the rest of the design.
        dark: '#16302Aff',
        light: '#FFFFFFff',
      },
    })
      .then(() => {
        if (cancelled) return;
        // `toCanvas` writes its own `style.width`/`style.height` in *drawing* pixels, overwriting
        // the display size React set. Left alone, a code drawn at 2× renders at 2× and pushes off
        // the side of the screen — which it did on both the ticket and the confirmation. The
        // backing store stays at 2× (that is the point); only the CSS size is corrected.
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        setFailed(false);
      })
      .catch(() => {
        // A QR that cannot be drawn must not take the screen down with it — the booking reference
        // beneath it is a working fallback, and the ticket screen says so.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div
        className="qr qr--failed"
        style={{ width: size, height: size }}
        role="img"
        aria-label="The QR code could not be drawn. Use the booking reference below."
      >
        <span className="t-micro">Use the reference below</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvas}
      className="qr"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? 'Ticket QR code'}
    />
  );
}
