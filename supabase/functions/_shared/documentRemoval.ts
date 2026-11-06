/**
 * Removing the uploaded FILES of vendor documents whose retention has run out.
 *
 * The database half is `vendor_documents_due()` and `mark_vendor_document_file_removed()`
 * (20261104000007). A SQL function cannot delete a stored file, so a job that can must do it, and
 * the order is the whole safety property: the file goes first, the row is marked removed only after
 * the file is verifiably gone, and `purge_expired_records()` deletes the row only once it is marked.
 * A document whose file survives therefore stays on the due list and keeps being retried; nothing
 * is ever marked on a guess.
 *
 * Pure: the storage and database calls come in through `RemovalStore`, so this runs under Vitest
 * with no Deno and no Supabase. The Edge Function around it supplies the real store.
 */

export interface DueDocument {
  id: string;
  storage_path: string;
}

export interface RemovalStore {
  /** `vendor_documents_due()`. */
  listDue(): Promise<DueDocument[]>;
  /** Delete the object. Resolves whether or not it existed; throws if storage refused. */
  removeFile(path: string): Promise<void>;
  /** True when the object is still in the bucket. Checked AFTER removal, never assumed. */
  fileExists(path: string): Promise<boolean>;
  /** `mark_vendor_document_file_removed(id)`: false when the row is not (or no longer) due. */
  markRemoved(id: string): Promise<boolean>;
}

export interface RemovalReport {
  /** Rows the database said were due, before the batch limit. */
  due: number;
  /** Files confirmed gone and rows marked. */
  removed: number;
  /** Ids left untouched and still due: they will be retried on the next run. */
  failed: string[];
  /** Due rows beyond this run's batch limit; picked up on later runs. */
  deferred: number;
}

/** A run is bounded so one bad day cannot become one very long invocation. */
export const MAX_PER_RUN = 200;

/**
 * A storage key is a relative path inside the bucket. Anything that could address something else
 * is refused rather than passed to storage: an empty key, an absolute path, a `..` segment, a
 * backslash, or a NUL. The database holds these values, but a delete job is the wrong place to
 * trust them.
 */
export function isSafeStoragePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.trim() === '' || path.length > 1024) return false;
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

export async function removeDueDocuments(store: RemovalStore, limit = MAX_PER_RUN): Promise<RemovalReport> {
  const all = await store.listDue();
  const batch = all.slice(0, limit);
  const report: RemovalReport = { due: all.length, removed: 0, failed: [], deferred: all.length - batch.length };

  for (const doc of batch) {
    try {
      if (!isSafeStoragePath(doc.storage_path)) throw new Error('unsafe storage path');
      await store.removeFile(doc.storage_path);
      // "Resolved without error" is not "gone": a wrong bucket or key also resolves cleanly while the
      // real file stays. Look again before saying so.
      if (await store.fileExists(doc.storage_path)) throw new Error('file still present after removal');
      if (!(await store.markRemoved(doc.id))) throw new Error('row is not due');
      report.removed += 1;
    } catch {
      // Id only. The path and the error text can name a vendor, so neither is carried out.
      report.failed.push(doc.id);
    }
  }
  return report;
}
