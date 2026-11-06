import { describe, expect, it } from 'vitest';
import { MAX_PER_RUN, isSafeStoragePath, removeDueDocuments, type DueDocument, type RemovalStore } from './documentRemoval';

/** An in-memory bucket and ledger, so the ORDER of calls and what survives a failure can be asserted. */
function fakeStore(due: DueDocument[], opts: { bucket?: Set<string>; removeThrows?: Set<string>; removeNoop?: Set<string>; markFalse?: Set<string> } = {}) {
  const bucket = opts.bucket ?? new Set(due.map((d) => d.storage_path));
  const marked: string[] = [];
  const calls: string[] = [];
  const store: RemovalStore = {
    listDue: async () => due,
    removeFile: async (p) => {
      calls.push(`remove:${p}`);
      if (opts.removeThrows?.has(p)) throw new Error('storage refused');
      if (!opts.removeNoop?.has(p)) bucket.delete(p);
    },
    fileExists: async (p) => {
      calls.push(`exists:${p}`);
      return bucket.has(p);
    },
    markRemoved: async (id) => {
      calls.push(`mark:${id}`);
      if (opts.markFalse?.has(id)) return false;
      marked.push(id);
      return true;
    },
  };
  return { store, bucket, marked, calls };
}

const doc = (n: number): DueDocument => ({ id: `d${n}`, storage_path: `vendor-${n}/licence.pdf` });

describe('removeDueDocuments', () => {
  it('removes the file, confirms it is gone, then marks the row, in that order (positive control)', async () => {
    const { store, marked, calls, bucket } = fakeStore([doc(1)]);
    const report = await removeDueDocuments(store);
    expect(report).toEqual({ due: 1, removed: 1, failed: [], deferred: 0 });
    expect(calls).toEqual(['remove:vendor-1/licence.pdf', 'exists:vendor-1/licence.pdf', 'mark:d1']);
    expect(marked).toEqual(['d1']);
    expect(bucket.size).toBe(0);
  });

  it('never marks a row whose file storage refused to delete, and keeps going with the rest', async () => {
    const { store, marked } = fakeStore([doc(1), doc(2)], { removeThrows: new Set([doc(1).storage_path]) });
    const report = await removeDueDocuments(store);
    expect(report.failed).toEqual(['d1']);
    expect(report.removed).toBe(1);
    expect(marked).toEqual(['d2']);
  });

  it('never marks a row when removal "succeeds" but the file is still there (wrong bucket or key)', async () => {
    const { store, marked, bucket } = fakeStore([doc(1)], { removeNoop: new Set([doc(1).storage_path]) });
    const report = await removeDueDocuments(store);
    expect(report.failed).toEqual(['d1']);
    expect(marked).toEqual([]);
    expect(bucket.has(doc(1).storage_path)).toBe(true);
  });

  it('treats a file that was already gone as removed, so a half-finished earlier run completes', async () => {
    const { store, marked } = fakeStore([doc(1)], { bucket: new Set() });
    const report = await removeDueDocuments(store);
    expect(report.removed).toBe(1);
    expect(marked).toEqual(['d1']);
  });

  it('reports a row the database no longer calls due as failed, not removed', async () => {
    const { store } = fakeStore([doc(1)], { markFalse: new Set(['d1']) });
    const report = await removeDueDocuments(store);
    expect(report).toMatchObject({ removed: 0, failed: ['d1'] });
  });

  it('never calls storage with an unsafe key', async () => {
    const bad = ['', '/abs/x.pdf', '../other/x.pdf', 'a/../b.pdf', 'a//b.pdf', 'a\\b.pdf', 'a/./b.pdf'];
    const { store, calls, marked } = fakeStore(bad.map((p, i) => ({ id: `b${i}`, storage_path: p })), { bucket: new Set() });
    const report = await removeDueDocuments(store);
    expect(report.failed).toHaveLength(bad.length);
    expect(calls).toEqual([]);
    expect(marked).toEqual([]);
  });

  it('bounds a run and says how many it left for the next one', async () => {
    const many = Array.from({ length: 5 }, (_, i) => doc(i));
    const { store, marked } = fakeStore(many);
    const report = await removeDueDocuments(store, 2);
    expect(report).toEqual({ due: 5, removed: 2, failed: [], deferred: 3 });
    expect(marked).toEqual(['d0', 'd1']);
    expect(MAX_PER_RUN).toBeGreaterThan(0);
  });

  it('carries ids out of a failure, never paths or error text', async () => {
    const { store } = fakeStore([doc(1)], { removeThrows: new Set([doc(1).storage_path]) });
    const report = await removeDueDocuments(store);
    expect(JSON.stringify(report)).not.toMatch(/licence|vendor-1|refused/);
  });
});

describe('isSafeStoragePath', () => {
  it('accepts an ordinary bucket-relative key and refuses everything addressing elsewhere', () => {
    expect(isSafeStoragePath('4f9c/entity_proof/2026-01-01.pdf')).toBe(true);
    for (const p of ['', '  ', '/x', '..', '../x', 'a/..', 'a//b', 'a\\b', 'a\0b', null, undefined, 42, 'x'.repeat(1025)]) {
      expect(isSafeStoragePath(p)).toBe(false);
    }
  });
});
