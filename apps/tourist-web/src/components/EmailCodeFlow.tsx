import { useEffect, useReducer, useState } from 'react';
import {
  emailCooldownSeconds,
  flowReducer,
  initialFlow,
  resendCooldownSeconds,
  type AccountResult,
} from '../lib/account';
import { messageFor } from '../lib/accountCopy';
import { PrimaryButton, TextButton } from './kit';
import './AccountCard.css';

/**
 * Email -> emailed code -> done. LIVE MODE ONLY: rendered by AccountCard and SignInSheet, which
 * are themselves only mounted when `isLiveMode`.
 *
 * The states and the 60s resend cooldown are `flowReducer` in lib/account.ts; this component only
 * wires inputs to it and runs the two calls it is handed.
 */
export function EmailCodeFlow({
  send,
  verify,
  onDone,
  onCollision,
  initialEmail = '',
  sendLabel = 'Email me a code',
  doneMessage,
  idPrefix,
}: {
  send: (email: string) => Promise<AccountResult>;
  verify: (email: string, code: string) => Promise<AccountResult>;
  onDone?: () => void;
  onCollision?: (email: string) => void;
  initialEmail?: string;
  sendLabel?: string;
  doneMessage: (email: string) => string;
  idPrefix: string;
}) {
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // A one-second tick only while a code is outstanding, for the resend countdown.
  const awaiting = flow.phase === 'awaiting_code';
  useEffect(() => {
    if (!awaiting) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [awaiting]);

  useEffect(() => {
    if (flow.phase === 'done') onDone?.();
    if (flow.phase === 'collision') onCollision?.(flow.email);
    // Fire once per arrival in a phase; the callbacks are deliberately not dependencies.
  }, [flow.phase]);

  const runSend = async (target: string) => {
    const result = await send(target);
    dispatch(result.ok ? { type: 'sent', at: Date.now() } : { type: 'failed', reason: result.reason });
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (flow.phase === 'sending') return;
    const at = Date.now();
    // A code went to this address under a minute ago: the reducer goes straight back to the code
    // step, and nothing is sent.
    const blocked = emailCooldownSeconds(flow, email, at) > 0;
    dispatch({ type: 'submitEmail', email, now: at });
    if (!blocked) void runSend(email);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (flow.phase !== 'awaiting_code') return;
    dispatch({ type: 'submitCode' });
    const result = await verify(flow.email, code);
    dispatch(result.ok ? { type: 'verified' } : { type: 'failed', reason: result.reason });
  };

  const cooldown = resendCooldownSeconds(flow, now);
  const resend = () => {
    const at = Date.now();
    if (resendCooldownSeconds(flow, at) > 0) return;
    dispatch({ type: 'resend', now: at });
    setCode('');
    void runSend(flow.email);
  };

  if (flow.phase === 'done') {
    return (
      <p className="t-caption c-ink" role="status">
        {doneMessage(flow.email)}
      </p>
    );
  }

  // The parent owns what a collision looks like when it handles one.
  if (flow.phase === 'collision' && onCollision) return null;

  // A resend keeps the code step on screen: the code already emailed is still valid.
  if (flow.phase === 'awaiting_code' || flow.phase === 'verifying' || (flow.phase === 'sending' && flow.resending)) {
    const verifying = flow.phase === 'verifying';
    const resending = flow.phase === 'sending';
    return (
      <form className="acct__form" onSubmit={submitCode} noValidate>
        <p className="t-caption c-muted">
          We sent a code to <strong className="c-ink">{flow.email}</strong>. It can take a minute to arrive.
        </p>
        <label className="acct__field" htmlFor={`${idPrefix}-code`}>
          <span className="acct__label">Code from the email</span>
          <input
            id={`${idPrefix}-code`}
            className="acct__input acct__input--code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            disabled={verifying}
          />
        </label>
        {flow.error ? (
          <p className="t-micro c-urgent" role="alert">
            {messageFor(flow.error)}
          </p>
        ) : null}
        <PrimaryButton type="submit" disabled={verifying || resending || code.trim() === ''}>
          {verifying ? 'Checking…' : 'Confirm'}
        </PrimaryButton>
        <div className="acct__row">
          <TextButton onClick={resend} disabled={cooldown > 0 || verifying || resending}>
            {resending ? 'Sending…' : cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </TextButton>
          <TextButton onClick={() => dispatch({ type: 'reset' })} disabled={verifying || resending}>
            Use a different email
          </TextButton>
        </div>
      </form>
    );
  }

  const sending = flow.phase === 'sending';
  return (
    <form className="acct__form" onSubmit={submitEmail} noValidate>
      <label className="acct__field" htmlFor={`${idPrefix}-email`}>
        <span className="acct__label">Email</span>
        <input
          id={`${idPrefix}-email`}
          className="acct__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
        />
      </label>
      {flow.error ? (
        <p className="t-micro c-urgent" role="alert">
          {messageFor(flow.error)}
        </p>
      ) : null}
      <PrimaryButton type="submit" disabled={sending || email.trim() === ''}>
        {sending ? 'Sending…' : sendLabel}
      </PrimaryButton>
    </form>
  );
}
