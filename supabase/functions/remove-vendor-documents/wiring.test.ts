import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raw = read('supabase/functions/remove-vendor-documents/index.ts');
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('remove-vendor-documents wiring', () => {
  it('only answers to the service-role key, because the anon key is also a valid JWT', () => {
    expect(source).toMatch(/sameSecret\(token, serviceKey\)/);
    expect(source).toMatch(/Not allowed'\s*\},\s*401/);
  });

  it('goes through the retention functions and the shared ordering, not its own SQL', () => {
    expect(source).toMatch(/rpc\('vendor_documents_due'\)/);
    expect(source).toMatch(/rpc\('mark_vendor_document_file_removed'/);
    expect(source).toMatch(/removeDueDocuments\(store\)/);
    expect(source).not.toMatch(/\.from\('vendor_documents'\)|\.delete\(\)/);
  });

  it('checks the file is gone before it will say so, in the real bucket', () => {
    expect(source).toMatch(/storage\.from\(BUCKET\)\.list\(/);
    expect(source).toMatch(/BUCKET = 'vendor-documents'/);
  });

  it('does not return error text or ids', () => {
    expect(source).not.toMatch(/message:\s*(e|error)\b/);
    expect(source).toMatch(/failed: report\.failed\.length/);
  });

  it('keeps the platform JWT check on and is part of the deploy', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.remove-vendor-documents\]\s*\nverify_jwt = true/);
    expect(read('scripts/deploy-functions.sh')).toMatch(/for fn in [^;]*\bremove-vendor-documents\b/);
  });
});
