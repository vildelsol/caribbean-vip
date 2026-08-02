'use client';

import { useEffect, useRef, useState } from 'react';
import { radius, semantic, spacing } from '@cvip/ui';
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
  const toneColour =
    copy?.tone === 'ok' ? semantic.brand : copy?.tone === 'warn' ? '#B8791F' : semantic.alert;

  return (
    <section style={{ display: 'grid', gap: spacing.md }}>
      <div style={{ display: 'grid', gap: spacing.xs }}>
        <label htmlFor="scanner-name" style={{ fontSize: 14, color: semantic.textMuted }}>
          Who is scanning?
        </label>
        <input
          id="scanner-name"
          value={scannerName}
          onChange={(e) => setScannerName(e.target.value)}
          style={inputStyle}
        />
        <p style={{ fontSize: 13, color: semantic.textMuted, margin: 0 }}>
          Recorded against the redemption, and shown to whoever scans the voucher next.
        </p>
      </div>

      {mode === 'camera' ? (
        <div style={{ display: 'grid', gap: spacing.sm }}>
          <div
            id={regionId}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: radius.md,
              overflow: 'hidden',
              background: '#000',
            }}
          />
          <button type="button" onClick={() => void stopCamera()} style={secondaryButton}>
            Stop camera
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void startCamera()} style={primaryButton}>
          Scan with camera
        </button>
      )}

      {/* The region must exist in the DOM before html5-qrcode is told to render into it. */}
      {mode === 'camera' ? null : <div id={regionId} style={{ display: 'none' }} />}

      {cameraError ? (
        <p style={{ color: semantic.alert, fontSize: 14, margin: 0 }}>{cameraError}</p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(manual);
        }}
        style={{ display: 'grid', gap: spacing.xs }}
      >
        <label htmlFor="voucher-code" style={{ fontSize: 14, color: semantic.textMuted }}>
          Or type / paste the voucher code
        </label>
        <input
          id="voucher-code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="cvip://v1/…"
          autoComplete="off"
          spellCheck={false}
          style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
        <button type="submit" disabled={busy || manual.trim().length === 0} style={primaryButton}>
          {busy ? 'Checking…' : 'Check voucher'}
        </button>
      </form>

      {transportError ? (
        <div style={{ ...resultBox, borderColor: semantic.alert }}>
          <strong style={{ color: semantic.alert }}>Could not check this voucher</strong>
          <p style={{ margin: 0, color: semantic.textMuted }}>{transportError}</p>
          <p style={{ margin: 0, color: semantic.textMuted, fontSize: 14 }}>
            This is a connection problem, not a decision about the voucher. Try again before turning
            anyone away.
          </p>
        </div>
      ) : null}

      {outcome && copy ? (
        <div
          style={{ ...resultBox, borderColor: toneColour, borderWidth: 2 }}
          role="status"
          aria-live="polite"
        >
          <strong style={{ color: toneColour, fontSize: 20 }}>{copy.headline}</strong>
          <p style={{ margin: 0 }}>{copy.detail}</p>

          {/* V-05's acceptance criterion: a second scan must show WHEN and BY WHOM, not just refuse. */}
          {outcome.result === 'already_redeemed' ? (
            <div
              style={{
                background: semantic.surfaceSunken,
                borderRadius: radius.sm,
                padding: spacing.md,
                display: 'grid',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14, color: semantic.textMuted }}>First redeemed</span>
              <strong>
                {outcome.originalRedeemedAt
                  ? new Date(outcome.originalRedeemedAt).toLocaleString()
                  : 'Time not recorded'}
              </strong>
              <span style={{ fontSize: 14, color: semantic.textMuted }}>
                Scanned by {outcome.originalScanner ?? 'an unnamed scanner'}
              </span>
            </div>
          ) : null}

          {outcome.result === 'ok' && outcome.redeemedAt ? (
            <span style={{ fontSize: 14, color: semantic.textMuted }}>
              Redeemed at {new Date(outcome.redeemedAt).toLocaleString()} by {scannerName}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setOutcome(null);
              setManual('');
            }}
            style={secondaryButton}
          >
            Scan another
          </button>
        </div>
      ) : null}

      {isDemoScanner ? (
        <p style={{ fontSize: 13, color: semantic.alert, margin: 0 }}>
          Demo scanner — no backend configured. The signature on every code is genuinely verified,
          and redemptions are remembered in this browser tab only, so a reload starts fresh.
        </p>
      ) : null}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  fontSize: 16,
  borderRadius: radius.md,
  border: `1px solid ${semantic.border}`,
  background: semantic.surface,
  color: semantic.textPrimary,
  width: '100%',
  boxSizing: 'border-box',
};

const primaryButton: React.CSSProperties = {
  padding: spacing.md,
  fontSize: 16,
  fontWeight: 600,
  borderRadius: radius.md,
  border: 'none',
  background: semantic.brand,
  color: semantic.textOnDark,
  cursor: 'pointer',
};

const secondaryButton: React.CSSProperties = {
  padding: spacing.md,
  fontSize: 16,
  borderRadius: radius.md,
  border: `1px solid ${semantic.border}`,
  background: semantic.surface,
  color: semantic.textPrimary,
  cursor: 'pointer',
};

const resultBox: React.CSSProperties = {
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.md,
  padding: spacing.lg,
  display: 'grid',
  gap: spacing.sm,
  background: semantic.surface,
};
