'use client';

import { useEffect, useRef, useState } from 'react';
import { REDEMPTION_COPY, isDemoScanner, redeemToken, type RedemptionView } from '../lib/redeem';

/**
 * Voucher scanner — V-04 and V-05.
 *
 * Two ways in, both first-class:
 *
 *   1. The camera, which is what a vendor uses in practice, on the phone in their pocket.
 *   2. A paste/type box, which is what makes this usable when the camera is refused, the guest's
 *      screen is cracked, or the whole thing is being demonstrated on a laptop with the lid facing
 *      the wrong way. It is not a fallback bolted on; it is tested and shipped equally.
 *
 * The camera library is imported dynamically because it touches `navigator.mediaDevices` at module
 * scope, which does not exist while Next renders this page on the server.
 */
export function Scanner() {
  const [mode, setMode] = useState<'idle' | 'camera'>('idle');
  const [manual, setManual] = useState('');
  const [scannerName, setScannerName] = useState('Front desk');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RedemptionView | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);

  const regionId = 'voucher-camera';
  // Held in a ref rather than state: stopping the camera must not depend on a re-render having
  // happened, or an unmount mid-scan leaves the light on.
  const cameraRef = useRef<{ stop: () => Promise<void> } | null>(null);

  const submit = async (token: string) => {
    if (busy || token.trim().length === 0) return;
    setBusy(true);
    setTransportError(null);
    try {
      setOutcome(await redeemToken(token, scannerName));
    } catch (error) {
      setOutcome(null);
      setTransportError(error instanceof Error ? error.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const stopCamera = async () => {
    const camera = cameraRef.current;
    cameraRef.current = null;
    if (camera) {
      try {
        await camera.stop();
      } catch {
        // Already stopped, or the track was torn down by the browser. Nothing to recover.
      }
    }
    setMode('idle');
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const camera = new Html5Qrcode(regionId);
      cameraRef.current = camera;
      setMode('camera');
      await camera.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          // Stop before redeeming: the callback fires many times a second, and a voucher must not
          // be submitted repeatedly while the first request is still open.
          void stopCamera().then(() => submit(decoded));
        },
        () => {
          // Per-frame decode misses are the normal case while aiming, not errors worth surfacing.
        },
      );
    } catch (error) {
      cameraRef.current = null;
      setMode('idle');
      setCameraError(
        error instanceof Error
          ? `${error.message} — use the code box below instead.`
          : 'Could not start the camera. Use the code box below instead.',
      );
    }
  };

  useEffect(() => {
    return () => {
      void cameraRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const copy = outcome ? REDEMPTION_COPY[outcome.result] : null;
  // `fail` covers expired, unknown and bad-signature alike: all three mean do not admit, and a
  // vendor does not need three colours to be told the same thing.
  const verdictTone = copy?.tone === 'ok' ? 'ok' : copy?.tone === 'warn' ? 'warn' : 'bad';

  return (
    <section style={{ display: 'grid', gap: 'var(--s-md)' }}>
      <div className="field">
        <label htmlFor="scanner-name" className="field__label">
          Who is scanning?
        </label>
        <input
          id="scanner-name"
          className="input"
          value={scannerName}
          onChange={(e) => setScannerName(e.target.value)}
        />
        <p className="field__hint">
          Recorded against the redemption, and shown to whoever scans the voucher next.
        </p>
      </div>

      {mode === 'camera' ? (
        <div style={{ display: 'grid', gap: 'var(--s-sm)' }}>
          <div id={regionId} className="camera" />
          <button type="button" onClick={() => void stopCamera()} className="btn btn--secondary">
            Stop camera
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void startCamera()} className="btn btn--primary">
          Scan with camera
        </button>
      )}

      {/* The region must exist in the DOM before html5-qrcode is told to render into it. */}
      {mode === 'camera' ? null : <div id={regionId} hidden />}

      {cameraError ? <p className="field__hint">{cameraError}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(manual);
        }}
        style={{ display: 'grid', gap: 6 }}
      >
        <label htmlFor="voucher-code" className="field__label">
          Or type / paste the voucher code
        </label>
        <input
          id="voucher-code"
          className="input input--code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="cvip://v1/…"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy || manual.trim().length === 0}
          className="btn btn--secondary"
        >
          {busy ? 'Checking…' : 'Check voucher'}
        </button>
      </form>

      {transportError ? (
        <div className="transport">
          <p className="transport__title">Could not check this voucher</p>
          <p>{transportError}</p>
          <p>
            This is a connection problem, not a decision about the voucher. Try again before turning
            anyone away.
          </p>
        </div>
      ) : null}

      {outcome && copy ? (
        <div className={`verdict verdict--${verdictTone}`} role="status" aria-live="polite">
          <p className="verdict__headline">{copy.headline}</p>
          <p className="verdict__detail">{copy.detail}</p>

          {/* V-05's acceptance criterion: a second scan must show WHEN and BY WHOM, not just refuse. */}
          {outcome.result === 'already_redeemed' ? (
            <div className="verdict__record">
              <span className="verdict__recordLabel">First redeemed</span>
              <strong className="verdict__recordValue">
                {outcome.originalRedeemedAt
                  ? new Date(outcome.originalRedeemedAt).toLocaleString()
                  : 'Time not recorded'}
              </strong>
              <span className="verdict__recordBy">
                Scanned by {outcome.originalScanner ?? 'an unnamed scanner'}
              </span>
            </div>
          ) : null}

          {outcome.result === 'ok' && outcome.redeemedAt ? (
            <span className="verdict__stamp">
              Redeemed at {new Date(outcome.redeemedAt).toLocaleString()} by {scannerName}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setOutcome(null);
              setManual('');
            }}
            className="btn btn--onDark"
          >
            Scan another
          </button>
        </div>
      ) : null}

      {isDemoScanner ? (
        <p className="field__hint">
          Demo scanner — no backend configured. The signature on every code is genuinely verified,
          and redemptions are remembered in this browser tab only, so a reload starts fresh.
        </p>
      ) : null}
    </section>
  );
}
