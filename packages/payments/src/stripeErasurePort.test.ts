import { describe, expect, it } from 'vitest';
import { createProcessorRegistry, eraseEverywhere } from '@cvip/types';
import { makeStripeErasurePort, type StripeCustomerClient } from './stripeErasurePort.ts';

function fake(customers: string[], failOn: string[] = []) {
  const deleted: string[] = [];
  const client: StripeCustomerClient = {
    findCustomerIdsByEmail: async () => customers,
    deleteCustomer: async (id) => {
      if (failOn.includes(id)) throw new Error('stripe down');
      deleted.push(id);
    },
    describeCustomers: async (ids) => ({ customers: ids }),
  };
  return { client, deleted };
}
const subject = { userId: 'u1', email: 'a@test.local' };

describe('stripe erasure port', () => {
  it('is a valid registry entry', () => {
    expect(() => createProcessorRegistry([makeStripeErasurePort(fake([]).client)])).not.toThrow();
  });
  it('deletes every matched customer (positive control)', async () => {
    const f = fake(['cus_1', 'cus_2']);
    const r = await makeStripeErasurePort(f.client).erase(subject);
    expect(f.deleted).toEqual(['cus_1', 'cus_2']);
    expect(r).toMatchObject({ status: 'done' });
    expect(JSON.stringify(r)).toMatch(/retention/);
  });
  it('not_held when no customer matches', async () => {
    expect(await makeStripeErasurePort(fake([]).client).erase(subject)).toEqual({ status: 'not_held' });
  });
  it('not_held and no lookup when the guest has no email', async () => {
    let looked = false;
    const client = { ...fake(['cus_1']).client, findCustomerIdsByEmail: async () => { looked = true; return ['cus_1']; } };
    expect(await makeStripeErasurePort(client).erase({ userId: 'u1', email: '  ' })).toEqual({ status: 'not_held' });
    expect(looked).toBe(false);
  });
  it('one failed delete is incomplete, and the others are still deleted', async () => {
    const f = fake(['cus_1', 'cus_2'], ['cus_1']);
    const r = await makeStripeErasurePort(f.client).erase(subject);
    expect(r).toEqual({ status: 'incomplete', reason: 'failed', retry: true });
    expect(f.deleted).toEqual(['cus_2']);
  });
  it('a failing lookup makes the whole run incomplete, never complete', async () => {
    const client = { ...fake([]).client, findCustomerIdsByEmail: async () => { throw new Error('x'); } };
    const report = await eraseEverywhere([makeStripeErasurePort(client)], subject);
    expect(report.complete).toBe(false);
    expect(report.incomplete).toEqual(['stripe']);
  });
  it('exports what Stripe holds', async () => {
    const r = await makeStripeErasurePort(fake(['cus_1']).client).export(subject);
    expect(r).toEqual({ status: 'done', value: { customers: ['cus_1'] } });
  });
});
