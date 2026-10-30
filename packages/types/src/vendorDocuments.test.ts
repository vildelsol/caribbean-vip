import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_REQUIREMENTS,
  DocumentInvalid,
  approvalReadiness,
  daysUntil,
  documentRequirementsFor,
  parseDocumentUpload,
  requirementStatuses,
  safeFileName,
  type DocumentRecord,
} from './vendorDocuments.ts';
import type { IslandCode } from './domain.ts';
import { VENDOR_BUSINESS_TYPES } from './vendor.ts';

const NOW = new Date('2026-10-29T12:00:00Z');
const ISLANDS: IslandCode[] = ['JM', 'BB', 'KY'];
const keysFor = (island: IslandCode, type: Parameters<typeof documentRequirementsFor>[1]) =>
  documentRequirementsFor(island, type).map((r) => r.key);

describe('registry integrity', () => {
  it('has unique keys in a safe format', () => {
    const keys = DOCUMENT_REQUIREMENTS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    // vendor_documents.kind has a format check in the database; keep this the same shape.
    for (const k of keys) expect(k).toMatch(/^[a-z0-9_.]{1,80}$/);
  });

  it('gives every island and business type the platform standard', () => {
    for (const island of ISLANDS) {
      for (const { id } of VENDOR_BUSINESS_TYPES) {
        const keys = keysFor(island, id);
        for (const k of ['entity_proof', 'owner_id', 'public_liability', 'bank_proof']) {
          expect(keys, `${island}/${id} lacks ${k}`).toContain(k);
        }
      }
    }
  });

  it('prefixes island-specific keys with the island', () => {
    for (const r of DOCUMENT_REQUIREMENTS) {
      if (r.islands !== 'all' && r.islands.length === 1 && r.key.includes('.')) {
        expect(r.key.startsWith(`${r.islands[0]!.toLowerCase()}.`)).toBe(true);
      }
    }
  });
});

describe('documentRequirementsFor', () => {
  it('asks a Jamaican water sports vendor for the TPDCo licence and vessel papers, not a tour licence', () => {
    const keys = keysFor('JM', 'water');
    expect(keys).toContain('jm.water_sports_licence');
    expect(keys).toContain('jm.vessel_certificates');
    expect(keys).not.toContain('jm.tour_operator_licence');
  });

  it('asks a Jamaican tour vendor for the tour licence and guide certification', () => {
    const keys = keysFor('JM', 'tour');
    expect(keys).toContain('jm.tour_operator_licence');
    expect(keys).toContain('jm.guide_certification');
    expect(keys).not.toContain('jm.water_sports_licence');
  });

  it('keeps one island\'s licences off another island\'s vendors', () => {
    for (const k of keysFor('KY', 'tour')) expect(k.startsWith('jm.') || k.startsWith('bb.')).toBe(false);
    for (const k of keysFor('BB', 'tour')) expect(k.startsWith('jm.') || k.startsWith('ky.')).toBe(false);
  });

  it('asks every Cayman vendor for a Trade and Business licence, and no one else', () => {
    expect(keysFor('KY', 'retail')).toContain('ky.trade_business_licence');
    expect(keysFor('JM', 'retail')).not.toContain('ky.trade_business_licence');
  });

  it('does not apply activity licences to a vendor with no business type', () => {
    expect(keysFor('JM', null).some((k) => k.startsWith('jm.'))).toBe(false);
  });

  it('flags the Barbados licence set as awaiting counsel', () => {
    for (const r of documentRequirementsFor('BB', 'tour').filter((x) => x.key.startsWith('bb.'))) {
      expect(r.confirmWithCounsel).toBe(true);
    }
  });
});

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  kind: 'owner_id',
  reviewState: 'accepted',
  expiresOn: '2027-01-01',
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});
const owner = DOCUMENT_REQUIREMENTS.find((r) => r.key === 'owner_id')!;
const stateOf = (docs: DocumentRecord[]) => requirementStatuses([owner], docs, NOW)[0]!;

