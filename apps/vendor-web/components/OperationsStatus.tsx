import { Crest } from './Crest';
import type { OperationsState } from '../lib/useOperations';

/** Loading and failure states for screens that read live data. Never shown in demo mode. */
export function OperationsStatus({
  state,
  title,
}: {
  state: Exclude<OperationsState, { status: 'ready' }>;
  title: string;
}) {
  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <Crest />
          <div>
            <p className="masthead__sub">Vendor Portal</p>
            <h1 className="masthead__title">{title}</h1>
          </div>
        </div>
      </header>
      <main className="page">
        <p className="empty-line" role={state.status === 'error' ? 'alert' : 'status'}>
          {state.status === 'error' ? `Could not load this screen. ${state.message}` : 'Loading…'}
        </p>
      </main>
    </>
  );
}
