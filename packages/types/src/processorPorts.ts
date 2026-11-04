/**
 * Processor ports: the one shape every outside tool or database must fit to hold guest data.
 *
 * The stack is not chosen. Email, maps, AI, analytics, payments, even the database may change, and a
 * new one must not mean new privacy plumbing. Each tool implements `ProcessorPort`; the registry
 * runs export and erasure across all of them and says plainly which did not finish. Supabase,
 * Stripe and the rest are adapters behind this, not assumptions in it.
 *
 * Pure: no I/O here. An adapter does the I/O. A port that throws, times out or says it cannot erase
 * is reported as incomplete, never skipped, so "erased everywhere" can only be true when it is.
 */

export type ProcessorKind = 'database' | 'payments' | 'email' | 'maps' | 'ai' | 'analytics' | 'hosting' | 'storage' | 'other';

/** Who the request is about. Adapters match on whichever identifier the tool holds. */
export interface SubjectRef {
  userId: string;
  email?: string | null;
}

export type PortFailure = 'unsupported' | 'failed' | 'timeout';

/** A tool either did the work, never held this person (fine), or did not finish (not fine). */
export type PortResult<T> =
  | { status: 'done'; value: T }
  | { status: 'not_held' }
  | { status: 'incomplete'; reason: PortFailure; retry: boolean };

export interface ErasureReceipt {
  /** What the tool says it removed, in words a person can read. Never personal data itself. */
  summary: string;
}

export interface ProcessorPort {
  /** Stable key, lower-case: `stripe`, `supabase`. Matches a row in `docs/privacy/processor-record.md`. */
  readonly id: string;
  readonly displayName: string;
  readonly kind: ProcessorKind;
  /** Kinds of data it holds, e.g. `['email', 'payment ids']`. Not empty: a tool that holds nothing needs no port. */
  readonly categories: readonly string[];
  /** Where it stores data, e.g. `us-east-1`. Needed for transfer rules. */
  readonly region: string;
  export(subject: SubjectRef): Promise<PortResult<unknown>>;
  erase(subject: SubjectRef): Promise<PortResult<ErasureReceipt>>;
}

export class PortRegistryError extends Error {}

/** Refuses a registry that cannot be trusted: duplicate ids, or a port that does not say what or where it holds. */
export function createProcessorRegistry(ports: readonly ProcessorPort[]): readonly ProcessorPort[] {
  const seen = new Set<string>();
  for (const p of ports) {
    if (!/^[a-z][a-z0-9-]*$/.test(p.id)) throw new PortRegistryError(`processor id "${p.id}" must be lower-case letters, digits and hyphens`);
    if (seen.has(p.id)) throw new PortRegistryError(`processor "${p.id}" is registered twice`);
    seen.add(p.id);
    if (p.categories.length === 0) throw new PortRegistryError(`processor "${p.id}" must list the data it holds`);
    if (p.region.trim() === '') throw new PortRegistryError(`processor "${p.id}" must say where it stores data`);
  }
  return ports;
}

export interface PortOutcome<T> {
  id: string;
  result: PortResult<T>;
}

export interface RunReport<T> {
  /** True only when every port is `done` or `not_held`. One incomplete port makes this false. */
  complete: boolean;
  outcomes: PortOutcome<T>[];
  /** Ids to retry or chase by hand. */
  incomplete: string[];
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function guarded<T>(run: () => Promise<PortResult<T>>, timeoutMs: number): Promise<PortResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<PortResult<T>>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'incomplete', reason: 'timeout', retry: true }), timeoutMs);
      }),
    ]);
  } catch {
    return { status: 'incomplete', reason: 'failed', retry: true };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function summarise<T>(outcomes: PortOutcome<T>[]): RunReport<T> {
  const incomplete = outcomes.filter((o) => o.result.status === 'incomplete').map((o) => o.id);
  return { complete: incomplete.length === 0, outcomes, incomplete };
}

async function runAll<T>(
  registry: readonly ProcessorPort[],
  call: (p: ProcessorPort) => Promise<PortResult<T>>,
  timeoutMs: number,
): Promise<RunReport<T>> {
  const outcomes = await Promise.all(
    registry.map(async (p) => ({ id: p.id, result: await guarded(() => call(p), timeoutMs) })),
  );
  return summarise(outcomes);
}

/** Erase the subject in every registered tool. Never throws; read `complete`. */
export function eraseEverywhere(
  registry: readonly ProcessorPort[],
  subject: SubjectRef,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RunReport<ErasureReceipt>> {
  return runAll(registry, (p) => p.erase(subject), timeoutMs);
}

/** Export the subject from every registered tool. Never throws; read `complete`. */
export function exportEverywhere(
  registry: readonly ProcessorPort[],
  subject: SubjectRef,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RunReport<unknown>> {
  return runAll(registry, (p) => p.export(subject), timeoutMs);
}