describe('requirementStatuses', () => {
  it('reports a missing document', () => {
    expect(stateOf([]).state).toBe('missing');
  });

  it('reports each review state', () => {
    expect(stateOf([doc({ reviewState: 'pending' })]).state).toBe('pending');
    expect(stateOf([doc({ reviewState: 'rejected' })]).state).toBe('rejected');
    expect(stateOf([doc()]).state).toBe('accepted');
  });

  it('lets the newest document decide, so a rejected renewal is not masked by an old accepted one', () => {
    const s = stateOf([
      doc({ reviewState: 'accepted', createdAt: '2026-01-01T00:00:00Z' }),
      doc({ reviewState: 'rejected', createdAt: '2026-10-20T00:00:00Z' }),
    ]);
    expect(s.state).toBe('rejected');
  });

  it('turns an accepted document into expired the day after it lapses, not on the day', () => {
    expect(stateOf([doc({ expiresOn: '2026-10-29' })]).state).toBe('accepted');
    expect(stateOf([doc({ expiresOn: '2026-10-28' })]).state).toBe('expired');
  });

  it('warns 28 days out, not 29', () => {
    expect(stateOf([doc({ expiresOn: '2026-11-26' })]).expiringSoon).toBe(true);
    expect(stateOf([doc({ expiresOn: '2026-11-27' })]).expiringSoon).toBe(false);
    expect(daysUntil('2026-11-26', NOW)).toBe(28);
  });

  it('does not warn about a document that is not yet accepted', () => {
    expect(stateOf([doc({ reviewState: 'pending', expiresOn: '2026-10-30' })]).expiringSoon).toBe(false);
  });
});

describe('approvalReadiness', () => {
  const reqs = documentRequirementsFor('JM', 'water');
  const accept = (kind: string): DocumentRecord => doc({ kind });

  it('blocks until every required item is accepted', () => {
    const none = approvalReadiness(requirementStatuses(reqs, [], NOW));
    expect(none.ready).toBe(false);
    expect(none.blocking.length).toBe(reqs.filter((r) => r.level === 'required').length);
  });

  it('is ready once all required items are accepted, whatever conditional items say (positive control)', () => {
    const docs = reqs.filter((r) => r.level === 'required').map((r) => accept(r.key));
    const r = approvalReadiness(requirementStatuses(reqs, docs, NOW));
    expect(r.ready).toBe(true);
    expect(r.toConfirm.length).toBeGreaterThan(0);
  });

  it('is not ready if one required document has expired', () => {
    const docs = reqs
      .filter((r) => r.level === 'required')
      .map((r) => accept(r.key))
      .map((d) => (d.kind === 'jm.water_sports_licence' ? { ...d, expiresOn: '2026-01-01' } : d));
    expect(approvalReadiness(requirementStatuses(reqs, docs, NOW)).ready).toBe(false);
  });

  it('is not ready if a required document is only pending', () => {
    const docs = reqs
      .filter((r) => r.level === 'required')
      .map((r) => doc({ kind: r.key, reviewState: r.key === 'owner_id' ? 'pending' : 'accepted' }));
    expect(approvalReadiness(requirementStatuses(reqs, docs, NOW)).ready).toBe(false);
  });
});

const licence = DOCUMENT_REQUIREMENTS.find((r) => r.key === 'jm.water_sports_licence')!;
const pdf = { name: 'licence.pdf', size: 1024, type: 'application/pdf' };

describe('parseDocumentUpload', () => {
  const ok = { requirement: licence, file: pdf, documentNumber: ' WS-123 ', expiresOn: '2027-04-30', now: NOW };

  it('accepts a good upload and trims the number', () => {
    expect(parseDocumentUpload(ok)).toEqual({ documentNumber: 'WS-123', expiresOn: '2027-04-30' });
  });

  it.each([
    ['a Word file', { file: { ...pdf, type: 'application/msword' } }],
    ['an empty file', { file: { ...pdf, size: 0 } }],
    ['a file over 10 MB', { file: { ...pdf, size: 10 * 1024 * 1024 + 1 } }],
    ['a missing number on a numbered licence', { documentNumber: '  ' }],
    ['a missing expiry on an expiring licence', { expiresOn: '' }],
    ['a malformed expiry', { expiresOn: '30/04/2027' }],
    ['an expiry in the past', { expiresOn: '2026-10-28' }],
  ])('refuses %s', (_name, over) => {
    expect(() => parseDocumentUpload({ ...ok, ...over })).toThrow(DocumentInvalid);
  });

  it('does not ask for a number or expiry on a document that has neither', () => {
    const bank = DOCUMENT_REQUIREMENTS.find((r) => r.key === 'bank_proof')!;
    expect(parseDocumentUpload({ ...ok, requirement: bank, documentNumber: '', expiresOn: '' })).toEqual({
      documentNumber: null,
      expiresOn: null,
    });
  });
});

describe('safeFileName', () => {
  it('strips path separators and odd characters', () => {
    const traversal = safeFileName('../../etc/pass wd.pdf');
    // The bucket policy reads the first folder of the path; a name must never add one.
    expect(traversal).not.toMatch(/[\\/]/);
    expect(traversal.startsWith('.')).toBe(false);
    expect(safeFileName('licence (final) é.pdf')).not.toMatch(/[^\w.\-]/);
  });
  it('never returns an empty name', () => {
    expect(safeFileName('///')).toBe('_');
    expect(safeFileName('...')).toBe('document');
  });
});
