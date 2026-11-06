/**
 * remove-vendor-documents: delete the uploaded files of vendor documents past retention.
 *
 * POST (no body)   Authorization: Bearer <the service-role key>
 * -> { ok: true, due, removed, failed: number, deferred } | { ok: false, message } with 401 / 405 / 500
 *
 * A scheduled job, not something a person or a browser calls. `verify_jwt = true` is not enough to
 * guard it, because the publishable anon key is also a valid JWT, so the bearer is compared with the
 * service-role key itself. The ordering rule (file first, row marked only after the file is verified
 * gone) lives in `_shared/documentRemoval.ts`. Failed ids are logged, never returned.
 */

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { bearerToken } from '../_shared/callerIdentity.ts';
import { removeDueDocuments, type RemovalStore } from '../_shared/documentRemoval.ts';
import { sameSecret } from '../_shared/sameSecret.ts';

const BUCKET = 'vendor-documents';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const token = bearerToken(req.headers.get('Authorization'));
  if (!serviceKey || !token || !sameSecret(token, serviceKey)) return json({ ok: false, message: 'Not allowed' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const store: RemovalStore = {
    async listDue() {
      const { data, error } = await supabase.rpc('vendor_documents_due');
      if (error) throw new Error(`vendor_documents_due: ${error.message}`);
      return (data ?? []) as { id: string; storage_path: string }[];
    },
    async removeFile(path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw new Error(`storage remove: ${error.message}`);
    },
    async fileExists(path) {
      const slash = path.lastIndexOf('/');
      const folder = slash === -1 ? '' : path.slice(0, slash);
      const name = path.slice(slash + 1);
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 100 });
      if (error) throw new Error(`storage list: ${error.message}`);
      return (data ?? []).some((o) => o.name === name);
    },
    async markRemoved(id) {
      const { data, error } = await supabase.rpc('mark_vendor_document_file_removed', { p_id: id });
      if (error) throw new Error(`mark_vendor_document_file_removed: ${error.message}`);
      return data === true;
    },
  };

  try {
    const report = await removeDueDocuments(store);
    if (report.failed.length > 0) console.error('remove-vendor-documents: left for retry', report.failed.join(','));
    return json({ ok: true, due: report.due, removed: report.removed, failed: report.failed.length, deferred: report.deferred });
  } catch (e) {
    // Logged, never returned: error text can name tables and keys.
    console.error('remove-vendor-documents failed', e instanceof Error ? e.message : e);
    return json({ ok: false, message: 'Could not run the removal job' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
