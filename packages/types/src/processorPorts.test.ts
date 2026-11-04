import { describe, expect, it } from 'vitest';
import {
  PortRegistryError,
  createProcessorRegistry,
  eraseEverywhere,
  exportEverywhere,
  type PortResult,
  type ProcessorPort,
} from './processorPorts.ts';

const subject = { userId: 'u1', email: 'a@test.local' };

function port(id: string, over: Partial<ProcessorPort> = {}, erase?: () => Promise<PortResult<{ summary: string }>>): ProcessorPort {
  return {
    id,
    displayName: id,
    kind: 'other',
    categories: ['email'],
    region: 'us-east-1',
    export: async () => ({ status: 'done', value: { id } }),
    erase: erase ?? (async () => ({ status: 'done', value: { summary: `erased in ${id}` } })),
    ...over,
  };
}

describe('createProcessorRegistry', () => {
  it('accepts well-formed ports (positive control)', () => {
    expect(createProcessorRegistry([port('stripe'), port('supabase')]).map((p) => p.id)).toEqual(['stripe', 'supabase']);
  });
  it('refuses a duplicate id', () => {
    expect(() => createProcessorRegistry([port('stripe'), port('stripe')])).toThrow(PortRegistryError);
  });
  it('refuses a port that does not say what it holds or where', () => {
    expect(() => createProcessorRegistry([port('a', { categories: [] })])).toThrow(/list the data/);
    expect(() => createProcessorRegistry([port('a', { region: ' ' })])).toThrow(/where/);
  });
  it('refuses a badly formed id', () => {
    expect(() => createProcessorRegistry([port('Stripe!')])).toThrow(/lower-case/);
  });
});

describe('eraseEverywhere', () => {
  it('is complete only when every tool finished (positive control)', async () => {
    const r = await eraseEverywhere(createProcessorRegistry([port('a'), port('b')]), subject);
    expect(r.complete).toBe(true);
    expect(r.incomplete).toEqual([]);
  });
  it('treats a tool that never held the person as fine', async () => {
    const r = await eraseEverywhere([port('a', {}, async () => ({ status: 'not_held' }))], subject);
    expect(r.complete).toBe(true);
  });
  it('is incomplete when one tool cannot erase, and names it', async () => {
    const r = await eraseEverywhere(
      [port('a'), port('b', {}, async () => ({ status: 'incomplete', reason: 'unsupported', retry: false }))],
      subject,
    );
    expect(r.complete).toBe(false);
    expect(r.incomplete).toEqual(['b']);
  });
  it('turns a throw into an incomplete result instead of failing the whole run', async () => {
    const r = await eraseEverywhere(
      [port('a'), port('b', {}, async () => { throw new Error('boom'); })],
      subject,
    );
    expect(r.complete).toBe(false);
    expect(r.outcomes.find((o) => o.id === 'a')?.result.status).toBe('done');
    expect(r.outcomes.find((o) => o.id === 'b')?.result).toEqual({ status: 'incomplete', reason: 'failed', retry: true });
  });
  it('turns a hang into a timeout, so one slow tool cannot stall the rest', async () => {
    const r = await eraseEverywhere([port('slow', {}, () => new Promise(() => {}))], subject, 20);
    expect(r.complete).toBe(false);
    expect(r.outcomes[0]?.result).toEqual({ status: 'incomplete', reason: 'timeout', retry: true });
  });
  it('an empty registry is complete, so the caller must register what it uses', async () => {
    expect((await eraseEverywhere([], subject)).complete).toBe(true);
  });
});

describe('exportEverywhere', () => {
  it('collects each tool under its own id', async () => {
    const r = await exportEverywhere([port('a'), port('b')], subject);
    expect(r.outcomes.map((o) => o.id)).toEqual(['a', 'b']);
    expect(r.complete).toBe(true);
  });
  it('reports a failing export instead of dropping it', async () => {
    const r = await exportEverywhere([port('a', { export: async () => { throw new Error('x'); } })], subject);
    expect(r.complete).toBe(false);
  });
});
